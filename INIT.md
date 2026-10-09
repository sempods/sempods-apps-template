# Set up an instance

This is the assistant's setup procedure. Users can start with
[the short guide](docs/start.md). Follow [AGENTS.md](AGENTS.md) and preserve the
setup record below on later runs and template updates.

## Check where you are

Inspect the worktree and setup record before changing anything. Setup adapts
the owner's own copy. If the Git remote is `sempods/sempods-apps-template`
itself, do not adapt it: tell the user to create their own copy as described in
the [README](README.md#start-with-your-idea). A local copy without a Git remote
is the owner's instance when the owner says so; record that in the setup record.

Setup needs the companion skeleton: root `package.json`, `package-lock.json`,
`.node-version`, `.sempods/VERSION`, `.sempods/scripts/new-app.mjs`,
`.sempods/scripts/check.mjs` and `apps.json`; after `npm ci`, the SDK's
shipped reference `node_modules/@sempods/app-sdk/docs/ai-app-builder.md`. If
these are missing, report that the skeleton is not integrated. Do not invent
scripts, configuration or a replacement SDK reference to work around it.

## Ask once, then keep the answers

Use answers already given. Gather the owner's name, preferred UI language (`de`
or `en`), first app idea and, if available, full test Pod URL and dedicated
context. Ask for the GitHub user/team that should own this repository's review
rules if it is not already known. Do not infer a GitHub handle from a display
name. A missing Pod does not prevent local UI work; record Pod testing as
pending.

Choose a short app ID with the user, such as `konsum`. Use the generator's
validation; it owns allowed IDs and reserved names. Record choices and progress
below as they become known. Ask only for missing decisions on a resumed run.

## Adapt the user's copy

Inspect existing files before changing them. In a fresh instance, replace
inherited template maintainer handles in `.github/CODEOWNERS` with the owner's
chosen user/team, preserving relevant patterns. If no review owner is wanted,
remove only the inherited assignments and record that choice. Preserve any
owner-created entries; never leave `@haed` assigned merely because it came from
the template.

Remove the inherited `.github/workflows/dco.yml` unless the owner asks to keep
it. The comments in `.github/dependabot.yml` and `.github/CODEOWNERS` do not
depend on it; keep those files apart from the review handles. This applies only to the known template DCO workflow: if it was customized,
clarify its purpose rather than deleting it. Keep app validation workflows.
Repository or organization rules may still require DCO; report that separately
rather than changing remote rules or claiming workflow removal changes them. Do
not invent an author identity or sign-off on the owner's behalf.

Remove the template's contributor documents, which do not apply to the owner's
apps: `CONTRIBUTING.md`, `docs/maintaining.md`, `docs/plan.md` and
`docs/vision.md`. Keep `CONTRIBUTING.md` if the owner wants a contribution
policy of their own, and adapt it. Template updates do not bring them back.

Record the starting template version from `.sempods/VERSION` below; do not
modify that file or anything under `node_modules`. Preserve LICENSE and imported
notices. Put ongoing owner choices in [AGENTS.md](AGENTS.md#owner-instructions).
On resumed setup, completed adaptations are inspected, not reset to defaults.

## Enable automatic SDK update PRs

Using the owner's existing GitHub access, inspect the repository's Actions
workflow permissions (for example `gh api repos/<owner>/<repo>/actions/permissions/workflow`;
`can_approve_pull_request_reviews` reports the PR creation/approval setting).
If access cannot read the setting, have the owner inspect it in the UI; do not
assume it is enabled. Guide the owner to **Settings → Actions → General →
Workflow permissions → Allow GitHub Actions to create and approve pull
requests**, subject to organization policy. The update job's YAML permissions
alone do not enable it. Record the observed setting and owner's choice below.

If it stays disabled, report **automatic SDK updates unavailable**. The local
`npm run sdk-update -- <version|latest>` command and an assistant-created PR
using the owner's existing GitHub access remain available. Never ask for a
token. Keep the check workflow's manual-dispatch trigger: the SDK workflow
opens its PR with `GITHUB_TOKEN`, then dispatches checks for that branch.

## Create the first app and open it

Use the Node version in `.node-version` and npm. Check
`node --version` first. If it differs, switch with the owner's version manager,
naming the version from `.node-version` explicitly (for example `nvm install
24.15.0`, `fnm use --install-if-missing 24.15.0`, or with mise prefix each
command: `mise exec node@24.15.0 -- npm ci`; not every manager reads
`.node-version` by default). Do not write a version-manager config into the
repository (for example with `mise use`): `.node-version` stays the only source.
Otherwise ask the owner to install that version; do not work around it. `.npmrc`
sets `engine-strict`, so `npm ci` stops with `EBADENGINE` on an older Node. From
the repository root, install the committed dependencies:

```sh
npm ci
npm run new-app -- konsum --title "Einkaufsliste" --language de
npm run dev -- konsum
```

Replace the example ID, title and language with the recorded choices. PWA is on
by default; `--no-pwa` is available if the owner chooses it when creating an
app. The dev server is long-running: keep it in a separate terminal/session.
Open the exact URL it reports; `apps.json` records the assigned `devPort` and
`path`. Do not switch hostnames or ports during sign-in.

Before calling `new-app`, check both the manifest and `apps/<id>/`. If the
recorded first app already exists consistently in both, reuse it and its notes;
skip generation. If only one exists, or the existing app may be unrelated, stop
that step and explain the mismatch. Never delete the folder, rewrite the
manifest or choose another ID silently to make setup pass. A failed command
leaves setup in progress; diagnose it before proceeding.

Continue with the [app workflow](.sempods/instructions/app-workflow.md) for the
first useful interaction. Let the user sign in in the browser and select their
test context. Run `npm run check` in another terminal and report its result.

Mark setup **done** only when the repository adaptations are recorded, the
chosen app starts at its assigned URL and local checks pass. Record the command
results and remaining gaps separately: no Pod, incomplete login or untested
installed-PWA behavior are not successful interoperability evidence. If setup is
already done, reopen the recorded app and follow its notes; do not recreate it
or repeat ownership changes.

SDK updates use the [app workflow](.sempods/instructions/app-workflow.md#update-the-sdk).
Template updates follow the
[update-template skill](.sempods/skills/update-template/SKILL.md) when the owner
asks for one; do not run an update during this setup. Deployment configuration
and site building are not available yet.

## Instance setup record

The assistant updates only this record as setup progresses; template updates
preserve it. Keep it free of credentials and private data. Once recorded, the
starting template version remains the version this instance began with.

<!-- BEGIN INSTANCE SETUP RECORD -->

- Status: not started
- Starting template version (`.sempods/VERSION`): not recorded
- SDK version at setup (`@sempods/app-sdk` in the root `package.json`): not recorded
- Owner and review identity: not recorded
- UI language: not selected
- First app ID and idea: not selected
- Test Pod/context: not selected (optional; synthetic data only)
- Automatic SDK updates / Actions PR setting: not checked
- Repository adaptations: not done
- Local URL and check result: not checked
- Pod exercise and remaining gaps: not tested

<!-- END INSTANCE SETUP RECORD -->
