# Set up an apps repository

This is the assistant's setup procedure for a repository created from the
sempods apps starter. The repository's `INIT.md` holds the bootstrap steps and
the setup record; record progress only there. Follow the repository's
`AGENTS.md`.

## Check where you are

Inspect the worktree and the setup record before changing anything. The
repository needs `package.json`, `pnpm-workspace.yaml`, `.node-version`,
`apps.json` and `.sempods-baseline.json`; after `pnpm install`, the tooling
package `node_modules/@sempods/apps` and the SDK's reference
`node_modules/@sempods/app-sdk/docs/ai-app-builder.md`. If these are missing,
report that the repository is incomplete. Do not invent scripts, configuration
or a replacement SDK reference to work around it. Record the package and
version from `.sempods-baseline.json` in the setup record; do not edit that
file or anything under `node_modules`.

## Choose the first interaction

Use the request and recorded answers. Ask only for missing information needed
for the first useful interaction. Use the requested UI language, or the owner's
language when supported (`de` or `en`); otherwise use `en` and tell the owner.
Choose a short app ID from the idea, such as `konsum`, and tell the owner; the
generator validates allowed IDs and reserved names. Record choices and
progress as they become known.

A name, GitHub review identity and automatic-update settings are not needed to
try an app. Do not ask for them before the first local interaction. A missing
Pod also allows UI work; record Pod testing as pending. Before accessing a Pod,
use the owner's full test Pod URL and a dedicated context, with synthetic data.

## Create the first app and open it

From the repository root, after the bootstrap in `INIT.md`:

```sh
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

Continue with the [app workflow](app-workflow.md) for the first useful
interaction. Once the owner can try the screen, ask once whether they have a
test Pod for trying it with data, unless the setup record answers that. If so,
let the user sign in in the browser and select their test context; otherwise
record Pod testing as pending. Run `pnpm run check` in another terminal and
report its result.

## Choose repository preferences (optional)

After the owner can try the first interaction, offer to set a GitHub review
owner and enable automatic SDK update PRs. Use choices already given. If the
owner has not chosen these preferences, leave them deferred; do not wait for an
answer to finish local setup. If the owner wants review rules, ask for the
GitHub user/team unless it is known; do not infer a handle from a display name.
Write `.github/CODEOWNERS` for it, preserving entries the owner already has.
Record the owner's name if provided; it is not a prerequisite for setup.

Record each preference in its setup record field and continue app work:
`deferred` for an open choice, otherwise the choice and what you verified, for
example `enabled; sdkAutoUpdates true on the default branch; PR creation
allowed` or `pending; PR creation not yet allowed`. Do not inspect remote
settings for deferred automatic updates or repeat deferred questions on a
resumed run unless the owner asks to revisit them.

## Enable automatic SDK update PRs

Scheduled SDK updates require the optional root field `sdkAutoUpdates: true`
in the owner's `apps.json` on the repository's default branch. An absent field
or `false` keeps the update job off, even if Actions permits PR creation or an
organization variable enables updates elsewhere. Leave the field absent while
the choice is deferred. A read-only job checks this committed choice; manual
workflow dispatch and local updates remain available. Preserve an existing
explicit opt-in on a resumed setup.

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
setting and owner's choice. If the change is not yet on the default branch,
record activation as pending. To turn scheduled updates off, set the field to
`false` through the same flow; keep manual dispatch. App generation preserves
this owner-owned field.

If it stays disabled, report **automatic SDK updates unavailable**. The local
`pnpm run sdk-update <version|latest>` command and an assistant-created PR
using the owner's existing GitHub access remain available. Never ask for a
token. Keep the check workflow's manual-dispatch trigger: the SDK workflow
opens its PR with `GITHUB_TOKEN`, then dispatches checks for that branch.

## Finish setup

Run `pnpm run check` again. Mark setup **done** only when the chosen app starts
at its assigned URL, its first useful interaction is available and local checks
pass. Deferred review identity or automatic updates do not block completion;
keep their status visible in the setup record. Record command results and
remaining gaps separately: no Pod, incomplete login or untested installed-PWA
behavior are not successful interoperability evidence. If setup is already
done, reopen the recorded app and follow its notes; do not recreate it.

SDK updates use the [app workflow](app-workflow.md#update-the-sdk). Publishing
follows the [publish guide](publish.md) when the owner asks for it. Updating
the tooling package together with the repository's shared files is not
supported yet for repositories created from the starter; do not change the
`@sempods/apps` version by hand.
