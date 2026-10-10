# Template changelog

Each release lists what changed and **upgrade notes** for the assistant that
applies it with the [update-template skill](skills/update-template/SKILL.md).
`update-template` replaces `.sempods/`, merges shared files and updates
template entries in the manifests. The notes cover what it cannot decide
alone: owner files, configuration choices and the SDK migration.

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

### Upgrade notes

1. `update-template` removes `docs/plan.md` if a copy still has it and lists it
   under "Removed". Nothing else to do.
2. If the owner relies on `netlify-dist/` being ignored, keep that line in
   `.gitignore`.

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

## 0.5.0

### Changes

- The SDK is 0.5.0 (`@sempods/app-sdk` and `@sempods/client-sdk`) for the
  root tooling and the app skeleton. 0.5 edits a Pod-overview row in its own
  Context (`useContextEditor`, `runtime.bindContext`), reports a failed
  create-only condition as `unconfirmed` instead of `exists`, shows no Context
  view until startup settles and ships a guide for apps that only read. The
  skeleton code needs no change.
- The app workflow asks early whether an app writes data or only reads it. For
  an app that only reads, such as a data explorer, it records that decision and
  the contexts the app needs in `NOTES.md`, takes the vocabulary from the stored
  data, keeps write hooks and operations out of the app and tests it with the
  read-only section of the installed SDK's `local-testing.md`.
- New apps start with a test: `src/start.test.ts` tests the start screen's
  text, now the pure function `startMessage` in `src/start.ts`. Tests type-check
  through their own `tsconfig.test.json` with Node types, and the app
  `tsconfig.app.json` leaves them out. The app workflow says where tests live,
  what to test first and how to set up a component test.
- `src/sempods.generated.ts` reads `location` only when the runtime is created,
  no longer on import, so tests in Node can import it.
