# @sempods/apps

Tooling for a sempods apps repository: several small apps that share one SDK
version, each in `apps/<id>`, listed in `apps.json`. It ships the scripts, the
app skeleton, the instructions and skills an assistant follows, and the
starter of a new repository. Do not edit it in a repository that uses it;
your apps and `apps.json` stay yours.

Create a repository with `pnpm create @sempods/apps <directory>`
(package `@sempods/create-apps`), which runs
`sempods-apps create <directory>` of the same version. The repository's root
`package.json` runs the other commands through `sempods-apps <command>`:

- `pnpm run new-app <id>` creates `apps/<id>` with the root's SDK version.
- `pnpm run dev <id>` starts that app.
- `pnpm run regenerate` rewrites every app's generated configuration from
  `apps.json`, for example after a tooling update.
- `pnpm run configure-site --production <origin>` records where the apps are
  published and regenerates their configuration.
- `pnpm run build-site` builds all apps and the overview into one static site,
  `site-dist/`.
- `pnpm run sdk-update <version>` moves all apps to one SDK release.
- `pnpm run update [<version>]` checks that Node and pnpm suit the target
  version, installs it and runs its `migrate`. `pnpm run migrate` applies the
  installed version's starter to the repository from `.sempods-baseline.json`:
  shared files are merged with the owner sections kept, the apps' generated
  configuration is rewritten, and the baseline advances once no conflict
  remains. A rerun continues an unfinished migration; see the
  [update skill](skills/update/SKILL.md).
- `pnpm run check` checks all apps; `--standalone all` also installs, lints,
  builds and tests each app on its own. It reports an SDK version outside the
  range this package supports (its `peerDependencies`).
- `sempods-apps update-template` served copies of the template, which held
  the tooling themselves. From 0.7.0 on it refuses to apply a release, without
  changing anything: such a copy follows the 0.7.0 upgrade notes in
  `CHANGELOG.md`.

Contents:

- `instructions/`: the setup procedure, the app workflow and the publish
  guide; `skills/` holds the skill entries that route to them.
- `skeleton/app/`: what a new app starts from. Files named `*.generated.ts` in
  an app are written from `apps.json`; do not edit them. `check` reports any
  difference, and `regenerate` rewrites them.
- `shared/`: the starter of this release, its files stored by content hash in
  `shared/files/` and indexed in `shared/snapshot.json`. A repository records
  the revision it was created from, or last applied, in
  `.sempods-baseline.json`.
- `update-policy.json`: the role of each starter file on update.
- `CHANGELOG.md`: what each release changed, with upgrade notes.

`engines` names the Node and pnpm versions this package needs; read them with
`npm view @sempods/apps@<version> engines` before installing a version.

In its source repository, `starter/` holds the starter files and
`maintainer/` the checks and release scripts; neither is published.
