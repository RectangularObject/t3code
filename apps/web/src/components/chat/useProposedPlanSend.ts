import {
  AuthOrchestrationOperateScope,
  type EnvironmentContextRecord,
  type EnvironmentId,
  type ModelSelection,
  type PreviewAnnotationPayload,
  type ProviderInteractionMode,
  type ResponseContextRecord,
  type RuntimeMode,
  type ScopedThreadRef,
  type ThreadContextRecord,
  type ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { truncate } from "@t3tools/shared/String";
import { useNavigate } from "@tanstack/react-router";
import { msg } from "gt-react";
import type { Dispatch, SetStateAction } from "react";
import { m } from "~/i18n/messages";
import { newMessageId, newThreadId } from "~/lib/utils";
import { parseStandaloneComposerSlashCommand } from "../../composer-logic";
import {
  composerDraftHasUserContent,
  useComposerDraftStore,
  type ComposerThreadTarget,
} from "../../composerDraftStore";
import type { ComposerHandleRef } from "../../composerHandleContext";
import { threadHasStarted } from "../../lib/chatThreadActions";
import { buildMessageContext } from "../../lib/composerContextRecords";
import type { TerminalContextDraft } from "../../lib/terminalContext";
import {
  buildPlanImplementationPrompt,
  buildPlanImplementationThreadTitle,
  resolvePlanFollowUpSubmission,
  type LatestProposedPlanState,
} from "../../proposedPlan";
import type { ReviewCommentContext } from "../../reviewCommentContext";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { readEnvironmentScope } from "../../state/session";
import { environmentThreadShells, threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { waitForAtomValue } from "../../state/waitForAtomValue";
import { buildThreadRouteParams } from "../../threadRoutes";
import type { ChatMessage } from "../../types";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { formatOutgoingPrompt, type makeThreadErrorSetter } from "../ChatView.logic";
import type { ComposerSubmissionIntent } from "../../composer-logic";
import { draftSendState } from "./chatViewSend";
import { restorePlanFollowUpComposer } from "./planMode.logic";
import type { useLocalDispatchState } from "./useLocalDispatchState";
import type { useTimelineFollow } from "./useTimelineFollow";

type LocalDispatchState = ReturnType<typeof useLocalDispatchState>;
type SendContext = ReturnType<NonNullable<ComposerHandleRef["current"]>["getSendContext"]>;

function waitForStartedServerThread(threadRef: ScopedThreadRef, timeoutMs = 1_000) {
  return waitForAtomValue({
    registry: appAtomRegistry,
    atom: environmentThreadShells.threadShellAtom(threadRef),
    predicate: threadHasStarted,
    timeoutMs,
  });
}

interface PlanSendBase {
  readonly environmentId: EnvironmentId;
  readonly routeThreadKey: string;
  readonly activeThread: EnvironmentThreadShell | undefined;
  readonly activeProposedPlan: LatestProposedPlanState | null;
  readonly isServerThread: boolean;
  readonly isSendBusy: boolean;
  readonly composerRef: ComposerHandleRef;
  readonly beginLocalDispatch: LocalDispatchState["beginLocalDispatch"];
  readonly resetLocalDispatch: LocalDispatchState["resetLocalDispatch"];
}

interface PlanModeComposerSendInput extends PlanSendBase {
  readonly currentRouteThreadKeyRef: { readonly current: string | null };
  readonly composerDraftTarget: ComposerThreadTarget;
  readonly promptRef: { current: string };
  readonly composerTerminalContextsRef: { current: TerminalContextDraft[] };
  readonly showPlanFollowUpPrompt: boolean;
  readonly runtimeMode: RuntimeMode;
  readonly localCheckoutBranchMismatch: { readonly currentBranch: string } | null;
  readonly setOptimisticUserMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  readonly setThreadError: ReturnType<typeof makeThreadErrorSetter>;
  readonly anchorNewTurn: ReturnType<typeof useTimelineFollow>["anchorNewTurn"];
  readonly handleInteractionModeChange: (mode: ProviderInteractionMode) => void;
  readonly handleNewThreadInActiveProject: () => void;
  readonly persistThreadSettingsForNextTurn: (input: {
    threadId: ThreadId;
    createdAt: string;
    branch?: string;
    runtimeMode: RuntimeMode;
    interactionMode: ProviderInteractionMode;
  }) => Promise<AtomCommandResult<void, unknown>>;
}

/** What the composer send path knows about a message when it asks plan mode to take it. */
export interface PlanModeSubmission {
  readonly sendCtx: SendContext;
  readonly promptForSend: string;
  readonly trimmed: string;
  readonly composerHoldsOnlyText: boolean;
  readonly hasAttachments: boolean;
  readonly terminalContexts: ReadonlyArray<TerminalContextDraft>;
  readonly reviewComments: ReadonlyArray<ReviewCommentContext>;
  readonly previewAnnotations: ReadonlyArray<PreviewAnnotationPayload>;
  readonly threadContexts: ReadonlyArray<ThreadContextRecord>;
  readonly environmentContexts: ReadonlyArray<EnvironmentContextRecord>;
  readonly replyTo: ResponseContextRecord | null;
  readonly submissionIntent: ComposerSubmissionIntent;
  /** A direct annotation or an armed fresh session is a regular send, never a plan answer. */
  readonly regularSendOnly: boolean;
}

/**
 * The plan-mode branches of a composer send: answering a ready plan (refine or implement) and
 * the standalone `/plan` and `/default` commands. Resolves true when plan mode took the send.
 */
export function usePlanModeComposerSend(input: PlanModeComposerSendInput) {
  const {
    routeThreadKey,
    currentRouteThreadKeyRef,
    composerDraftTarget,
    promptRef,
    composerTerminalContextsRef,
    composerRef,
    activeProposedPlan,
    showPlanFollowUpPrompt,
    handleInteractionModeChange,
    handleNewThreadInActiveProject,
  } = input;
  const submitPlanFollowUp = usePlanFollowUpSend(input);
  const setPrompt = useComposerDraftStore((store) => store.setPrompt);
  const setTerminalContexts = useComposerDraftStore((store) => store.setTerminalContexts);
  const setReviewComments = useComposerDraftStore((store) => store.setReviewComments);
  const setPreviewAnnotations = useComposerDraftStore((store) => store.setPreviewAnnotations);
  const setThreadContexts = useComposerDraftStore((store) => store.setThreadContexts);
  const setEnvironmentContexts = useComposerDraftStore((store) => store.setEnvironmentContexts);
  const clearComposerContent = useComposerDraftStore((store) => store.clearComposerContent);

  const clearComposer = () => {
    promptRef.current = "";
    clearComposerContent(composerDraftTarget);
    composerRef.current?.resetCursorState();
  };

  return async (submission: PlanModeSubmission): Promise<boolean> => {
    const { sendCtx } = submission;
    if (!sendCtx.interactionModeEnabled) return false;
    if (
      !submission.regularSendOnly &&
      showPlanFollowUpPrompt &&
      activeProposedPlan &&
      !submission.hasAttachments
    ) {
      const followUp = resolvePlanFollowUpSubmission({
        draftText: submission.promptForSend,
        planMarkdown: activeProposedPlan.planMarkdown,
      });
      const outgoingText = formatOutgoingPrompt({
        provider: sendCtx.selectedProvider,
        model: sendCtx.selectedModel,
        models: sendCtx.selectedProviderModels,
        effort: sendCtx.selectedPromptEffort,
        text: followUp.text.trim(),
      });
      if (composerRef.current?.validateProviderInput(outgoingText) === false) return true;
      const snapshot = {
        prompt: promptRef.current,
        terminalContexts: [...submission.terminalContexts],
        reviewComments: [...submission.reviewComments],
        previewAnnotations: [...submission.previewAnnotations],
        threadContexts: [...submission.threadContexts],
        environmentContexts: [...submission.environmentContexts],
      };
      clearComposer();
      const sent = await submitPlanFollowUp({
        text: followUp.text,
        context: buildMessageContext({ ...snapshot, replyTo: submission.replyTo }),
        interactionMode: followUp.interactionMode,
      });
      const routeIsCurrent = currentRouteThreadKeyRef.current === routeThreadKey;
      if (!sent) {
        restorePlanFollowUpComposer({
          snapshot,
          draftHasUserContent: composerDraftHasUserContent(
            useComposerDraftStore.getState().getComposerDraft(composerDraftTarget),
          ),
          routeIsCurrent,
          writeComposerRefs: (restored) => {
            promptRef.current = restored.prompt;
            composerTerminalContextsRef.current = [...restored.terminalContexts];
          },
          writePrompt: (prompt) => setPrompt(composerDraftTarget, prompt),
          writeTerminalContexts: (contexts) =>
            setTerminalContexts(composerDraftTarget, [...contexts]),
          writeReviewComments: (comments) => setReviewComments(composerDraftTarget, [...comments]),
          writePreviewAnnotations: (annotations) =>
            setPreviewAnnotations(composerDraftTarget, [...annotations]),
          writeThreadContexts: (records) => setThreadContexts(composerDraftTarget, [...records]),
          writeEnvironmentContexts: (records) =>
            setEnvironmentContexts(composerDraftTarget, [...records]),
          resetCursor: (options) => composerRef.current?.resetCursorState(options),
        });
      } else if (submission.submissionIntent === "background" && routeIsCurrent) {
        handleNewThreadInActiveProject();
      }
      return true;
    }
    const command = submission.composerHoldsOnlyText
      ? parseStandaloneComposerSlashCommand(submission.trimmed)
      : null;
    if (command === null || sendCtx.multipleModelSelections !== null) return false;
    handleInteractionModeChange(command);
    clearComposer();
    return true;
  };
}

/**
 * Answers a proposed plan on this thread: refine it in plan mode, or implement it here
 * (which links the turn to the plan). Resolves whether the turn started.
 */
function usePlanFollowUpSend(input: PlanModeComposerSendInput) {
  const {
    environmentId,
    routeThreadKey,
    activeThread,
    activeProposedPlan,
    isServerThread,
    isSendBusy,
    composerRef,
    beginLocalDispatch,
    resetLocalDispatch,
    runtimeMode,
    localCheckoutBranchMismatch,
    setOptimisticUserMessages,
    setThreadError,
    anchorNewTurn,
    persistThreadSettingsForNextTurn,
  } = input;
  const startThreadTurn = useOrchestrationCommand(threadEnvironment.startTurn, {
    reportFailure: false,
  });
  const setComposerDraftInteractionMode = useComposerDraftStore(
    (store) => store.setInteractionMode,
  );
  const { sendInFlight: sendInFlightRef } = draftSendState(routeThreadKey);

  return async function submitPlanFollowUp({
    text,
    context,
    interactionMode: nextInteractionMode,
  }: {
    text: string;
    context?: ReturnType<typeof buildMessageContext>;
    interactionMode: "default" | "plan";
  }) {
    if (
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope) ||
      !activeThread ||
      !isServerThread ||
      isSendBusy ||
      sendInFlightRef.current
    ) {
      return false;
    }

    const trimmed = text.trim();
    if (!trimmed) return false;

    const sendCtx = composerRef.current?.getSendContext();
    if (!sendCtx?.providerAvailable || !sendCtx.interactionModeEnabled) return false;

    const threadIdForSend = activeThread.id;
    const messageIdForSend = newMessageId();
    const messageCreatedAt = new Date().toISOString();
    const outgoingMessageText = formatOutgoingPrompt({
      provider: sendCtx.selectedProvider,
      model: sendCtx.selectedModel,
      models: sendCtx.selectedProviderModels,
      effort: sendCtx.selectedPromptEffort,
      text: trimmed,
    });

    sendInFlightRef.current = true;
    beginLocalDispatch({ preparingWorktree: false });
    setThreadError(threadIdForSend, null);

    anchorNewTurn(
      scopedThreadKey(scopeThreadRef(activeThread.environmentId, threadIdForSend)),
      messageIdForSend,
    );

    setOptimisticUserMessages((existing) => [
      ...existing,
      {
        id: messageIdForSend,
        role: "user",
        text: outgoingMessageText,
        ...(context ? { context } : {}),
        runId: null,
        createdAt: messageCreatedAt,
        updatedAt: messageCreatedAt,
        streaming: false,
      },
    ]);

    const settingsResult = await persistThreadSettingsForNextTurn({
      threadId: threadIdForSend,
      createdAt: messageCreatedAt,
      ...(localCheckoutBranchMismatch ? { branch: localCheckoutBranchMismatch.currentBranch } : {}),
      runtimeMode,
      interactionMode: nextInteractionMode,
    });
    let failure: AtomCommandResult<unknown, unknown> | null =
      settingsResult._tag === "Failure" ? settingsResult : null;

    if (failure === null) {
      setComposerDraftInteractionMode(
        scopeThreadRef(activeThread.environmentId, threadIdForSend),
        nextInteractionMode,
      );

      const startResult = await startThreadTurn({
        environmentId,
        input: {
          threadId: threadIdForSend,
          message: {
            messageId: messageIdForSend,
            role: "user",
            text: outgoingMessageText,
            ...(context ? { context } : {}),
            attachments: [],
          },
          modelSelection: sendCtx.selectedModelSelection,
          titleSeed: activeThread.title,
          runtimeMode,
          interactionMode: nextInteractionMode,
          ...(nextInteractionMode === "default" && activeProposedPlan
            ? {
                sourceProposedPlan: {
                  threadId: activeThread.id,
                  planId: activeProposedPlan.id,
                },
              }
            : {}),
          createdAt: messageCreatedAt,
        },
      });
      failure = startResult._tag === "Failure" ? startResult : null;
    }

    sendInFlightRef.current = false;
    resetLocalDispatch();
    if (failure === null) return true;

    setOptimisticUserMessages((existing) =>
      existing.filter((message) => message.id !== messageIdForSend),
    );
    if (!isAtomCommandInterrupted(failure)) {
      const error = squashAtomCommandFailure(failure);
      setThreadError(
        threadIdForSend,
        error instanceof Error ? error.message : m(msg("Failed to send plan follow-up.")),
      );
    }
    return false;
  };
}

interface ImplementPlanInNewThreadInput extends PlanSendBase {
  readonly activeThreadBranch: string | null;
  readonly activeProject: EnvironmentProject | null;
  readonly activeEnvironmentUnavailable: boolean;
  readonly defaultRuntimeMode: RuntimeMode;
}

/**
 * Starts a fresh thread that implements the active proposed plan, then opens it. The new
 * thread is deleted again if it cannot be started or opened.
 */
export function useImplementPlanInNewThread(input: ImplementPlanInNewThreadInput) {
  const {
    environmentId,
    routeThreadKey,
    activeThread,
    activeThreadBranch,
    activeProposedPlan,
    isServerThread,
    isSendBusy,
    composerRef,
    beginLocalDispatch,
    resetLocalDispatch,
    activeProject,
    activeEnvironmentUnavailable,
    defaultRuntimeMode,
  } = input;
  const navigate = useNavigate();
  const createThread = useOrchestrationCommand(threadEnvironment.create, { reportFailure: false });
  const deleteThread = useOrchestrationCommand(threadEnvironment.delete, { reportFailure: false });
  const startThreadTurn = useOrchestrationCommand(threadEnvironment.startTurn, {
    reportFailure: false,
  });
  const { sendInFlight: sendInFlightRef } = draftSendState(routeThreadKey);

  return async () => {
    if (
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope) ||
      !activeThread ||
      !activeProject ||
      !activeProposedPlan ||
      !isServerThread ||
      isSendBusy ||
      activeEnvironmentUnavailable ||
      sendInFlightRef.current
    ) {
      return;
    }

    const sendCtx = composerRef.current?.getSendContext();
    if (!sendCtx?.providerAvailable || !sendCtx.interactionModeEnabled) return;

    const createdAt = new Date().toISOString();
    const nextThreadId = newThreadId();
    const nextThreadRef = scopeThreadRef(activeThread.environmentId, nextThreadId);
    const planMarkdown = activeProposedPlan.planMarkdown;
    const outgoingImplementationPrompt = formatOutgoingPrompt({
      provider: sendCtx.selectedProvider,
      model: sendCtx.selectedModel,
      models: sendCtx.selectedProviderModels,
      effort: sendCtx.selectedPromptEffort,
      text: buildPlanImplementationPrompt(planMarkdown),
    });
    const nextThreadTitle = truncate(buildPlanImplementationThreadTitle(planMarkdown));
    const nextThreadModelSelection: ModelSelection = sendCtx.selectedModelSelection;

    sendInFlightRef.current = true;
    beginLocalDispatch({ preparingWorktree: false });

    const createResult = await createThread({
      environmentId,
      input: {
        threadId: nextThreadId,
        projectId: activeProject.id,
        title: nextThreadTitle,
        modelSelection: nextThreadModelSelection,
        runtimeMode: defaultRuntimeMode,
        interactionMode: "default",
        branch: activeThreadBranch,
        worktreePath: activeThread.worktreePath,
        createdAt,
      },
    });
    let failure: AtomCommandResult<unknown, unknown> | null =
      createResult._tag === "Failure" ? createResult : null;

    if (failure === null) {
      const startResult = await startThreadTurn({
        environmentId,
        input: {
          threadId: nextThreadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: outgoingImplementationPrompt,
            attachments: [],
          },
          modelSelection: nextThreadModelSelection,
          titleSeed: nextThreadTitle,
          runtimeMode: defaultRuntimeMode,
          interactionMode: "default",
          sourceProposedPlan: {
            threadId: activeThread.id,
            planId: activeProposedPlan.id,
          },
          createdAt,
        },
      });
      failure = startResult._tag === "Failure" ? startResult : null;
    }

    if (failure === null) {
      const startedResult = await settlePromise(() => waitForStartedServerThread(nextThreadRef));
      failure = startedResult._tag === "Failure" ? startedResult : null;
    }

    if (failure === null) {
      const navigateResult = await settlePromise(() =>
        navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(nextThreadRef),
        }),
      );
      failure = navigateResult._tag === "Failure" ? navigateResult : null;
    }

    if (failure !== null) {
      const cleanupResult = await deleteThread({
        environmentId,
        input: { threadId: nextThreadId },
      });
      if (cleanupResult._tag === "Failure" && !isAtomCommandInterrupted(cleanupResult)) {
        console.warn(
          "Failed to clean up implementation thread after start failure.",
          squashAtomCommandFailure(cleanupResult),
        );
      }
      if (!isAtomCommandInterrupted(failure)) {
        const error = squashAtomCommandFailure(failure);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: m(msg("Could not start implementation thread")),
            description:
              error instanceof Error
                ? error.message
                : m(msg("An error occurred while creating the new thread.")),
          }),
        );
      }
    }
    sendInFlightRef.current = false;
    resetLocalDispatch();
  };
}
