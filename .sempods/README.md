# Template tooling

This directory belongs to the sempods apps template: scripts, the app
skeleton, shared instructions and skills, and `VERSION`, the template version
this repository uses. A template update replaces it as a whole, so do not edit
it here; your apps and `apps.json` stay yours.

- `scripts/new-app.mjs`: `pnpm run new-app <id>` creates `apps/<id>` with the
  root's SDK version.
- `scripts/dev.mjs`: `pnpm run dev <id>` starts that app.
- `scripts/configure-site.mjs`: `pnpm run configure-site --production <origin>`
  records where the apps are published and regenerates their configuration.
- `scripts/build-site.mjs`: `pnpm run build-site` builds all apps and the
  overview into one static site, `site-dist/`.
- `scripts/sdk-update.mjs`: `pnpm run sdk-update <version>` moves all apps to
  one SDK release.
- `scripts/check.mjs`: `pnpm run check` checks all apps; `--standalone all`
  also installs, lints, builds and tests each app on its own.
- `scripts/check-tooling.mjs` and `scripts/self-test.mjs`: the template
  repository's checks of this tooling; a copy does not run them.
- `scripts/update-template.mjs`: `pnpm run update-template` brings in a newer
  template release; see the [update skill](skills/update-template/SKILL.md).
- `instructions/`: the app workflow and the publish guide your assistant
  follows; `skills/` holds the skill entries that route to them.
- `update-policy.json`: which files a template update replaces, merges or
  leaves to you.
- `CHANGELOG.md`: what each template release changed, with upgrade notes.
- `skeleton/app/`: what a new app starts from. Files named `*.generated.ts` in
  an app are written from `apps.json` when the app is created and rewritten by
  a template update; do not edit them. `check` reports any difference from
  `apps.json`.