- pnpm replaces npm workspaces
  ([#32](https://github.com/sempods/sempods-apps-template/issues/32)).
  `package.json` pins pnpm 11.28.2 in
  `packageManager` and drops `workspaces` and its npm `overrides`;
  `pnpm-workspace.yaml` lists `apps/*` and carries the former `.npmrc`
  settings: exact versions, a strict Node engine and no dependency install
  scripts (pnpm's `strictDepBuilds`). Scripts fail on dependencies out of
  sync with the manifests instead of installing on their own
  (`verifyDepsBeforeRun: error`). The glob override moves there too.
  `pnpm-lock.yaml` replaces `package-lock.json`, and `.npmrc` is gone. SDK
  releases are exempt from pnpm's one-day minimum release age, so
  `sdk-update` works on release day. The scripts, CI, the SDK update workflow
  and all instructions use pnpm; the app workflow names the pnpm equivalents of
  the npm commands in the SDK's guides. The scripts ignore a leading `--`, so
  `pnpm run check -- --standalone all` works as well.
- The agent instructions serve only the owner who builds apps. AGENTS.md,
  CLAUDE.md, INIT.md and the app workflow no longer route to template
  maintenance or mention its milestones, so an assistant no longer switches to
  the maintainer role or claims template issues. `docs/app-workflow.md`, a
  pointer to the same workflow, is removed.
- Setup removes the template's contributor documents (`CONTRIBUTING.md`,
  `docs/maintaining.md`, `docs/plan.md`, `docs/vision.md`) from a new copy.
  `.gitignore` ignores the personal instruction files `CLAUDE.local.md` and
  `AGENTS.override.md`.

### Upgrade notes

1. **pnpm.** Before this update, check `pnpm --version`; install pnpm as
   `docs/start.md` says if it is missing. A copy before 0.5.0 starts the
   update with `npm run update-template`. The update adds `pnpm-workspace.yaml`,
   sets `packageManager`, removes `workspaces` and the template's `overrides`
   from `package.json`, removes an unchanged `.npmrc`, converts
   `package-lock.json` with `pnpm import` (the copy keeps its resolved
   versions), deletes it and installs with pnpm. With `--no-install` the update
   stays unfinished until it runs again with installation. Then:
   - an owner-changed `.npmrc` stays: pnpm 11 reads only registry, auth and
     network settings from it. Move other settings to `pnpm-workspace.yaml`
     (camelCase, for example `saveExact: true`) with the owner's agreement;
   - owner globs in `package.json` `workspaces` beyond `apps/*` are kept, but
     pnpm ignores that field. Add them to `packages` in `pnpm-workspace.yaml`
     and remove the field, with the owner's agreement;
   - an owner-set `packageManager` that is not pnpm is kept and stops pnpm;
     the report names it. Set it to the template's pnpm version with the
     owner's agreement, then run the update again;
   - owner entries in `package.json` `overrides` use npm's syntax, which pnpm
     ignores. Move them to `overrides` in `pnpm-workspace.yaml`, written
     `parent>child: version`;
   - if an app dependency needs an install script, `pnpm install` stops. Ask
     the owner before approving it under `allowBuilds` in
     `pnpm-workspace.yaml`;
   - the owner's commands change (`pnpm install`, `pnpm run dev <id>`,
     `pnpm run check`). Update mentions of npm commands in app notes or the
     owner section of `AGENTS.md` with the owner's agreement;
   - CI now uses `pnpm/action-setup`. If the organization limits which actions
     may run, the owner allows it;
   - commit `pnpm-lock.yaml` and the removal of `package-lock.json`, then run
     `pnpm install --frozen-lockfile` and `pnpm run check --standalone all`.
2. `update-template` updates the root and skeleton manifests. Then run
   `pnpm run sdk-update 0.5.0` so every registered app moves to the same SDK
   version, and run `pnpm run check --standalone all`.
3. Review the SDK migration
   [From 0.4 to 0.5](https://github.com/sempods/sempods-typescript/blob/v0.5.0/docs/migration.md#from-04-to-05)
   for each app:
   - code that chose a new address after a creation reported `exists` must
     keep the item unconfirmed and let the person settle it; `useCreation`
     already does;
   - fake runtimes and test doubles typed as `BrowserRuntime` need
     `bindContext`, and exhaustive switches over `LeaveGuard['scope']` or
     `OAuthProblem` need the new cases;
   - tests that act on a view right after rendering wait for startup to
     settle, and end-to-end tests no longer find the chooser while the first
     Context catalogue loads;
   - code that read a `created`, `saved` or `removed` outcome after another
     write on the same target now sees `null`.
4. Apps that copied the 0.4 overview recipe's `EditInContext` keep working. To
   replace it with `useContextEditor`, ask the owner first: the row no longer
   selects its Context.
5. For an existing app that only reads, add that decision and the contexts it
   reads to its `NOTES.md` when you next work on it.
6. `update-template` regenerates `src/sempods.generated.ts` in every app; the
   exported `runtimeOptions` keep their shape. Existing apps keep their own
   test setup. To give one the skeleton's, ask the owner first, then copy
   `.sempods/skeleton/app/tsconfig.test.json`, add it to the app's
   `tsconfig.json` references and exclude `src/**/*.test.ts` and
   `src/**/*.test.tsx` from its `tsconfig.app.json`. An app whose tests already
   read Node APIs some other way can keep them.
7. The contributor documents `CONTRIBUTING.md`, `docs/maintaining.md`,
   `docs/plan.md` and `docs/vision.md` describe work on the template, not on
   the owner's apps. Offer to remove them; keep `CONTRIBUTING.md` if the owner
   adapted it for their own repository. First check that no kept file links to
   them, so `pnpm run check` stays green. Template updates do not bring them
   back once removed.

## 0.4.0

### Changes

- The SDK is 0.4.1 (`@sempods/app-sdk` and `@sempods/client-sdk`) for the
  root tooling and the app skeleton. 0.4 adds Pod-wide reads and Contexts on
  demand; 0.4.1 renews credentials before they expire.
- New apps start with `AppAccess` beside `TargetScreen`, as the SDK reference
  recommends, instead of `AppShell`. The skeleton's `App.tsx` owns its layout: a
  header with the app title and a button that reopens data access. The skeleton
  stylesheet gains matching `main` and `header` rules. The app workflow and the
  vision name `AppAccess`.

### Upgrade notes

1. `update-template` updates the root and skeleton manifests. Then run
   `npm run sdk-update -- 0.4.1` so every registered app moves to the same SDK
   version, and run `npm run check -- --standalone all`.
2. Review the SDK migration
   [From 0.3 to 0.4](https://github.com/sempods/sempods-typescript/blob/v0.4.1/docs/migration.md#from-03-to-04)
   for each app:
   - Context labels are loaded only for the selected Context, so pickers and
     tests that read `catalogue.labels` for other Contexts need updating;
   - the edit helpers reject IRIs containing control characters or spaces;
   - hand-built test doubles need the new members `Pod.sparql`,
     `BrowserRuntime.bindPod`, `AppSnapshot.pod` and
     `AppSnapshot.contextSelection`.
3. Existing apps on `AppShell` keep working; do not migrate them unasked. To
   move an app to the new layout, ask the owner first, then compare its
   `App.tsx` with `.sempods/skeleton/app/src/App.tsx`. Keep the app's own
   screens inside `TargetScreen`, and give the access button a label different
   from the app's own controls.

## 0.3.0

### Changes

- New apps use the TypeScript 7 native compiler. The root import checker stays
  on TypeScript 6, because TypeScript 7 does not ship the compiler API it needs.
  Dependabot excludes root TypeScript major updates until that API is migrated.
- Dependabot also excludes major updates of the root Markdown link-check
  tooling (`remark`, `remark-validate-links`, `unified-engine`,
  `markdown-extensions`). Template releases move these majors, and
  `update-template` delivers them, so a copy keeps the template's entries.
- CodeQL scans GitHub Actions and JavaScript/TypeScript, explicitly including
  `.sempods/scripts`, `.sempods/skeleton/app` and owner apps. Hidden template
  directories are skipped by the JavaScript extractor's default traversal.
  `new-app` reads its skeleton copy without a separate stat before each file,
  so the first analysis of a copy reports no file-system race in it.
- Dependabot keeps `@types/node` within the Node 24 runtime baseline. Review a
  Node major migration together with its types before removing the exclusion.

### Upgrade notes

1. Review the app manifest changes, regenerate the lockfile and run
   `npm run check -- --standalone all`. Owner-modified TypeScript versions are
   preserved and reported by the updater; migrate those apps deliberately.
   Keep root `typescript` on 6.0.3 for the import checker. Apps use their own
   TypeScript 7 compiler; owner tools that import `typescript` from an app need
   a deliberate API migration. The template self-test verifies that npm selects
   the app's declared compiler for workspace builds.
2. Review the new shared CodeQL workflow and configuration, preserving owner
   scan choices. If GitHub CodeQL Default Setup is enabled, switch to Advanced
   Setup in Settings → Advanced Security; Default Setup blocks this workflow's
   uploads. This repository setting is not changed by `update-template`.
   Verify successful Actions and JavaScript/TypeScript analyses on the default
   branch and a PR. Code scanning availability depends on repository visibility
   and the owner's GitHub plan.
3. Keep the `@types/node` major exclusion in both npm Dependabot entries while
   `.node-version` stays on Node 24; update these together for a runtime change.
4. Close open Dependabot PRs that raise a major version of root `typescript`,
   the Markdown link-check tooling or `@types/node` with
   `@dependabot ignore this major version`. They fail the check or diverge from
   the template; the new exclusions stop further ones.

## 0.2.1

### Changes

- Dependabot also monitors the app skeleton's npm dependencies, including
  React, Vite and the PWA stack. The coordinated sempods SDK packages remain
  excluded and use `sdk-update`.
- The upstream contribution guide states MIT-0 for original template material
  and preserves imported SDK licences, DCO and AI attribution rules.

### Upgrade notes

1. Review the new npm entry in `.github/dependabot.yml` for
   `/.sempods/skeleton/app`, keeping any owner-specific settings.
2. `CONTRIBUTING.md` is owner-owned after setup. The updater does not add or
   overwrite it in existing copies. The upstream guide applies to template
   contributions; an instance owner may replace or remove the inherited guide
   and sets their own app contribution policy.
3. Run `npm run check -- --standalone all`. This release changes no app code or
   dependency versions.

## 0.2.0

First tagged release. Repositories created earlier have template version 0.1.0
without a tag; `update-template` uses the template history as their base.

### Changes

- **SDK 0.3.0 with its shipped reference.** The root `package.json` installs
  `@sempods/app-sdk` and `@sempods/client-sdk` too, so
  `node_modules/@sempods/app-sdk/docs/ai-app-builder.md` exists after `npm ci`,
  before the first app. The template's `reference/sempods-sdk/` snapshot is
  gone. `check` requires one SDK version in the root, the skeleton, all apps
  and the installed packages, and an installed SDK that ships its reference.
- **Dark appearance.** The skeleton's `src/index.css` opts into
  `color-scheme: light dark` with page colours that match the SDK defaults.
- **SDK updates.** `npm run sdk-update -- <version|latest>` moves both SDK
  packages together in the root, the skeleton and every app, regenerates the
  lockfile and runs `check`. The weekly SDK update workflow
  (`.github/workflows/sdk-update.yml`) does the same on a branch, opens a pull
  request linking the SDK migration guide and starts the check workflow for
  it. Dependabot now also proposes grouped npm updates, except the SDK.
- **Template updates.** `npm run update-template`, the update-template skill,
  `.sempods/update-policy.json` and this changelog.
- **App workflow.** Follow-ups from the first exercises: distinct labels next to
  the SDK controls, vocabulary guidance, in-page confirmation instead of native
  dialogs, `useSdkLocale().format` for dates and numbers, and stopping only the
  started dev server, never processes by port.
- **Editor settings.** `.gitignore` ignores `.idea/` and `.vscode/`.

### Upgrade notes

1. **From 0.1.0:** shared files that the owner changed were merged against the
   template history and may carry conflict markers; resolve them keeping the
   owner's intent. `reference/sempods-sdk/` is removed.
2. **SDK 0.2.0 to 0.3.0.** All manifests now name 0.3.0. Read the installed
   `node_modules/@sempods/app-sdk/docs/migration.md`, section "From 0.2 to
   0.3", and adapt each app:
   - a field annotated as plain `TextField` drafts as `string | null`; use
     `TextField<false>` for required fields;
   - `AppShell` now shows the new access UI. App buttons next to it need no
     extra labels, and tests that matched raw context IRIs need updating.
3. **Apps adapted from SDK examples** (for example `src/pwa.ts` and
   `src/NewVersionNotice.tsx`) may mention `reference/sempods-sdk` in their
   licence header. The report lists each one. Change the mention to "the
   LICENSE and NOTICE of the @sempods/app-sdk package"; keep the rest of the
   header.
4. **Dark appearance for existing apps.** Each app's `src/index.css` is the
   owner's. Offer the skeleton's change: `color-scheme: light dark` and
   `light-dark()` page colours in `:root`. Apply it only with the owner's
   agreement, and check both appearances in the browser.
5. **Setup record.** The setup record in `INIT.md` is kept verbatim. If it
   names the SDK version of the `reference/sempods-sdk` snapshot, add the line
   "SDK version at setup (`@sempods/app-sdk` in the root `package.json`)" with
   the version the repository started with, and keep the starting template
   version unchanged.
6. **Automatic SDK update pull requests.** The SDK workflow can open pull
   requests only if the repository allows it: Settings → Actions → General →
   Workflow permissions → "Allow GitHub Actions to create and approve pull
   requests", subject to organisation policy. Check the setting with the
   owner (`gh api repos/<owner>/<repo>/actions/permissions/workflow`, field
   `can_approve_pull_request_reviews`) and add the line "Automatic SDK updates
   / Actions PR setting" with the result to the setup record in `INIT.md`. If
   it stays disabled, automatic SDK updates are unavailable;
   `npm run sdk-update` and a pull request opened with the owner's access
   remain. Never ask for a token.
7. Run `npm run check -- --standalone all`, then list what the owner should try
   on the Pod: sign-in, the app's main flows, and light and dark appearance.
