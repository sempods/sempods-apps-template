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

- `pnpm run new-app <id>` creates `apps/<id>` with the root's SDK version,
  built with the UI kit `@sempods/app-ui`.
- `pnpm run icon <id>` draws an app's icons again: from `apps/<id>/icon.svg`
  when there is one, otherwise the monogram in its theme's primary colour.
- `pnpm run dev <id>` starts that app; without an ID, it lists the apps with
  their development addresses.
- `pnpm run regenerate` rewrites every app's generated configuration from
  `apps.json`, for example after a tooling update.
- `pnpm run configure-site --production <origin>` records where the apps are
  published and regenerates their configuration.
- `pnpm run build-site` builds all apps and the overview into one static site,
  `site-dist/`, with `_redirects` rewrites for the apps' resource addresses.
- `pnpm run sdk-update <version>` moves all apps to one SDK release: the SDK
  packages and the UI kit.
- `pnpm run update [<version>]` checks that Node and pnpm suit the target
  version, installs it and runs its `migrate`. `pnpm run migrate` applies the
  installed version's starter to the repository from `.sempods-baseline.json`.
  It applies unambiguous changes and lists the rest as manual cases in
  `.sempods-migration/` for the assistant; `pnpm run migrate --done` then
  completes the migration. See the [update skill](skills/update/SKILL.md).
- `pnpm run check` checks all apps; `--standalone all` also installs, lints,
  builds and tests each app on its own. It reports an SDK version outside the
  range this package supports (its `peerDependencies`).
- `pnpm run check:theme [<id>]` checks the contrast of each app's theme in
  light and dark mode and every action variant, in Chromium through
  Playwright; `--json` prints the reports, and `--install-browser` installs
  the browser once.

Contents:

- `instructions/`: the setup procedure, the app workflow, the visual check and
  the publish guide; `skills/` holds the skill entries that route to them.
- `skeleton/app/`: what a new app starts from: Tailwind CSS 4 and
  `@sempods/app-ui`, its themes, its address model and the list,
  collection, log and context switch examples. Files named `*.generated.ts` in
  an app are written from `apps.json`; do not edit them. `check` reports any
  difference, and `regenerate` rewrites them.
- `shared/`: the starter of this release, its files stored by content hash in
  `shared/files/` and indexed in `shared/snapshot.json`. A repository records
  the revision it was created from, or last applied, in
  `.sempods-baseline.json`.
- `update-policy.json`: the role of each starter file on update.
- `CHANGELOG.md`: what each release changed, with upgrade notes.

Exports, which apps import; each app declares `@sempods/apps` in its
`package.json` at the repository's tooling version (`new-app` writes it,
`check` compares it, `migrate` moves it):

- `@sempods/apps/vite`: `sempodsPage(options)`, the Vite plugin for the
  page title, description link, initial theme colours, startup splash name
  and content-addressed launcher icons, and `sempodsPwa(settings)`, the
  `vite-plugin-pwa` options of an installable app. The generated
  `vite.sempods.generated.ts` calls them with the app's data. Node only;
  `vite` and `vite-plugin-pwa` are optional peer dependencies for the types.
- `@sempods/apps/browser-theme`: browser code without imports.
  `followBrowserTheme()` keeps every
  `<meta name="theme-color" data-sempods-theme>` at the page's resolved
  `--background`, also when the system's appearance changes, and returns the
  function that stops it; `syncBrowserTheme()` does it once, after an
  explicit appearance choice.

Both ship TypeScript declarations next to them in `api/`.

`engines` names the Node and pnpm versions this package needs; read them with
`npm view @sempods/apps@<version> engines` before installing a version.

In its source repository, `starter/` holds the starter files and
`maintainer/` the checks and release scripts; neither is published.
