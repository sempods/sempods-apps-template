# Plan

Status: **draft for review.** It implements the [vision](vision.md). The owner
decides any further scope changes. The plan is retired once M4 is reached;
issues own later scope.

## Decisions

Owner direction, 2026-10-05: vibe-coding is the standard user journey here;
production apps are PWAs by default. This template is the personal playground
for quick apps; the SDK is the deliberate foundation for demanding apps, modules
and services, owns the technical contracts and keeps its single-app guidance,
including the AI app-builder guide. These decisions survive retirement of this
plan in the maintained vision and workflow guides.

| #   | Question              | Decision / proposal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Needed for |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D1  | Visibility            | Enable the GitHub template setting before the M1 setup exercise, while the repository remains private. Keep it private through M3; change visibility to public only in M4, with owner authorization.                                                                                                                                                                                                                                                                                                                          | M1/M4      |
| D2  | Template licence      | **Decided: MIT-0** for original template code and documentation. Copied SDK references and examples retain their own licences and notices; SDK dependencies remain Apache-2.0. Trademark rules are separate.                                                                                                                                                                                                                                                                                                                  | M1         |
| D3  | Hosting layout        | One site, one app per path (`/konsum/`), for apps that trust each other's JavaScript. Paths and DIDs do not create browser security isolation; use separate origins where needed.                                                                                                                                                                                                                                                                                                                                             | M3         |
| D4  | Package manager       | **Decided: pnpm workspaces** (revised 2026-10-09, #32; first npm workspaces). Developers starting an apps repository expect pnpm as the monorepo tool, and the SDK repository uses it too. `check` already finds undeclared imports, so the gain is familiar, consistent tooling rather than stricter dependencies. `packageManager` pins the version; `pnpm-workspace.yaml` keeps exact versions and the Node engine strict, and dependencies run no install scripts (`strictDepBuilds`). Declare dependencies in each app; verify standalone installation/build. Copies convert their npm lockfile with `pnpm import` on the 0.5.0 update. The SDK's guides keep npm commands; the app workflow names the pnpm equivalents. | M1         |
| D5  | Instructions          | Root AGENTS.md serves the instance owner's assistant. Thin skill/tool entries route to one maintained app workflow. Template-maintainer rules live in `docs/maintaining.md`, linked only for that role.                                                                                                                                                                                                                                                                                                                       | M1         |
| D6  | Template updates      | **Decided: separate template-owned and owner-owned files from M1.** Template-owned tooling, skills and shared instructions live in `.sempods/` with a version file and are never edited in an instance; generated app configuration lives in separate generated files; owner-owned files are never changed automatically. Until `.sempods/` is published as an npm package (after M4), an update skill applies a newer template release; afterwards updates arrive as version PRs, like SDK updates. See [Updates](#updates). | M1         |
| D7  | Standard user journey | **Decided: vibe-coding.** Short user guidance and copyable prompts lead into a complete assistant workflow. The SDK remains the foundation for demanding apps, modules and services and keeps its single-app guidance; M4 adds a pointer from it to this template.                                                                                                                                                                                                                                                            | M1         |
| D8  | Installation          | **Decided: PWA by default** for generated production apps, with an explicit per-app opt-out. Device support claims require evidence; a browser-only choice stays supported.                                                                                                                                                                                                                                                                                                                                                   | M1/M3      |

## Target layout

```text
README.md              short user introduction and starter prompt
AGENTS.md              instruction map; an owner section the template never touches
.agents/skills/        thin skill entries routing into .sempods/; tool adapters as needed
CLAUDE.md              pointer to AGENTS.md (other assistants: their equivalent)
INIT.md                one-time setup conversation; marked done afterwards
apps.json              app metadata, stable paths/ports, deployment profiles, PWA choice
apps/<id>/             one app, quickstart layout (Vite, React, app-sdk); owner code
                       plus generated configuration files the code imports
.sempods/              template-owned: scripts (new-app, configure-app, sdk-update,
                       update-template, check, build-site), skills, shared
                       instructions, VERSION; replaced as a whole on update
package.json           workspace root; package scripts are thin calls into .sempods/
docs/start.md          short user steps: start, change, try, publish
docs/                  vision, plan, maintaining (template-maintainer context;
                       removed from a copy during setup)
```

## User and assistant entry points (M1)

These are planned artifacts, not working commands in this planning PR. The
README stays short: what you can make, a Pod and coding assistant as
prerequisites for a real-data trial, and one copyable starter prompt. Offer
GitHub's "Use this template" path as well as the CLI below. `docs/start.md` uses
brief, action-oriented steps and examples, calling its audience users, not
developers. Technical setup details belong in the assistant workflow and linked
SDK guides.

AGENTS.md links to INIT.md, the canonical app workflow, the app-author reference
the installed SDK ships (`node_modules/@sempods/app-sdk/docs/`) and each app's
decisions. The app-workflow skill and tool-specific
entry files route to these same instructions; no copied API manuals or separate
rules per assistant. Plain AGENTS.md routing must work when skill discovery is
unavailable. The workflow covers create/change, test/recover, SDK update and
deployment preparation, and records vocabulary, target, versions and evidence
for the next session. SDK contributor instructions are not app-author
instructions.

## Setup flow

Before the M1 exercise, the maintainer enables GitHub's template setting on the
still-private repository. Participants need read access to that repository;
public discovery starts in M4. Template capability and public visibility are
separate settings
([GitHub's template guide](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository)).

```sh
gh repo create my-sempods-apps --template sempods/sempods-apps-template --private --clone
```

Then, in the repository, ask the assistant: "Read INIT.md and set up my
repository." It uses the app idea and language already given, chooses a short
app ID and asks only for missing decisions needed for the first interaction.
It installs dependencies, runs `pnpm run new-app <id>`, starts the development
server and builds the first slice using the local app-workflow skill and the
pinned SDK references,
including the SDK's
[AI app-builder guide](https://github.com/sempods/sempods-typescript/blob/main/docs/ai-app-builder.md).
After the first useful interaction, INIT adapts inherited repository ownership
and maintainer settings (for example CODEOWNERS) to the instance. Choosing a
review owner and enabling automatic SDK updates are optional follow-ups; their
deferred status is recorded without blocking setup. The template's own
contribution checks, such as the DCO sign-off workflow, stay in the template: an
instance keeps them only if its owner asks, so assistant commits in a personal
repository are not rejected for a missing sign-off. INIT records the template revision, and marks
setup done. Repeating setup must preserve existing apps. A later app is one
prompt: "New app: a shopping list with …".

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
  and adds the app to `apps.json`. Base path, callback, identity and PWA
  settings go into generated files that the app's code imports but never edits,
  so an update can regenerate them for existing apps. Before copying anything,
  it rejects an ID that is not one lowercase segment (`^[a-z][a-z0-9-]{0,39}$`),
  because the ID becomes a directory, a URL path and a `did:web` component;
  names reserved by the site (for example the overview page's assets) and
  Windows device names (`con`, `prn`, `aux`, `nul`, `com1`–`com9`,
  `lpt1`–`lpt9`) are rejected too. IDs, paths and ports are validated for collisions; rerunning
  must not overwrite an existing app. Generate PWA configuration by default,
  with a documented per-app opt-out; registration runs only from the production
  app entry.
- `configure-app` (M3): an idempotent command applies explicit local, production
  or preview profiles to an existing app from `apps.json`. It derives DID,
  callback, `returnTo`, asset base and PWA paths together, without touching user
  screens or data. Production has no loopback flag; local development keeps
  working after deployment setup. Preview identities never silently inherit the
  production DID. Fail on incomplete or inconsistent configuration rather than
  inferring a production identity from the current browser hostname.
- `sdk-update <version>`: sets one exact shared version of both SDK packages for
  the root, the skeleton and all apps, and updates manifests and lockfile
  together. The SDK ships its app-author reference in the package (from 0.3.0),
  so the reference follows the version without a separate copy. The assistant
  then follows the SDK's migration guide. CI rejects SDK version drift,
  including dependency-bot PRs; coordinate the two SDK updates rather than
  merging independent version bumps.
- `check`: typecheck, lint and build of every app, and a check that every
  package an app imports is declared in that app's own `package.json`. Run
  script and app tests, generate an app in CI, check documentation links and
  AGENTS/skill navigation, and verify one SDK version everywhere and the
  presence of its shipped reference. A standalone app
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

## Updates

**SDK.** All apps of an instance use one exact shared version of both SDK
packages for reproducible builds, one matching shipped reference and a single
update process. This is a template policy, not a same-origin runtime
requirement: the SDK namespaces sessions and locks by identity kind plus app DID
(or dynamic callback URI). Different app DIDs therefore have distinct
namespaces, while sharing the origin's browser security boundary. See the SDK's
[session persistence contract](https://github.com/sempods/sempods-typescript/blob/012fa63cea292d6b63b71e3a17187710f7180d44/docs/migration.md#know-what-persists).
Security releases are applied promptly; other updates when the owner wants them.
A scheduled workflow (weekly) runs `sdk-update` for the newest release, runs
`check` and opens a pull request that links the SDK's migration notes. A patch
release can be merged when the checks pass, automatically if the owner enables
that. Before 1.0 a minor release may break apps: the owner asks the assistant to
apply it, and the update skill follows the migration guide, adapts the apps,
runs the checks and lists what to try on the Pod.

When installing the update workflow (M1b), INIT checks whether Actions may
create pull requests. For a new personal repository this is disabled by default.
Guide the owner to the repository's Actions settings to enable that capability,
subject to organisation policy; YAML permissions alone do not enable it. Scope
`contents: write` and `pull-requests: write` to the update job. If policy or the
owner keeps PR creation disabled, report automatic updates as unavailable and
retain the local `sdk-update` plus assistant-created PR path using the owner's
existing GitHub access. Never request a token in a prompt.

A pull request opened with the job's `GITHUB_TOKEN` does not trigger
`pull_request` workflows, so its CI would not run on its own. The updater
therefore runs `check` on the update branch before opening the PR and then
starts the instance's check workflow for that branch with a
`workflow_dispatch` event (allowed for this token; it needs `actions: write` on
the update job), so the PR head carries a check result. No personal token or
GitHub App is required for this. See
[GitHub's PR creation setting](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests).

**Template.** Each file or explicitly delimited section has an update policy. A file that no row names is owner-owned: `update-template` never changes it and lists the template's change to it in the upgrade notes for review.

| Owner                      | Files                                                                                                                                                                                                               | On update                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Template                   | `.sempods/` (scripts, skills, canonical shared instructions, VERSION), generated app configuration                                                                                                                  | Replace or regenerate as a whole.                                                                            |
| Owner                      | App code, `apps.json`, the owner section of AGENTS.md, the setup record in INIT.md, each app's development notes                                                                                                    | Preserve; never overwrite as part of a template update.                                                      |
| Shared                     | Template section of AGENTS.md, README, INIT.md, `CLAUDE.md`, `docs/start.md`, tool/skill adapters outside `.sempods/`, `pnpm-workspace.yaml`, `.gitignore`, `.node-version`, CI and Dependabot workflows                         | Apply upgrade notes as a reviewed diff, preserving instance-specific settings and owner sections.            |
| Shared manifests           | Root and app `package.json` files                                                                                                                                                                                   | Update only identified template/tooling or SDK entries, preserving app dependencies, scripts and metadata.   |
| Generated dependency state | `pnpm-lock.yaml`                                                                                                                                                                                                    | Regenerate from the updated manifests with the pinned pnpm version; verify a clean `pnpm install --frozen-lockfile` and all checks. |
| Template reference         | `docs/vision.md`, `docs/plan.md`, `docs/maintaining.md`                                                                                                                                                             | Replace as a whole; they describe the template, not the instance, and INIT removes them.                     |
| Owner after setup          | `LICENSE`, `CONTRIBUTING.md`, `.github/CODEOWNERS` and other files INIT adapts or removes (such as the DCO workflow)                                                                                                                   | Preserve; report a template change to them in the upgrade notes for review.                                  |

The workflow entry outside `.sempods/` links to its canonical instructions
inside that directory rather than maintaining a second workflow. Template
releases list any required dependency, adapter, workflow or configuration-schema
changes in their upgrade notes. Updating `.sempods/` alone is not enough when
those change: apply the related manifest, lockfile and shared-file updates in
the same PR. If an upgrade needs a change to an owner-owned file, stop that part
and explain the required migration for explicit review; do not overwrite it
during regeneration. Checks cover instruction links and preservation of app
code, public profile inputs and the owner section of AGENTS.md across a
representative template upgrade.

The template is released with semantic version tags and a changelog
(`.sempods/CHANGELOG.md`) whose upgrade notes are written for assistants. An
instance records its template version in `.sempods/VERSION`. The table above is
machine-readable in `.sempods/update-policy.json`, including the delimited owner
sections (the owner section of AGENTS.md and the setup record in INIT.md) and
retired template paths. The first tagged release is 0.2.0. Copies created before
it carry 0.1.0 without a tag, which several template commits share. For them,
`update-template` takes as origin the 0.1.0 commit whose template-owned
`.sempods/` matches the copy's best, uses its files as merge base and counts a
missing entry or file as the owner's removal only against it. The base is then
an inference, so the report names the commit and conflicts say so. Until
`.sempods/` is published as an npm package,
the `update-template` skill fetches a newer tagged release, replaces
`.sempods/`, regenerates the generated configuration, applies the upgrade notes
to shared files, runs `check` and opens a pull request. After the package exists
(after M4), an instance switches once; from then on, template updates arrive as
version pull requests like SDK updates. Those updates still explicitly
regenerate app configuration and run the same consistency checks; they cannot
rely on install hooks, because dependencies run no install scripts. Shared-file migrations
still use the skill and reviewed upgrade notes.

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
scrub. SDK documentation is CC BY 4.0 and SDK examples are Apache-2.0 according
to the SDK's
[NOTICE](https://github.com/sempods/sempods-typescript/blob/012fa63cea292d6b63b71e3a17187710f7180d44/NOTICE);
code adapted from SDK examples keeps that notice. MIT-0 describes only original
template material.

## Milestones

- **M0, this plan.** Vision and plan independently reviewed at the exact head
  and merged by the owner.
- **M1a, first working slice.** Enable the private template setting, then build
  the D6 ownership layout (`.sempods/` with VERSION and separate generated app
  configuration), `new-app`, `check`, AGENTS.md, INIT.md, short user guidance,
  the app-workflow skill, maintainer guidance, default PWA skeleton, `.npmrc`
  and CI. Start with pinned SDK packages; from SDK 0.3.0 their shipped reference
  replaces the earlier `reference/sempods-sdk/` snapshot.
  Accepted when a user follows the short introduction and an assistant without
  prior context reaches a running example against a loopback Pod. CI verifies
  clean generation, non-destructive reruns, app tests, instruction links/version
  consistency and an app's standalone install/build. Record the authoring
  exercise separately from fixtures and from production/device evidence.
- **M1b, repeatable updates.** After the first working slice, add `sdk-update`,
  `update-template`, a changelog with upgrade notes, the scheduled SDK update
  workflow, and Dependabot for actions and npm dependencies other than the SDK
  packages. The dedicated update workflow owns the two SDK packages together.
  Accept with an upgrade fixture that changes template tooling and one shared
  dependency: update generated configuration, manifests, lockfile and
  instruction links together, then install and run `check`. Verify app code,
  `apps.json`, owner notes and owner AGENTS.md sections are unchanged; repeat
  the update safely. In a test instance, verify PR creation with the required
  repository/job permissions, a check result on the update PR's head, and clear
  manual fallback when creation is disabled. M1 is complete only after M1a and
  M1b, before M2.
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
  the apps of `haed/sempods-apps` move into an instance. Add a pointer from the
  SDK's entry pages to this template as the quick start for personal apps; the
  SDK keeps its quickstart, AI app-builder guide, API documentation and existing
  links.

## Later, with its own issue

- **Automatic cleanup** of bought items: per item, a conditional delete against
  the version that was seen, skipping any item that changed meanwhile. Decide
  from M2 experience whether this is app code, an SDK recipe or an SDK function.
  A Pod-side expiry (for example `schema:expires` honoured by the server) goes
  to the specification backlog as the long-term option.
- Publishing `.sempods/` as an npm package and the one-time switch of existing
  instances (D6).
- Widgets and shared-host embedding, following the SDK's widget guide.

## Not in this plan

In-app AI features (text2model and similar), a backend or proxy, shared hosting
for several people, and SDK changes; SDK findings are filed in the SDK
repository.
