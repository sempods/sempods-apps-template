# Changelog

Each release lists what changed and **upgrade notes** for the assistant that
applies it. The notes cover what an update cannot decide alone: owner files,
configuration choices and the SDK migration.

## 0.8.0

### Changes

- The skeleton's `src/index.css` sets a calm, neutral palette through the
  `--sempods-*` tokens (graphite accent, grey lines), which colour the app and
  the SDK components alike. Its rules style only the app's own markup and
  leave SDK components (`[data-sempods-ui]`) alone, so `AppAccess` keeps its
  layout. App buttons read as text in the accent colour with a calm hover, a
  visible focus and 44px touch targets; inputs and checkboxes have 44px
  targets too, and lists lose the browser's indentation and bullets.
- The page's `theme-color` follows light and dark mode, and the generated web
  app manifest uses a white background and theme colour instead of green.

### Upgrade notes

1. Finishing the migration regenerates every app's
   `vite.sempods.generated.ts` with the new manifest colours.
2. Existing apps keep their own `src/index.css` and `index.html`. Where an
   app still has the skeleton's global `header`, `button`, `input` or `select`
   rules, offer the owner the new skeleton rules: they stop shifting the
   sign-in form and placing the `AppAccess` icon beside its title. Keep the
   app's own colours unless the owner wants the neutral palette.

## 0.7.1

### Changes

- The update skill starts the installed tooling directly on the branch of a
  version pull request, where pnpm refuses `pnpm run` until the new version
  is installed. It merges the default branch first when the branch is
  behind, and commits the result to the version pull request.

### Upgrade notes

None.

## 0.7.0

### Changes

- New repositories are created from a starter instead of copying the template
  repository: `pnpm create @sempods/apps <directory>` (package
  `@sempods/create-apps`) writes the starter of the published `@sempods/apps`
  version it depends on. The repository holds only owner files: AGENTS.md,
  INIT.md, README, user guide, skill adapters, workflows, workspace settings,
  `apps.json` and a root `package.json` that depends on `@sempods/apps`.
- `.sempods-baseline.json` records the package version and the content
  revision of the starter a repository was created from or last migrated to.
  The template version is the version of `@sempods/apps`; `.sempods/` is gone,
  and so is `update-template` with the code that served copies of the
  template (npm conversion, base inference from Git history).
- INIT.md keeps only the bootstrap steps (Node, pnpm, install) and the setup
  record; the setup procedure ships in the package
  (`instructions/setup.md`). Setup no longer adapts inherited files:
  there are no contributor documents, CODEOWNERS or DCO workflow to remove.
- The tooling commands come from the installed package: `sempods-apps
  <command>` behind the unchanged `pnpm run` scripts. `pnpm run regenerate`
  rewrites every app's generated configuration; the generated files name
  `@sempods/apps` in their header.
- `pnpm run update [<version>]` updates the tooling: it checks that Node and
  pnpm suit the target version and otherwise names what to upgrade first,
  installs the version and runs its `migrate`. `pnpm run migrate` applies the
  installed version's starter from the baseline. It applies only unambiguous
  changes and leaves everything else untouched, listed as manual cases in
  `.sempods-migration/` with the starter's versions and a merge suggestion.
  The assistant decides them with the update skill; `pnpm run migrate --done`
  confirms the decisions, regenerates the apps' configuration, installs and
  advances the baseline. Both commands refuse, before changing anything, to
  write through a symbolic link. `check` names an outstanding or open
  migration and the command for it.
- SDK and tooling version PRs come from Dependabot, in two groups ahead of the
  general npm group: both SDK packages across the root and every app, and
  `@sempods/apps`. They stay off until the owner removes the entry in the
  owner section of `.github/dependabot.yml`; security updates are not
  affected. The scheduled SDK update workflow, `sdkAutoUpdates` in
  `apps.json` and the Actions permission it needed are gone.
- `pnpm run sdk-update <version|latest>` stays the local command. It lets
  pnpm confirm the lockfile and checks the installed release instead of
  reading `pnpm-lock.yaml` itself. The checkpoint of an unfinished SDK update
  is `.sdk-update-pending` in the repository root. `sdk-update` does not
  start while a tooling migration is open or due; finish the migration
  first.
- `check` reports an SDK version outside the range the tooling supports, its
  `peerDependencies`. It no longer checks Markdown links.
