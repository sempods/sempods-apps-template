# Template tooling

This directory belongs to the sempods apps template: scripts, the app
skeleton, shared instructions and skills, and `VERSION`, the template version
this repository uses. A template update replaces it as a whole, so do not edit
it here; your apps and `apps.json` stay yours.

- `scripts/new-app.mjs`: `npm run new-app -- <id>` creates `apps/<id>`.
- `scripts/dev.mjs`: `npm run dev -- <id>` starts that app.
- `scripts/check.mjs`: `npm run check` checks all apps and this tooling;
  `-- --standalone all` also installs, lints, builds and tests each app
  on its own.
- `scripts/self-test.mjs`: tests this tooling in an isolated copy of the
  repository; your apps are not touched.
- `skeleton/app/`: what a new app starts from. Files named `*.generated.ts` in
  an app are written from `apps.json` when the app is created; do not edit them.
  This version has no command that regenerates an existing app (the update and
  deployment tooling will), and `check` reports any difference from `apps.json`.
