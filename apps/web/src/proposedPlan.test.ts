import { describe, expect, it } from "vite-plus/test";

import {
  buildCollapsedProposedPlanPreviewMarkdown,
  buildPlanImplementationPrompt,
  isPlanImplementationPrompt,
  resolvePlanFollowUpSubmission,
} from "./proposedPlan";

describe("buildCollapsedProposedPlanPreviewMarkdown", () => {
  it("closes a code block the preview cuts through, so the ellipsis stays outside it", () => {
    const plan = [
      "- Step",
      "  ```ts",
      "  const a = 1;",
      "  const b = 2;",
      "  ```",
      "",
      "Done.",
    ].join("\n");
    expect(buildCollapsedProposedPlanPreviewMarkdown(plan, { maxLines: 3 })).toBe(
      ["- Step", "  ```ts", "  const a = 1;", "  ```", "", "..."].join("\n"),
    );
  });

  it("adds no fence when every code block ends inside the preview, inline code included", () => {
    const plan = ["~~~~", "```", "~~~~", "", "```npm i```", "Next", "More"].join("\n");
    expect(buildCollapsedProposedPlanPreviewMarkdown(plan, { maxLines: 5 })).toBe(
      ["~~~~", "```", "~~~~", "", "```npm i```", "Next", "", "..."].join("\n"),
    );
  });
});

describe("resolvePlanFollowUpSubmission", () => {
  it.each(["", "Consider this "])(
    "keeps context-bearing feedback in plan mode with prose %j",
    (prose) => {
      const draftText = `${prose}[PR #42](t3-context://v1/review-comment/pr-42)`;
      expect(resolvePlanFollowUpSubmission({ draftText })).toEqual({
        text: draftText,
        interactionMode: "plan",
      });
    },
  );
  it("switches to default mode without resending the plan when implementing in the same thread", () => {
    expect(resolvePlanFollowUpSubmission({ draftText: "   " })).toEqual({
      text: "Implement the plan.",
      interactionMode: "default",
    });
  });
});

describe("buildPlanImplementationPrompt", () => {
  it("includes the trimmed plan markdown for a new thread without an all-caps prefix", () => {
    expect(buildPlanImplementationPrompt("\n## Ship it\n\n- step 1\n")).toBe(
      "Implement this plan:\n\n## Ship it\n\n- step 1",
    );
  });
});

describe("isPlanImplementationPrompt", () => {
  it.each([
    ["Implement the plan.", true],
    ["Implement this plan:\n\n## Ship it", true],
    ["PLEASE IMPLEMENT THIS PLAN:\n## Ship it", true],
    ["Implement the plan with extra checks", false],
  ])("classifies %j as %s", (text, expected) => {
    expect(isPlanImplementationPrompt(text)).toBe(expected);
  });
});
