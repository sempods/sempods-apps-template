# Template changelog

Each release lists what changed and **upgrade notes** for the assistant that
applies it with the [update-template skill](skills/update-template/SKILL.md).
`update-template` replaces `.sempods/`, merges shared files and updates
template entries in the manifests. The notes cover what it cannot decide
alone: owner files, configuration choices and the SDK migration.

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
