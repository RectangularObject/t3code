# Personal Fork (`RectangularObject/t3code`)

This is a personal fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) that tracks upstream `v*-nightly.*` releases on the `fork-nightly` branch while carrying personal features and tweaks.

## Active fork features

- **Always-on Plan Mode (`apps/web`)**: Restores the Web/Desktop Build/Plan toggle, `Shift+Tab` shortcut, `/plan` and `/default` slash commands, and the "Plan ready" follow-up / Implement / Implement in a new thread flows removed in upstream PR #33131 — unconditionally enabled with no Labs toggle, leaving the rest of PR #33131's cleanups intact.
- **Automated Windows x64 nightly sync & release (`.github/workflows/fork-nightly-windows.yml`)**: Runs daily to rebase `fork-nightly` onto the newest upstream `v*-nightly.*` tag, opens a `[fork-sync]` issue on conflict, and publishes an unsigned `win-x64` NSIS prerelease with T3 Connect enabled and `app-update.yml` pointed at this fork for in-app auto-updates.

## Branch & sync model

- `main`: untouched mirror of `upstream/main` (`pingdotgg/t3code`).
- `fork-nightly` (default branch): a clean, linear patch stack rebased on top of the latest upstream `v*-nightly.*` tag.
- Target surface: Windows x64 Desktop (`apps/web` + `apps/desktop` packaging). Mobile, macOS, Linux, and bundled WSL runtime archives are intentionally out of scope.

## Guidelines for agents working in this fork

- **Minimize rebase conflicts**: Put fork logic in dedicated, self-contained files with minimal touchpoints in upstream's frequently edited files.
- **Do not edit `apps/web/src/i18n/translations/*.json`** for fork-only UI strings: English never reads `en.json` at runtime (`apps/web/src/i18n/messages.ts` falls back directly to the `msg(...)` string), and editing those 10 JSON catalogs causes conflicts on nearly every daily rebase.
- **Keep wire compatibility with upstream**: Avoid changing `packages/contracts` or the server orchestration protocol unless strictly necessary so the official mobile app, `app.t3.codes`, and the headless `t3` background service keep working seamlessly.
- **Keep the patch stack clean**: Organize custom work into clean, atomic commits on `fork-nightly` (and update the list above when adding or removing fork features). Do not open PRs against `pingdotgg/t3code` unless explicitly asked.
