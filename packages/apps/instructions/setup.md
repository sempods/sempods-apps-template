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
for the first useful interaction. Apps follow the browser's language, German
or English (otherwise English), and carry their texts in both; record the
owner's language for writing them. Fix one language (`--language de` or `en`)
only when the owner asks for it. If the owner's language is neither, the UI
still shows English and German only: tell the owner.
Choose a short app ID from the idea, such as `konsum`, and tell the owner; the
generator validates allowed IDs and reserved names. Record choices and
progress as they become known.

A name, GitHub review identity and the version PR choice are not needed to
try an app. Do not ask for them before the first local interaction. A missing
Pod also allows UI work; record Pod testing as pending. Before accessing a Pod,
use the owner's full test Pod URL and a dedicated context (one per context the
app's shape uses), with synthetic data.

## Create the first app and open it

From the repository root, after the bootstrap in `INIT.md`:

```sh
pnpm run new-app konsum --title "Einkaufsliste"
pnpm run dev konsum
```

Replace the example ID and title with the recorded choices. PWA is on
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
interaction. Once the app starts, ask once whether they have a test Pod for
trying it with data, unless the setup record answers that: without one, only
the sign-in screen can be seen. If so,
let the user sign in in the browser and select their test contexts; otherwise
record Pod testing as pending. Run `pnpm run check` in another terminal and
report its result.

## Choose repository preferences (optional)

After the owner can try the first interaction, offer to set a GitHub review
owner and to enable version PRs for the SDK and the tooling. Use choices
already given. If the owner has not chosen these preferences, leave them
deferred; do not wait for an answer to finish local setup. If the owner wants
review rules, ask for the GitHub user/team unless it is known; do not infer a
handle from a display name. Write `.github/CODEOWNERS` for it, preserving
entries the owner already has. Record the owner's name if provided; it is not
a prerequisite for setup.

Record each preference in its setup record field and continue app work:
`deferred` for an open choice, otherwise the choice and what you verified, for
example `enabled; on the default branch` or `pending; not yet on the default
branch`. Do not repeat deferred questions on a resumed run unless the owner
asks to revisit them.

## Enable sempods version PRs

Dependabot opens version PRs for the repository's dependencies, but not for
the sempods packages until the owner opts in. In `.github/dependabot.yml`, the
entry between `# BEGIN OWNER SEMPODS UPDATES` and `# END OWNER SEMPODS
UPDATES` keeps them out. When the owner chooses version PRs, remove that entry
and keep the marker lines; tooling updates keep this section as the owner left
it. Commit the change in the owner's normal commit/PR flow. It takes effect
once it reaches the default branch; record it as pending until then. To turn
the PRs off again, restore the entry between the markers.

With the opt-in, Dependabot opens one PR that moves both SDK packages in the
root and every app, and a separate PR for `@sempods/apps`. An SDK PR follows
[Update the SDK](app-workflow.md#update-the-sdk); a tooling PR follows the
[update skill](../skills/update/SKILL.md). Security updates are separate: the
repository's security settings enable them, and they reach the sempods
packages with or without this opt-in. Neither needs an Actions permission or
a token; never ask for one.

## Finish setup

Run `pnpm run check` again. Mark setup **done** only when the chosen app starts
at its assigned URL, its first useful interaction is available, local checks
pass and the owner has seen the screen and given a verdict (or, without a test
Pod, the sign-in screen, with the rest recorded as pending). Deferred review identity or version PRs do not block completion;
keep their status visible in the setup record. Record command results and
remaining gaps separately: no Pod, incomplete login or untested installed-PWA
behavior are not successful interoperability evidence. If setup is already
done, reopen the recorded app and follow its notes; do not recreate it.

SDK updates use the [app workflow](app-workflow.md#update-the-sdk). Tooling
updates follow the [update skill](../skills/update/SKILL.md) when the owner
asks for one; do not change the `@sempods/apps` version by hand. Publishing
follows the [publish guide](publish.md) when the owner asks for it.
