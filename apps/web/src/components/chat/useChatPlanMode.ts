import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import type { ProviderInteractionMode, RunId, ServerProvider } from "@t3tools/contracts";

import { useComposerDraftStore, type ComposerThreadTarget } from "../../composerDraftStore";
import { useStableCallback } from "../../hooks/useStableCallback";
import { findLatestProposedPlan, hasActionableProposedPlan } from "../../proposedPlan";
import { DEFAULT_INTERACTION_MODE } from "../../types";
import { resolveComposerInteractionMode, shouldShowPlanFollowUpPrompt } from "./planMode.logic";

/**
 * The thread's Build/Plan mode, the plan waiting for an answer, and the handlers that switch
 * modes. Plan mode is always on; providers that do not plan hide it.
 */
export function useChatPlanMode(input: {
  readonly composerDraftTarget: ComposerThreadTarget;
  readonly threadInteractionMode: ProviderInteractionMode | undefined;
  readonly provider: Pick<ServerProvider, "showInteractionModeToggle"> | null;
  readonly serverProjection: ThreadStructure | null;
  readonly latestRunId: RunId | null;
  readonly latestRunSettled: boolean;
  readonly pendingUserInputCount: number;
  readonly composerHasAttachments: boolean;
  readonly isLocalDraftThread: boolean;
  readonly scheduleComposerFocus: () => void;
}) {
  const { composerDraftTarget, isLocalDraftThread, scheduleComposerFocus } = input;
  const draftInteractionMode = useComposerDraftStore(
    (store) => store.getComposerDraft(composerDraftTarget)?.interactionMode ?? null,
  );
  const setComposerDraftInteractionMode = useComposerDraftStore(
    (store) => store.setInteractionMode,
  );
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const { enabled: interactionModeEnabled, interactionMode } = resolveComposerInteractionMode({
    provider: input.provider,
    interactionMode:
      draftInteractionMode ?? input.threadInteractionMode ?? DEFAULT_INTERACTION_MODE,
  });
  const activeProposedPlan = input.latestRunSettled
    ? findLatestProposedPlan(input.serverProjection, input.latestRunId)
    : null;
  const showPlanFollowUpPrompt = shouldShowPlanFollowUpPrompt({
    pendingUserInputCount: input.pendingUserInputCount,
    interactionMode,
    latestTurnSettled: input.latestRunSettled,
    hasActionableProposedPlan: hasActionableProposedPlan(activeProposedPlan),
    hasComposerAttachments: input.composerHasAttachments,
  });

  const handleInteractionModeChange = useStableCallback((mode: ProviderInteractionMode) => {
    if (mode === "plan" && !interactionModeEnabled) return;
    if (mode === interactionMode) return;
    setComposerDraftInteractionMode(composerDraftTarget, mode);
    if (isLocalDraftThread) {
      setDraftThreadContext(composerDraftTarget, { interactionMode: mode });
    }
    scheduleComposerFocus();
  });
  const toggleInteractionMode = useStableCallback(() => {
    if (!interactionModeEnabled) return;
    handleInteractionModeChange(interactionMode === "plan" ? "default" : "plan");
  });

  return {
    interactionMode,
    interactionModeEnabled,
    activeProposedPlan,
    showPlanFollowUpPrompt,
    handleInteractionModeChange,
    toggleInteractionMode,
  };
}
