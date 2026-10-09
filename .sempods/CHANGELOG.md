# Template changelog

Each release lists what changed and **upgrade notes** for the assistant that
applies it with the [update-template skill](skills/update-template/SKILL.md).
`update-template` replaces `.sempods/`, merges shared files and updates
template entries in the manifests. The notes cover what it cannot decide
alone: owner files, configuration choices and the SDK migration.

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

1. `update-template` updates the root and skeleton manifests. Then run
   `npm run sdk-update -- 0.5.0` so every registered app moves to the same SDK
   version, and run `npm run check -- --standalone all`.
2. Review the SDK migration
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
3. Apps that copied the 0.4 overview recipe's `EditInContext` keep working. To
   replace it with `useContextEditor`, ask the owner first: the row no longer
   selects its Context.
4. For an existing app that only reads, add that decision and the contexts it
   reads to its `NOTES.md` when you next work on it.
5. `update-template` regenerates `src/sempods.generated.ts` in every app; the
   exported `runtimeOptions` keep their shape. Existing apps keep their own
   test setup. To give one the skeleton's, ask the owner first, then copy
   `.sempods/skeleton/app/tsconfig.test.json`, add it to the app's
   `tsconfig.json` references and exclude `src/**/*.test.ts` and
   `src/**/*.test.tsx` from its `tsconfig.app.json`. An app whose tests already
   read Node APIs some other way can keep them.
6. The contributor documents `CONTRIBUTING.md`, `docs/maintaining.md`,
   `docs/plan.md` and `docs/vision.md` describe work on the template, not on
   the owner's apps. Offer to remove them; keep `CONTRIBUTING.md` if the owner
   adapted it for their own repository. First check that no kept file links to
   them, so `npm run check` stays green. Template updates do not bring them
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
