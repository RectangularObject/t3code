import { describe, expect, it } from "vite-plus/test";

import { resolveComposerInteractionMode, restorePlanFollowUpComposer } from "./planMode.logic";

describe("resolveComposerInteractionMode", () => {
  it.each([
    { provider: { showInteractionModeToggle: true }, expected: { enabled: true, mode: "plan" } },
    { provider: {}, expected: { enabled: true, mode: "plan" } },
    {
      provider: { showInteractionModeToggle: false },
      expected: { enabled: false, mode: "default" },
    },
    { provider: null, expected: { enabled: false, mode: "default" } },
  ] as const)(
    "plan mode with provider $provider resolves to $expected",
    ({ provider, expected }) => {
      expect(resolveComposerInteractionMode({ provider, interactionMode: "plan" })).toEqual({
        enabled: expected.enabled,
        interactionMode: expected.mode,
      });
    },
  );
});

describe("restorePlanFollowUpComposer", () => {
  // The draft is the failed follow-up's thread; the refs and cursor are whatever thread is on
  // screen.
  it.each([
    {
      name: "puts the follow-up back while its thread is open",
      before: { draft: "", refs: "", cursor: null },
      routeIsCurrent: true,
      after: { draft: "Tighten step 2", refs: "Tighten step 2", cursor: "Tighten step 2" },
    },
    {
      name: "keeps a draft typed while the follow-up was in flight",
      before: { draft: "Next idea", refs: "Next idea", cursor: null },
      routeIsCurrent: true,
      after: { draft: "Next idea", refs: "Next idea", cursor: null },
    },
    {
      name: "leaves another thread's composer alone after navigating away",
      before: { draft: "", refs: "Other thread", cursor: null },
      routeIsCurrent: false,
      after: { draft: "Tighten step 2", refs: "Other thread", cursor: null },
    },
  ])("$name", ({ before, routeIsCurrent, after }) => {
    const composer: { draft: string; refs: string; cursor: string | null } = { ...before };
    restorePlanFollowUpComposer({
      snapshot: {
        prompt: "Tighten step 2",
        environmentContexts: [],
        terminalContexts: [],
        reviewComments: [],
        previewAnnotations: [],
        threadContexts: [],
      },
      draftHasUserContent: composer.draft.trim().length > 0,
      routeIsCurrent,
      writeComposerRefs: (snapshot) => {
        composer.refs = snapshot.prompt;
      },
      writePrompt: (prompt) => {
        composer.draft = prompt;
      },
      writeTerminalContexts: () => undefined,
      writeReviewComments: () => undefined,
      writePreviewAnnotations: () => undefined,
      writeThreadContexts: () => undefined,
      writeEnvironmentContexts: () => undefined,
      resetCursor: ({ prompt }) => {
        composer.cursor = prompt;
      },
    });

    expect(composer).toEqual(after);
  });
});
