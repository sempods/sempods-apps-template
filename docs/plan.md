# Plan

Status: **draft for review.** It implements the [vision](vision.md). The owner
decides any further scope changes. The plan is retired once M4 is reached;
issues own later scope.

## Decisions

Owner direction, 2026-10-05: vibe-coding is the standard user journey here;
production apps are PWAs by default. The SDK focuses on direct code-first use
and owns technical contracts. These decisions survive retirement of this plan in
the maintained vision and workflow guides.

| #   | Question              | Decision / proposal                                                                                                                                                                                                                                                                                                                                             | Needed for |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D1  | Visibility            | Private through M3; public and marked as a GitHub template only in M4, with owner authorization.                                                                                                                                                                                                                                                                | M4         |
| D2  | Template licence      | **Decided: MIT-0** for original template code and documentation. Copied SDK references and examples retain their own licences and notices; SDK dependencies remain Apache-2.0. Trademark rules are separate.                                                                                                                                                    | M1         |
| D3  | Hosting layout        | One site, one app per path (`/konsum/`), for apps that trust each other's JavaScript. Paths and DIDs do not create browser security isolation; use separate origins where needed.                                                                                                                                                                               | M3         |
| D4  | Package manager       | **Decided: npm workspaces.** Matches the SDK quickstart and ships with Node. Declare dependencies in each app; verify standalone installation/build. Set `ignore-scripts=true` and `save-exact=true`; M1 verifies the selected stack works with those settings. A later tool change needs fresh install/build checks as well as updated commands and lockfiles. | M1         |
| D5  | Instructions          | Root AGENTS.md serves the instance owner's assistant. Thin skill/tool entries route to one maintained app workflow. Template-maintainer rules live in `docs/maintaining.md`, linked only for that role.                                                                                                                                                         | M1         |
| D6  | Template updates      | No automatic instance updates in M1–M4. Record the starting template revision and keep template-owned logic small. Decide a later update path from real instances.                                                                                                                                                                                              | later      |
| D7  | Standard user journey | **Decided: vibe-coding.** Short user guidance and copyable prompts lead into a complete assistant workflow. SDK guides remain the technical source for direct code-first use; coordinate later entry-page changes without breaking existing links.                                                                                                              | M1         |
| D8  | Installation          | **Decided: PWA by default** for generated production apps, with an explicit per-app opt-out. Device support claims require evidence; a browser-only choice stays supported.                                                                                                                                                                                     | M1/M3      |

## Target layout

```text
README.md              short user introduction and starter prompt
AGENTS.md              instruction map for the owner's coding assistant
.agents/skills/        thin app-workflow skill entry; tool adapters as needed
CLAUDE.md              pointer to AGENTS.md (other assistants: their equivalent)
INIT.md                one-time setup conversation; marked done afterwards
apps.json              app metadata, stable paths/ports, deployment profiles, PWA choice
apps/<id>/             one app, quickstart layout (Vite, React, app-sdk)
reference/sempods-sdk/ SDK docs and examples, snapshot of the installed version
scripts/               new-app, configure-app, sdk-update, check, build-site
docs/start.md          short user steps: start, change, try, publish
docs/app-workflow.md   canonical assistant workflow and handoff requirements
docs/                  vision, plan, maintaining (template-maintainer context)
```

## User and assistant entry points (M1)

These are planned artifacts, not working commands in this planning PR. The
README stays short: what you can make, a Pod and coding assistant as
prerequisites for a real-data trial, and one copyable starter prompt. Offer
GitHub's "Use this template" path as well as the CLI below. `docs/start.md` uses
brief, action-oriented steps and examples, calling its audience users, not
developers. Technical setup details belong in the assistant workflow and linked
SDK guides.

AGENTS.md links to INIT.md, the canonical app workflow, the matching SDK
snapshot and each app's decisions. The app-workflow skill and tool-specific
entry files route to these same instructions; no copied API manuals or separate
rules per assistant. Plain AGENTS.md routing must work when skill discovery is
unavailable. The workflow covers create/change, test/recover, SDK update and
deployment preparation, and records vocabulary, target, versions and evidence
for the next session. SDK contributor instructions are not app-author
instructions.

## Setup flow

```sh
gh repo create my-sempods-apps --template sempods/sempods-apps-template --private --clone
```

