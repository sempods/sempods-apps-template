# Template tooling

This directory belongs to the sempods apps template: scripts, the app
skeleton, shared instructions and skills, and `VERSION`, the template version
this repository uses. A template update replaces it as a whole, so do not edit
it here; your apps and `apps.json` stay yours.

- `scripts/new-app.mjs`: `npm run new-app -- <id>` creates `apps/<id>`.
- `scripts/dev.mjs`: `npm run dev -- <id>` starts that app.
- `scripts/check.mjs`: `npm run check` checks all apps and this tooling.
- `scripts/self-test.mjs`: tests this tooling in an isolated copy of the
  repository; your apps are not touched.
- `scripts/sdk-snapshot.mjs`: refreshes `reference/sempods-sdk/` for an SDK
  version.
- `skeleton/app/`: what a new app starts from. Files named `*.generated.ts` in
  an app are written from `apps.json`; change `apps.json` and rerun the script
  instead of editing them.
