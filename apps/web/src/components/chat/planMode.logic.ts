import type {
  EnvironmentContextRecord,
  PreviewAnnotationPayload,
  ProviderInteractionMode,
  ServerProvider,
  ThreadContextRecord,
} from "@t3tools/contracts";

import { collapseExpandedComposerCursor } from "../../composer-logic";
import type { TerminalContextDraft } from "../../lib/terminalContext";
import type { ReviewCommentContext } from "../../reviewCommentContext";

/** Plan mode is always on in this fork; providers without plan support still hide it. */
export function resolveComposerInteractionMode(input: {
  provider: Pick<ServerProvider, "showInteractionModeToggle"> | null | undefined;
  interactionMode: ProviderInteractionMode;
}): { enabled: boolean; interactionMode: ProviderInteractionMode } {
  const enabled = input.provider != null && input.provider.showInteractionModeToggle !== false;
  return { enabled, interactionMode: enabled ? input.interactionMode : "default" };
}

export function shouldShowPlanFollowUpPrompt(input: {
  pendingUserInputCount: number;
  interactionMode: ProviderInteractionMode;
  latestTurnSettled: boolean;
  hasActionableProposedPlan: boolean;
  hasComposerAttachments: boolean;
}): boolean {
  return (
    input.pendingUserInputCount === 0 &&
    input.interactionMode === "plan" &&
    input.latestTurnSettled &&
    input.hasActionableProposedPlan &&
    !input.hasComposerAttachments
  );
}

export interface PlanFollowUpComposerSnapshot {
  readonly prompt: string;
  readonly terminalContexts: ReadonlyArray<TerminalContextDraft>;
  readonly reviewComments: ReadonlyArray<ReviewCommentContext>;
  readonly previewAnnotations: ReadonlyArray<PreviewAnnotationPayload>;
  readonly threadContexts: ReadonlyArray<ThreadContextRecord>;
  readonly environmentContexts: ReadonlyArray<EnvironmentContextRecord>;
}

// A draft typed while the send was in flight is newer and stays. Composer refs and the cursor
// belong to the thread on screen, so they follow only while the follow-up's route is current.
export function restorePlanFollowUpComposer(input: {
  readonly snapshot: PlanFollowUpComposerSnapshot;
  readonly draftHasUserContent: boolean;
  readonly routeIsCurrent: boolean;
  readonly writeComposerRefs: (snapshot: PlanFollowUpComposerSnapshot) => void;
  readonly writePrompt: (prompt: string) => void;
  readonly writeTerminalContexts: (contexts: ReadonlyArray<TerminalContextDraft>) => void;
  readonly writeReviewComments: (comments: ReadonlyArray<ReviewCommentContext>) => void;
  readonly writePreviewAnnotations: (annotations: ReadonlyArray<PreviewAnnotationPayload>) => void;
  readonly writeThreadContexts: (records: ReadonlyArray<ThreadContextRecord>) => void;
  readonly writeEnvironmentContexts: (records: ReadonlyArray<EnvironmentContextRecord>) => void;
  readonly resetCursor: (options: {
    cursor: number;
    prompt: string;
    detectTrigger: boolean;
  }) => void;
}): void {
  if (input.draftHasUserContent) return;
  if (input.routeIsCurrent) input.writeComposerRefs(input.snapshot);
  input.writePrompt(input.snapshot.prompt);
  input.writeTerminalContexts(input.snapshot.terminalContexts);
  input.writeReviewComments(input.snapshot.reviewComments);
  input.writePreviewAnnotations(input.snapshot.previewAnnotations);
  input.writeThreadContexts(input.snapshot.threadContexts);
  input.writeEnvironmentContexts(input.snapshot.environmentContexts);
  if (!input.routeIsCurrent) return;
  input.resetCursor({
    cursor: collapseExpandedComposerCursor(input.snapshot.prompt, input.snapshot.prompt.length),
    prompt: input.snapshot.prompt,
    detectTrigger: true,
  });
}
