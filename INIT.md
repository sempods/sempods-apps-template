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

Setup needs the companion skeleton: root `package.json`, `pnpm-workspace.yaml`,
`pnpm-lock.yaml`, `.node-version`, `.sempods/VERSION`,
`.sempods/scripts/new-app.mjs`, `.sempods/scripts/check.mjs` and `apps.json`;
after `pnpm install`, the SDK's
shipped reference `node_modules/@sempods/app-sdk/docs/ai-app-builder.md`. If
these are missing, report that the skeleton is not integrated. Do not invent
scripts, configuration or a replacement SDK reference to work around it.

## Choose the first interaction

Use the request and recorded answers. Ask only for missing information needed
for the first useful interaction. Use the requested UI language, or the owner's
language when supported (`de` or `en`). Choose a short app ID from the idea,
such as `konsum`, and tell the owner; the generator validates allowed IDs and
reserved names. Record choices and progress as they become known.

A name, GitHub review identity and automatic-update settings are not needed to
try an app. Do not ask for them before the first local interaction. A missing
Pod also allows UI work; record Pod testing as pending. Before accessing a Pod,
use the owner's full test Pod URL and a dedicated context, with synthetic data.

## Create the first app and open it

Use the Node version in `.node-version` and pnpm. Check
`node --version` first. If it differs, switch with the owner's version manager,
naming the version from `.node-version` explicitly (for example `nvm install
24.15.0`, `fnm use --install-if-missing 24.15.0`, or with mise prefix each
command: `mise exec node@24.15.0 -- pnpm install`; not every manager reads
`.node-version` by default). Do not write a version-manager config into the
repository (for example with `mise use`): `.node-version` stays the only source.
Otherwise ask the owner to install that version; do not work around it.
`pnpm-workspace.yaml` sets `engineStrict`, so `pnpm install` stops on an older
Node.

Then check `pnpm --version`. If pnpm is missing, Node 24 brings Corepack:
`corepack enable pnpm`. Without Corepack (Node 25 and later), or if it cannot
write to Node's directory, use `npm install --global pnpm@11`. Ask the owner
before installing globally. pnpm 10 or newer switches to the version that
`packageManager` in `package.json` pins. From the repository root, install the
committed dependencies:

```sh
pnpm install --frozen-lockfile
pnpm run new-app konsum --title "Einkaufsliste" --language de
pnpm run dev konsum
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
first useful interaction. If a test Pod is available, let the user sign in in
the browser and select their test context. Run `pnpm run check` in another
terminal and report its result.

## Adapt the user's copy

Do this after the first useful interaction is available locally. Inspect
existing files before changing them. In a fresh instance, replace inherited
maintainer handles in `.github/CODEOWNERS` if the owner has already chosen a
review user/team. Otherwise remove only the inherited assignments and record
review identity as deferred. Preserve relevant patterns and owner-created
entries; never leave `@haed` assigned merely because it came from the template.
Choosing a review owner can wait and does not block local app work.

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

## Choose repository preferences (optional)

After the owner can try the first interaction, offer to set a GitHub review
owner and enable automatic SDK update PRs. Use choices already given. If the
owner has not chosen these preferences, leave them deferred; do not wait for an
answer to finish local setup. If the owner wants review rules, ask for the
GitHub user/team unless it is known; do not infer a handle from a display name.
Update `.github/CODEOWNERS` while
preserving owner-created entries. Record the owner's name if provided; it is
not a prerequisite for setup.

Record deferred preferences individually in the existing setup record and
continue app work. Do not inspect remote settings for deferred automatic
updates or repeat deferred questions on a resumed run unless the owner asks to
revisit them.

## Enable automatic SDK update PRs

Scheduled SDK updates require the optional root field `sdkAutoUpdates: true`
in the owner's `apps.json` on the repository's default branch. An absent field
or `false` keeps the update job off, even if Actions permits PR creation or an
organization variable enables updates elsewhere. Leave the field absent for a
new copy while the choice is deferred. A read-only job checks this committed
choice; manual workflow dispatch and local updates remain available. Preserve
an existing explicit opt-in on a resumed setup.

When the owner chooses automatic updates, use their existing GitHub access to
inspect the repository's Actions workflow permissions (for example
`gh api repos/<owner>/<repo>/actions/permissions/workflow`;
`can_approve_pull_request_reviews` reports the PR creation/approval setting).
If access cannot read the setting, have the owner inspect it in the UI; do not
assume it is enabled. Guide the owner to **Settings → Actions → General →
Workflow permissions → Allow GitHub Actions to create and approve pull
requests**, subject to organization policy. The update job's YAML permissions
alone do not enable it.

Once PR creation is allowed, add `"sdkAutoUpdates": true` at the root of
`apps.json`, preserving its app entries and other owner settings. Run
`pnpm run check` and include this change in the owner's normal commit/PR flow.
Scheduled updates remain off until the choice reaches the default branch;
verify the committed field and record it alongside the observed Actions
setting and owner's choice below. If the change is not yet on the default
branch, record activation as pending. To turn scheduled updates off, set the
field to `false` through the same flow; keep manual dispatch. Template updates
and app generation preserve this owner-owned field.

If it stays disabled, report **automatic SDK updates unavailable**. The local
`pnpm run sdk-update <version|latest>` command and an assistant-created PR
using the owner's existing GitHub access remain available. Never ask for a
token. Keep the check workflow's manual-dispatch trigger: the SDK workflow
opens its PR with `GITHUB_TOKEN`, then dispatches checks for that branch.

## Finish setup

Run `pnpm run check` again after the inherited-file adaptations. Mark setup
**done** only when those adaptations are recorded, the chosen app starts at its
assigned URL, its first useful interaction is available and local checks pass.
Deferred review identity or automatic updates do not
block completion; keep their status visible in the setup record. Record command
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
