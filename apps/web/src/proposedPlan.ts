import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import type { OrchestrationV2PlanArtifact, PlanId, RunId } from "@t3tools/contracts";
import { stripDisplayedPlanMarkdown, proposedPlanTitle } from "@t3tools/shared/proposedPlanText";
import * as DateTime from "effect/DateTime";
import { msg } from "gt-react";

import { m, type MessageResolver } from "./i18n/messages";

export function buildCollapsedProposedPlanPreviewMarkdown(
  planMarkdown: string,
  options?: {
    maxLines?: number;
  },
  resolve: MessageResolver = m,
): string {
  const maxLines = options?.maxLines ?? 8;
  const lines = stripDisplayedPlanMarkdown(planMarkdown)
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const previewLines: string[] = [];
  let visibleLineCount = 0;
  let hasMoreContent = false;
  let openFence: { marker: string; indent: string } | null = null;

  for (const line of lines) {
    const isVisibleLine = line.trim().length > 0;
    if (isVisibleLine && visibleLineCount >= maxLines) {
      hasMoreContent = true;
      break;
    }
    previewLines.push(line);
    if (isVisibleLine) {
      visibleLineCount += 1;
    }
    const match = /^( {0,3})(?:(`{3,})[^`]*|(~{3,}).*)$/.exec(line);
    const fence = match?.[2] ?? match?.[3];
    if (match === null || fence === undefined) {
      continue;
    }
    if (openFence === null) {
      openFence = { marker: fence, indent: match[1] ?? "" };
    } else if (
      fence[0] === openFence.marker[0] &&
      fence.length >= openFence.marker.length &&
      line.trim() === fence
    ) {
      openFence = null;
    }
  }

  while (previewLines.length > 0 && previewLines.at(-1)?.trim().length === 0) {
    previewLines.pop();
  }

  if (previewLines.length === 0) {
    return proposedPlanTitle(planMarkdown) ?? resolve(msg("Plan preview unavailable."));
  }

  if (openFence !== null) {
    previewLines.push(openFence.indent + openFence.marker);
  }

  if (hasMoreContent) {
    previewLines.push("", "...");
  }

  return previewLines.join("\n");
}

function sanitizePlanFileSegment(input: string): string {
  const sanitized = input
    .toLowerCase()
    .replace(/[`'".,!?()[\]{}]+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "plan";
}

const LEGACY_PLAN_IMPLEMENTATION_PROMPT_PREFIX = "PLEASE IMPLEMENT THIS PLAN:\n";
const NEW_THREAD_PLAN_IMPLEMENTATION_PROMPT_PREFIX = "Implement this plan:\n\n";
const SAME_THREAD_PLAN_IMPLEMENTATION_PROMPT = "Implement the plan.";

export interface LatestProposedPlanState {
  readonly id: PlanId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly runId: RunId | null;
  readonly planMarkdown: string;
  readonly status: OrchestrationV2PlanArtifact["status"];
}

function planItemTime(
  projection: ThreadStructure,
  plan: Pick<OrchestrationV2PlanArtifact, "id" | "runId">,
): string {
  const item = projection.turnItems.findLast(
    (candidate) =>
      (candidate.type === "proposed_plan" || candidate.type === "todo_list") &&
      candidate.planId === plan.id,
  );
  if (item?.type === "proposed_plan" || item?.type === "todo_list") {
    return DateTime.formatIso(item.updatedAt);
  }
  // Without a plan item, the plan's run dates it; the thread's own timestamps move while a reply streams.
  const run = projection.runs.find((candidate) => candidate.id === plan.runId);
  return DateTime.formatIso(
    run?.completedAt ?? run?.startedAt ?? run?.requestedAt ?? projection.thread.createdAt,
  );
}

export function findLatestProposedPlan(
  projection: ThreadStructure | null,
  latestRunId: RunId | string | null | undefined,
): LatestProposedPlanState | null {
  if (projection === null) return null;
  const plans = projection.plans.filter((plan) => plan.kind === "proposed_plan");
  const candidates = latestRunId ? plans.filter((plan) => plan.runId === latestRunId) : plans;
  const plan = [...(candidates.length > 0 ? candidates : plans)]
    .toSorted(
      (left, right) =>
        planItemTime(projection, left).localeCompare(planItemTime(projection, right)) ||
        left.id.localeCompare(right.id),
    )
    .at(-1);
  if (plan === undefined) return null;
  const updatedAt = planItemTime(projection, plan);
  return {
    id: plan.id,
    createdAt: updatedAt,
    updatedAt,
    runId: plan.runId,
    planMarkdown: plan.markdown,
    status: plan.status,
  };
}

export function hasActionableProposedPlan(plan: LatestProposedPlanState | null): boolean {
  return plan?.status === "active";
}

export function buildPlanImplementationPrompt(planMarkdown: string): string {
  return `${NEW_THREAD_PLAN_IMPLEMENTATION_PROMPT_PREFIX}${planMarkdown.trim()}`;
}

export function isPlanImplementationPrompt(text: string): boolean {
  return (
    text === SAME_THREAD_PLAN_IMPLEMENTATION_PROMPT ||
    text.startsWith(NEW_THREAD_PLAN_IMPLEMENTATION_PROMPT_PREFIX) ||
    text.startsWith(LEGACY_PLAN_IMPLEMENTATION_PROMPT_PREFIX)
  );
}

/** Text in the draft refines the plan; an empty draft implements it in the current thread. */
export function resolvePlanFollowUpSubmission(input: { draftText: string }): {
  text: string;
  interactionMode: "default" | "plan";
} {
  const trimmedDraftText = input.draftText.trim();
  if (trimmedDraftText.length > 0) {
    return { text: trimmedDraftText, interactionMode: "plan" };
  }
  return {
    text: SAME_THREAD_PLAN_IMPLEMENTATION_PROMPT,
    interactionMode: "default",
  };
}

export function buildPlanImplementationThreadTitle(planMarkdown: string): string {
  const title = proposedPlanTitle(planMarkdown);
  // oxlint-disable-next-line t3code/no-untranslated-copy -- thread titles are stored data other clients and agents read, so they stay English
  return title ? `Implement ${title}` : "Implement plan";
}

export function buildProposedPlanMarkdownFilename(planMarkdown: string): string {
  const title = proposedPlanTitle(planMarkdown);
  return `${sanitizePlanFileSegment(title ?? "plan")}.md`;
}

export function normalizePlanMarkdownForExport(planMarkdown: string): string {
  return `${planMarkdown.trimEnd()}\n`;
}

export function downloadPlanAsTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
