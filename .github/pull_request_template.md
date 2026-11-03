## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## How it was checked

- [ ] `pnpm lint && pnpm typecheck && pnpm check-tokens`
- [ ] `pnpm test`
- [ ] `pnpm test:e2e` (needed for overlay, popup, app, onboarding or extension changes)
- [ ] `pnpm eval` and the new `metrics.json` (needed for engine, extraction or corpus changes)

## Promises kept

- [ ] No new network request at runtime, and no new permission (or the README explains why)
- [ ] Fixtures and screenshots use fictional outlets only
- [ ] Any number added to a doc names the command that measured it
- [ ] UI changes follow `DESIGN.md` tokens and include screenshots, light and dark
