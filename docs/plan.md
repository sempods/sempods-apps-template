# Plan

Status: **draft for review.** It implements the [vision](vision.md). Decisions
marked _owner_ need the maintainer's choice before the milestone that depends on
them. The plan is retired once M4 is reached; issues own later scope.

## Decisions

| #   | Question                                | Proposal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Needed for |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| D1  | Visibility                              | Private until M3, then public and marked as a GitHub template.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | M4         |
| D2  | Licence of template content             | **Decided: MIT-0** for code and documentation. Instances copy every file and should belong to their owner: MIT-0 has no conditions, so an owner may replace or remove the licence file. Apache-2.0 (as elsewhere in sempods) would mix the maintainer's licence and NOTICE with the owner's own work in every instance. The SDK packages remain Apache-2.0 as dependencies; trademark rules apply independently of either licence.                                                                                 | M1         |
| D3  | Hosting layout                          | One site, one app per path (`/konsum/`), the SDK's documented [several apps under one site](https://github.com/sempods/sempods-typescript/blob/main/docs/deployment.md#several-apps-under-one-site) pattern. Valid because one repository is one trust boundary. Separate origins stay possible for an app that must be isolated.                                                                                                                                                                                  | M3         |
| D4  | Package manager                         | **Decided: npm workspaces.** npm ships with Node, so setup needs no extra tool, and the SDK's quickstart and AI guide use the same commands. pnpm's two advantages are covered: `check` fails when an app imports a package its own `package.json` does not declare (so every app can move out), and `.npmrc` sets `ignore-scripts=true` (no install scripts of new dependencies run; M1 verifies the stack needs none) and `save-exact=true`. Switching later only regenerates the lockfile and updates commands. | M1         |
| D5  | Whose instructions `AGENTS.md` contains | `AGENTS.md` serves the instance owner's assistant (adding and changing apps), because every instance inherits it. Rules for maintaining the template itself live in `docs/maintaining.md`, linked from `AGENTS.md` for that case only.                                                                                                                                                                                                                                                                             | M1         |
| D6  | Template updates for existing instances | Not automatic in M1–M4. Each instance records the template revision it started from; template-owned logic stays small and in scripts. A later update path (an npm `create`/`sync` package or an update instruction) is decided from real instances.                                                                                                                                                                                                                                                                | later      |

## Target layout

```text
AGENTS.md              instructions for the owner's coding assistant
CLAUDE.md              pointer to AGENTS.md (other assistants: their equivalent)
INIT.md                one-time setup conversation; marked done afterwards
apps.json              manifest: id, title, description, path, dev port
apps/<id>/             one app, quickstart layout (Vite, React, app-sdk)
reference/sempods-sdk/ SDK docs and examples, snapshot of the installed version
scripts/               new-app, sdk-update, check, build-site
docs/                  vision, plan, maintaining (template only)
```

## Setup flow

```sh
gh repo create my-sempods-apps --template sempods/sempods-apps-template --private --clone
```

Then, in the repository, ask the assistant: "Read INIT.md and set up my
repository." It asks for the owner's name, the UI language and the first app
idea; it installs dependencies, runs `npm run new-app -- <id>`, starts the
development server and builds the first slice following the SDK's
[AI app-builder guide](https://github.com/sempods/sempods-typescript/blob/main/docs/ai-app-builder.md).
A later app is one prompt: "New app: a shopping list with …".

No domain, hosting account or DID is needed to start. Locally, every app uses
dynamic identity with `development: 'loopback-http'`.

## What scripts own, what the assistant does

Scripts (deterministic, tested in CI):

- `new-app`: copies the app skeleton, sets the Vite and router base to `/<id>/`,
  the callback route, a free development port and the identity configuration,
  and adds the app to `apps.json`.
- `sdk-update <version>`: sets one exact shared version of both SDK packages for
  all apps, refreshes `reference/sempods-sdk/` from the matching SDK tag and records
  the source revision. The assistant then follows the SDK's migration guide.
- `check`: typecheck, lint and build of every app, and a check that every
  package an app imports is declared in that app's own `package.json`.
- `build-site` (M3): builds every app into its path of one publish folder, writes
  the per-app SPA fallbacks and generates the overview page from `apps.json`.

The assistant: the conversation, vocabulary, screens and tests of each app, and
keeping the owner's decisions in the app's development notes. It never edits
identity, callback or base-path settings by hand; it reruns the script instead.

## Identity and hosting (M3)

The deployed identity of an app is `did:web:<domain>:<id>` with the callback
`https://<domain>/<id>/callback`. The Pod checks this structurally against the
callback; it fetches no DID document and needs no key
([deployment guide](https://github.com/sempods/sempods-typescript/blob/main/docs/deployment.md)).
The domain is chosen once and recorded in `apps.json`. Changing it later changes
every app's identity and requires fresh logins and grants, so the setup asks for
the durable domain before the first deployment. Installable apps follow the SDK's
[PWA guide](https://github.com/sempods/sempods-typescript/blob/main/docs/pwa.md)
per app path; this is optional and keeps the guide's support caveats.

## Milestones

- **M0, this plan.** Vision and plan reviewed (Codex reviews the exact head) and
  merged by the owner.
- **M1, skeleton.** Layout, `new-app`, `sdk-update`, `check`, `AGENTS.md`,
  `INIT.md`, `docs/maintaining.md`, `.npmrc`, CI and Dependabot for npm. Accepted when an
  assistant without prior context goes from `INIT.md` to a running example app
  against a loopback Pod, and CI checks a freshly generated app.
- **M2, Konsum.** The first real app, built from a short prompt. Record the
  prompt, the time taken, manual interventions and friction; friction becomes SDK
  or template issues, not app workarounds. Scope: open items, adding several
  items separated by commas (no AI), marking as bought, showing bought items,
  renaming, deleting; German UI; default design; no menu. Bought items older than
  seven days are hidden; an explicit "remove bought items" action deletes them.
- **M3, site.** `build-site`, overview page, deployment instructions (Netlify as
  the documented example), `did:web` per app, optional PWA.
- **M4, public.** Public template; used for events and by others. Decide whether
  the apps of `haed/sempods-apps` move into an instance.

## Later, with its own issue

- **Automatic cleanup** of bought items: per item, a conditional delete against
  the version that was seen, skipping any item that changed meanwhile. Decide from
  M2 experience whether this is app code, an SDK recipe or an SDK function. A
  Pod-side expiry (for example `schema:expires` honoured by the server) goes to the
  specification backlog as the long-term option.
- The template update path (D6).
- Widgets and shared-host embedding, following the SDK's widget guide.

## Not in this plan

AI features (text2model and similar), a backend or proxy, shared hosting for
several people, and SDK changes; SDK findings are filed in the SDK repository.
