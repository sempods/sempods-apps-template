# Template tooling

This directory belongs to the sempods apps template: scripts, the app
skeleton, shared instructions and skills, and `VERSION`, the template version
this repository uses. A template update replaces it as a whole, so do not edit
it here; your apps and `apps.json` stay yours.

- `scripts/new-app.mjs`: `pnpm run new-app <id>` creates `apps/<id>`.
- `scripts/dev.mjs`: `pnpm run dev <id>` starts that app.
- `scripts/check.mjs`: `pnpm run check` checks all apps and this tooling;
  `--standalone all` also installs, lints, builds and tests each app
  on its own.
- `scripts/self-test.mjs`: tests this tooling in an isolated copy of the
  repository; your apps are not touched.
- `scripts/update-template.mjs`: `pnpm run update-template` brings in a newer
  template release; see the [update skill](skills/update-template/SKILL.md).
- `update-policy.json`: which files a template update replaces, merges or
  leaves to you.
- `CHANGELOG.md`: what each template release changed, with upgrade notes.
- `skeleton/app/`: what a new app starts from. Files named `*.generated.ts` in
  an app are written from `apps.json` when the app is created and rewritten by
  a template update; do not edit them. `check` reports any difference from
  `apps.json`.