- The starter README no longer calls the starter a preview.
- The CodeQL workflow runs only in public repositories, where code scanning
  needs no licence, and has the `actions: read` permission a private
  repository with a GitHub Code Security licence needs once its condition is
  removed.
- `build-site` writes the same layout for every host: `<id>/callback.html`
  and a top-level `404.html`. Netlify serves the callback from it without a
  redirect, so `_redirects`, `configure-site --host` and `site.host` in
  `apps.json` are gone.

### Upgrade notes

1. A repository from 0.6.x is a copy of the template and moves to 0.7.0 by
   hand:
   1. Finish an unfinished SDK update first (`.sempods/.sdk-update-pending`).
   2. Create a new repository with `pnpm create @sempods/apps <directory>`.
   3. Move the owner's content into it: `apps/`, `apps.json`, the owner
      section of AGENTS.md, the setup record of INIT.md (its starting version
      is now the `Created from` field) and `.github/CODEOWNERS` if the owner
      set one. Reapply the owner's own changes to other shared files, such as
      the README, where they still fit.
   4. In `apps.json`, remove `site.host`. An `sdkAutoUpdates: true` becomes
      the opt-in in `.github/dependabot.yml`
      ([setup](instructions/setup.md#enable-sempods-version-prs)); remove the
      field.
   5. Run `pnpm install`, `pnpm run regenerate` and `pnpm run check`.

## 0.6.1

### Changes

- Setup asks once whether the owner has a test Pod after the first screen
  works, falls back to English for an unsupported language and records each
  deferred or chosen preference in its own setup record field.
- The template's plan is retired: `docs/plan.md` is gone, and setup no longer
  lists it among the contributor documents it removes.
- `.gitignore` no longer lists `netlify-dist/`, which no script writes.
- `.sempods/README.md` lists `configure-site`, `build-site`, `sdk-update` and
  the shared instructions.
- The publish guide says where hosting credentials belong, that everything in
  a build is public, and that a sempods Pod fetches no DID document.
- The tooling scripts share their JSON and version helpers. A version that is
  not exact semver is now named in the error. Nothing else changes for owners.
- `pnpm run check` checks only the owner's apps. The template's script tests,
  its Markdown link check and its self-test run in the template repository
  only, so a copy's local check and CI no longer run them.
- The app skeleton names no SDK version: `new-app` gives a new app the root's
  SDK version, and `check` and `sdk-update` no longer read or write the
  skeleton's manifest.
- `apps.json` is required; a repository without it is reported instead of
  being treated as one without apps.
- The tooling commands find the repository from the directory they run in.
- The SDK update workflow no longer imports the tooling's internal modules: it
  reads `apps.json` directly and stages `apps/*/package.json` by path.

### Upgrade notes

1. `update-template` removes `docs/plan.md` if a copy still has it and lists it
   under "Removed". Nothing else to do.
2. If the owner relies on `netlify-dist/` being ignored, keep that line in
   `.gitignore`.
3. `.github/workflows/check.yml` and `sdk-update.yml` merge as shared files. If
   the owner changed them, keep the new conditions that run the tooling checks
   only in the template repository, and the staging by path.
4. A copy's check no longer validates Markdown links. If the owner relies on
   that for their own documents, say so; it is not part of the owner checks.

## 0.6.0

### Changes

- The assistant assumes no developer knowledge, builds small steps the owner
  can try and chooses routine SDK and RDF details itself. It asks about app
  behavior and data access in everyday terms.
- Setup reaches the first local interaction before adapting inherited files
  and offering optional review ownership and automatic SDK updates. Deferred
  preferences do not block setup completion.
- Scheduled SDK update jobs require `sdkAutoUpdates: true` in the owner's
  `apps.json` on the default branch, even if Actions permits PR creation or an
  organization-level variable enables updates elsewhere. A read-only job
  checks the committed choice first; manual dispatch remains available.
  App generation and template updates preserve this owner-owned field.
- `pnpm run configure-site --production <origin> [--preview <origin>]
  [--host netlify|cloudflare-pages|static]` records where the apps are
  published in a new optional `site` field of `apps.json` (schemaVersion stays
  1) and regenerates every app. Each app's `src/sempods.generated.ts` now holds
  `profiles`: the unchanged local profile and one `did:web` profile per origin
  (`did:web:<host>:<id>`, callback `https://<host>/<id>/callback`). Only the
  Vite build modes `sempods-production` and `sempods-preview` select a
  published profile; development, plain builds, `vite preview` and tests stay
  local. Changing the production origin needs `--change-domain`.
- Local installs have no minimum release age (`minimumReleaseAge: 0` in
  `pnpm-workspace.yaml`). With pnpm's default, a dependency younger than a
  day whose exact pin has no older alternative was installed anyway, added to
  `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`, and the next
  `pnpm run` stopped because that setting had changed. Both npm Dependabot
  entries apply a three-day `cooldown` to regular version updates, and
  Dependabot attempts an age gate for newly resolved transitive dependencies.
  This is no universal age guarantee: local dependency changes (`new-app`,
  `pnpm add`, `sdk-update`), security updates and pnpm fallback paths can
  admit younger releases.
- `pnpm run build-site [--profile production|preview]` (or
  `SEMPODS_SITE_PROFILE`) builds every app with that profile into one static
  folder, `site-dist/<id>/`, and leaves each app's local `dist/` alone. It
  writes an accessible overview page at `/` from `apps.json` and each app's
  `icon-192.png`, `did.json` per app, the SDK's licence notices, and the routing
  for the configured host: Netlify gets one `_redirects` rule per callback;
  Cloudflare Pages and other static hosts get `<id>/callback.html`. Every
  site has a top-level `404.html`. The skeleton's `index.html` sets the
  referrer policy `strict-origin` for new apps.
- The new [publish guide](instructions/publish.md) states what any host must
  provide, with sections for Netlify (tested live on a two-app site with a
  preview address) and Cloudflare Pages (not tested by the template). The app
  workflow, `docs/start.md`, `README.md` and `INIT.md` point to it.

### Upgrade notes

1. Shared AGENTS.md and INIT.md changes preserve existing owner and setup
   records. Do not repeat completed setup. For an incomplete setup, build the
   first local interaction before offering optional repository preferences.
2. Scheduled SDK updates now skip the update job unless `sdkAutoUpdates` in
   `apps.json` on the default branch is `true`. If a copy used weekly updates,
   explain this change and use its recorded owner choice, or ask if no choice
   is recorded. Follow INIT's activation steps and verify both the committed field
   and the Actions PR setting. Leave a deferred choice inactive. Record the
   result without treating PR creation permission alone as an opt-in.
3. `update-template` regenerates `src/sempods.generated.ts` in every app.
   `app` and `runtimeOptions` keep their names and, outside a site build,
   their local values, so no owner file has to change.
4. An app that switched identities by itself before this release, for example
   with a `src/identity.ts` that picks a `did:web` identity in production
   builds ([#24](https://github.com/sempods/sempods-apps-template/issues/24)), should move to `configure-site`. Ask the owner first, run
   `pnpm run configure-site --production <the published origin>`, then let the
   app import `runtimeOptions` from `src/sempods.generated.ts` again and remove
   the interim file and its tests.
5. Choose the production origin once. A later change gives every app a new
   identity: every sign-in and Pod grant has to be made again.
6. `.gitignore` gains `site-dist/`. A copy that published with its own build
   or host setup before ([#24](https://github.com/sempods/sempods-apps-template/issues/24)) compares it with the publish guide:
   callback paths must answer `200` without a redirect, and on Cloudflare
   remove catch-all rewrites to `index.html`, which there also replace scripts
   and `did.json`. Replace it with `build-site` with the owner's agreement.
7. `pnpm-workspace.yaml` and `.github/dependabot.yml` are shared files that
   `update-template` merges. If pnpm had added entries to
   `minimumReleaseAgeExclude` in a copy, the merge keeps them or reports a
   conflict. Remove the entries pnpm added and the former `@sempods/*` line;
   keep exclusions the owner added on purpose and ask when unsure. An
   owner's own Dependabot cooldown choice stays.
8. Run `pnpm install --frozen-lockfile`, `pnpm run check --standalone all`
   and the template self-test; local and manual SDK updates remain available.

## Before 0.6.0

The releases 0.2.0 to 0.5.0 applied to copies of the template. Their changes
and upgrade notes are archived in the
[0.6.1 changelog](https://github.com/sempods/sempods-apps-template/blob/v0.6.1/.sempods/CHANGELOG.md#050).