Then, in the repository, ask the assistant: "Read INIT.md and set up my
repository." It asks for the owner's name, the UI language and the first app
idea and test Pod/context if available; it installs dependencies, runs
`npm run new-app -- <id>`, starts the development server and builds the first
slice using the local app-workflow skill and the pinned SDK references. Until
the SDK entry pages are reorganized, its
[AI app-builder guide](https://github.com/sempods/sempods-typescript/blob/main/docs/ai-app-builder.md)
is part of those references. INIT also adapts inherited repository ownership and
maintainer settings (for example CODEOWNERS) to the instance. The template's own
contribution checks, such as the DCO sign-off workflow, stay in the template:
an instance keeps them only if its owner asks, so assistant commits in a
personal repository are not rejected for a missing sign-off. INIT records the
template revision, and marks setup done. Repeating setup must preserve existing
apps. A later app is one prompt: "New app: a shopping list with …".

No domain, hosting account or DID is needed to start. Locally, every app uses
dynamic identity with `development: 'loopback-http'`. Without a Pod, the
assistant can prepare UI and clearly records that interoperability has not been
tested. Use synthetic data in a dedicated context; users sign in themselves and
never paste credentials into prompts. The assistant reports what works and what
remains untested in short user-facing language. Publication requires the user's
direction.

## What scripts own, what the assistant does

Scripts (deterministic, tested in CI):

- `new-app`: copies the app skeleton, sets the Vite and router base to `/<id>/`,
  the callback route, a free development port and the identity configuration,
  and adds the app to `apps.json`. Before copying anything, it rejects an ID
  that is not one lowercase segment (`^[a-z][a-z0-9-]{0,39}$`), because the ID
  becomes a directory, a URL path and a `did:web` component; names reserved by
  the site (for example the overview page's assets) are rejected too. IDs, paths
  and ports are validated for collisions; rerunning must not overwrite an
  existing app. Generate PWA
  configuration by default, with a documented per-app opt-out; registration runs
  only from the production app entry.
- `configure-app` (M3): an idempotent command applies explicit local, production
  or preview profiles to an existing app from `apps.json`. It derives DID,
  callback, `returnTo`, asset base and PWA paths together, without touching user
  screens or data. Production has no loopback flag; local development keeps
  working after deployment setup. Preview identities never silently inherit the
  production DID. Fail on incomplete or inconsistent configuration rather than
  inferring a production identity from the current browser hostname.
- `sdk-update <version>`: sets one exact shared version of both SDK packages for
  all apps, refreshes `reference/sempods-sdk/` from the matching SDK tag and
  records the source revision, licences and notices. Update manifests, lockfile
  and snapshot together and preserve linked references, locally or at the same
  pinned revision. The assistant then follows the SDK's migration guide. CI
  rejects SDK version or snapshot drift, including dependency-bot PRs;
  coordinate the two SDK updates and snapshot refresh rather than merging
  independent version bumps.
- `check`: typecheck, lint and build of every app, and a check that every
  package an app imports is declared in that app's own `package.json`. Run
  script and app tests, generate an app in CI, check documentation links and
  AGENTS/skill navigation, and verify SDK/snapshot consistency. A standalone app
  install/build proves portability beyond an import lint. Use a reusable
  Markdown checker and a small navigation check; do not invent a parser or
  change sempods-spec tooling.
- `build-site` (M3): builds every app into its path of one publish folder,
  writes the per-app SPA fallbacks and generates the overview page from
  `apps.json`. It consumes validated profiles, fails if a production identity is
  missing, and links to separate app pages; it does not mount multiple app
  runtimes in a host. Each page keeps one SDK runtime owner. Preserve dependency
  notices in the output.

The assistant: the conversation, vocabulary, screens and tests of each app, and
keeping the owner's decisions in the app's development notes. It never edits
generated identity, callback or base-path settings by hand; it changes the
public profile inputs and reruns the owning script. UI customization uses SDK
contracts, not a second implementation of auth, guards or uncertain-write
recovery.

## Identity and hosting (M3)

The deployed identity of an app is `did:web:<domain>:<id>` with the callback
`https://<domain>/<id>/callback`. The Pod checks this structurally against the
callback; it fetches no DID document and needs no key
([deployment guide](https://github.com/sempods/sempods-typescript/blob/main/docs/deployment.md)).
The domain is chosen once and recorded in `apps.json`. Changing it later changes
every app's identity and requires fresh logins and grants, so the setup asks for
the durable domain before the first deployment. Generated production apps follow
the SDK's
[PWA guide](https://github.com/sempods/sempods-typescript/blob/main/docs/pwa.md)
per app path by default, with explicit opt-out and the guide's support caveats.
Keep manifest identity/start URL/scope, worker scope/cache names and callback
paths consistent for each app. Cache only the built public shell; never
intercept or cache callback, OAuth or Pod requests, never replay writes, and
never take over an open page over a draft. SDK sessions stay SDK-owned. Offline
startup is not offline editing. Installed-device sign-in must return to the
storage holding the attempt; iOS standalone behavior needs device evidence, not
an inference from desktop CI.

Public identities and profile inputs contain no secrets. Hosting credentials
stay in the host/CI secret store; Vite variables become public if bundled.
Deployment instructions preserve callback queries for the runtime to consume and
scrub. Copied SDK documentation is CC BY 4.0 and copied examples are Apache-2.0
according to the SDK's
[NOTICE](https://github.com/sempods/sempods-typescript/blob/012fa63cea292d6b63b71e3a17187710f7180d44/NOTICE);
retain that provenance within the snapshot and when adapting examples. MIT-0
describes only original template material.

## Milestones

- **M0, this plan.** Vision and plan independently reviewed at the exact head
  and merged by the owner.
- **M1, skeleton.** Layout, `new-app`, `sdk-update`, `check`, `AGENTS.md`,
  `INIT.md`, short user guidance, the app-workflow skill, maintainer guidance,
  default PWA skeleton, `.npmrc`, CI and Dependabot for npm. Accepted when a
  user can start from the short introduction and an assistant without prior
  context reaches a running example against a loopback Pod. CI verifies clean
  generation, non-destructive reruns, app tests, instruction links/version
  consistency and an app's standalone install/build. Record the authoring
  exercise separately from fixture results; this does not claim production or
  installed-device validation.
- **M2, Konsum.** The first real app, built from a short prompt. Record the
  prompt, the time taken, manual interventions and friction; friction becomes
  SDK or template issues, not app workarounds. Scope: open items, adding several
  items separated by commas (no AI), marking as bought, showing bought items,
  renaming, deleting; German UI; default design; no menu. Bought items older
  than seven days are hidden; an explicit "remove bought items" action deletes
  them. Record when an item was bought, with a defined cutoff for hiding it.
  Even this manual bulk action uses conditional deletion per observed item,
  retains changed items and exposes partial/unconfirmed outcomes without
  automatic mutation retry. Acceptance includes domain tests and an observed
  create/change/reload/delete flow using the default UI; visual customization
  alone is not an SDK gap.
- **M3, site.** `build-site`, overview page, deployment instructions (Netlify as
  the documented example), `configure-app`, `did:web` per app and default PWA.
  Accept with two apps on one origin: direct routes/callbacks, separate
  identities and session namespaces, both usable concurrently, local development
  after production setup, and a separately configured preview. Check app-scoped
  worker registration/caches, callback/Pod exclusions, offline shell and passive
  updates without draft loss. Perform actual HTTPS sign-in/CRUD at the chosen
  deployment and record target-device installation/sign-in evidence and
  remaining limits. Browser fixtures do not establish live-Pod or iOS standalone
  support.
- **M4, public.** Public template; used for events and by others. Decide whether
  the apps of `haed/sempods-apps` move into an instance. Coordinate SDK entry
  links toward this default vibe-coding journey while keeping the SDK's
  code-first quickstart, API documentation and existing external links usable.

## Later, with its own issue

- **Automatic cleanup** of bought items: per item, a conditional delete against
  the version that was seen, skipping any item that changed meanwhile. Decide
  from M2 experience whether this is app code, an SDK recipe or an SDK function.
  A Pod-side expiry (for example `schema:expires` honoured by the server) goes
  to the specification backlog as the long-term option.
- The template update path (D6).
- Widgets and shared-host embedding, following the SDK's widget guide.

## Not in this plan

In-app AI features (text2model and similar), a backend or proxy, shared hosting
for several people, and SDK changes; SDK findings are filed in the SDK
repository.
