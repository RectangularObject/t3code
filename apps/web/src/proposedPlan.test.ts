import { describe, expect, it } from "vite-plus/test";

import {
  buildPlanImplementationPrompt,
  isPlanImplementationPrompt,
  resolvePlanFollowUpSubmission,
} from "./proposedPlan";

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
