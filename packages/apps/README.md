# @sempods/apps

Tooling for a sempods apps repository: several small apps that share one SDK
version, each in `apps/<id>`, listed in `apps.json`. It ships the scripts, the
app skeleton, the instructions and skills an assistant follows, and the shared
files of its template release. Do not edit it in a repository that uses it;
your apps and `apps.json` stay yours.

The repository's root `package.json` runs its commands through
`sempods-apps <command>`:

- `pnpm run new-app <id>` creates `apps/<id>` with the root's SDK version.
- `pnpm run dev <id>` starts that app.
- `pnpm run regenerate` rewrites every app's generated configuration from
  `apps.json`, for example after a tooling update.
- `pnpm run configure-site --production <origin>` records where the apps are
  published and regenerates their configuration.
- `pnpm run build-site` builds all apps and the overview into one static site,
  `site-dist/`.
- `pnpm run sdk-update <version>` moves all apps to one SDK release.
- `pnpm run check` checks all apps; `--standalone all` also installs, lints,
  builds and tests each app on its own. It reports an SDK version outside the
  range this package supports (its `peerDependencies`).
- `pnpm run update-template` brings in a newer template release; see the
  [update skill](skills/update-template/SKILL.md).

Contents:

- `instructions/`: the app workflow and the publish guide; `skills/` holds the
  skill entries that route to them.
- `skeleton/app/`: what a new app starts from. Files named `*.generated.ts` in
  an app are written from `apps.json`; do not edit them. `check` reports any
  difference, and `regenerate` rewrites them.
- `update-policy.json`: which files a template update replaces, merges or
  leaves to you.
- `shared/`: the shared files of this release (`shared/files/`) and their index
  `shared/snapshot.json`, whose revision a repository records in
  `.sempods-baseline.json` once it has applied them.
- `CHANGELOG.md`: what each release changed, with upgrade notes.

`engines` names the Node and pnpm versions this package needs; read them with
`npm view @sempods/apps@<version> engines` before installing a version.

In the template repository, `maintainer/` holds checks of this package that
are not published: `check-tooling.mjs` (script tests, Markdown links),
`self-test.mjs` and `pack-test.mjs` (the packed package in a fresh
repository).
