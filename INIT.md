# Set up an instance

This is the assistant's setup procedure. Users can start with
[the short guide](docs/start.md). Follow [AGENTS.md](AGENTS.md) and preserve the
setup record below on later runs and template updates.

## Check where you are

Confirm the current repository's identity from its Git remote or GitHub
metadata, and inspect the worktree and setup record before changing anything. If
it is `sempods/sempods-apps-template`, or the task is template maintenance, use
[maintaining](docs/maintaining.md): do not adapt ownership or remove its DCO
check. A local copy without a Git remote is the owner's instance when the owner
says so; record that in the setup record. If the identity is unclear, clarify it
before repository adaptation.

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

Record the starting template version from `.sempods/VERSION` below; do not
modify that file or anything under `node_modules`. Preserve LICENSE and imported
notices. Put ongoing owner choices in [AGENTS.md](AGENTS.md#owner-instructions).
On resumed setup, completed adaptations are inspected, not reset to defaults.

## Create the first app and open it

Use the Node version in `.node-version` (M1a starts with 24.15.0) and npm. Check
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

Automatic SDK/template updates arrive in M1b; deployment configuration and site
building arrive in M3. Do not run those planned commands during this setup.

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
- Repository adaptations: not done
- Local URL and check result: not checked
- Pod exercise and remaining gaps: not tested

<!-- END INSTANCE SETUP RECORD -->
