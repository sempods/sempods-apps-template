# Maintain the template

This guide applies to work on `sempods/sempods-apps-template` itself. Owner
copies remove it during setup. Do not run INIT's instance adaptations in the
upstream template: retain its CODEOWNERS and DCO.

Read the [vision](vision.md) and the issue you work on; open issues hold the
planned work and open decisions. Use a branch from `origin/main`. The owner
merges; implementation is not approval or permission to publish, tag a release
or change repository settings.

## Assistant instructions

The repository's agent instructions (AGENTS.md, CLAUDE.md, INIT.md and the
skills) serve the owner of a copy who builds apps. They do not route to this
guide, so an assistant opened in this repository starts in that role. Give it
the maintainer context in your request or in a local, uncommitted file:
`CLAUDE.local.md` for Claude Code, which adds to CLAUDE.md, or
`AGENTS.override.md` for Codex, which takes the place of AGENTS.md. Both are
ignored by Git. Keep maintainer tooling such as review skills in your personal
assistant configuration or a plugin, not in `.claude/skills/` or
`.agents/skills/`: those are shared files that template updates deliver to every
copy.

For a maintainer task, prepend this to your request or put it in the local
instruction file:

> Work on the sempods apps template itself. Read CONTRIBUTING.md and
> docs/maintaining.md, then follow the vision and the task's scope. The shared
> app instructions are the product being maintained; their instance-only
> restrictions do not prevent template changes for this task. Do not run
> instance setup or fill in the owner and setup records in this repository.

## Keep one instruction source

The canonical workflow lives in `.sempods/instructions/app-workflow.md`, and
`.sempods/skills/app-workflow/SKILL.md` is its canonical skill entry. Root/tool
adapters only route to it. When changing a command or path, check README, INIT,
AGENTS, user steps and all adapters together. Verify skill frontmatter and links
as well as whether the instructions lead to a usable outcome. Keep user-facing
prose short; point to the SDK reference shipped in the installed package instead
of copying SDK manuals.

Files an owner's copy removes during setup (this guide, the vision and
`CONTRIBUTING.md`) must not be linked from files a copy keeps; use an absolute
GitHub URL where a pointer is needed. `pnpm run check` validates local links.

In an instance, preserve the delimited owner section in AGENTS.md, the instance
setup record in INIT, app code, `apps.json` and app notes. Updates must respect
the [file ownership](#file-ownership). In this template repository those
initial records remain unfilled. Do not remove records from a user's copy to
make it resemble a fresh template. Code adapted from SDK examples keeps its
Apache-2.0 notice; template MIT-0 does not replace it.

## File ownership

Every file of a copy has an owner, and `update-template` treats it accordingly.
`.sempods/update-policy.json` is the machine-readable form of this table; the
release's own policy governs its update. Apart from the generated files, a
file the policy does not name is owner-owned: `update-template` never changes
it.

| Owner                      | Files                                                                                                                              | On update                                                                                                   | Policy key                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Template                   | `.sempods/` (scripts, skills, canonical shared instructions, VERSION)                                                              | Replace as a whole.                                                                                         | `replace`                      |
| Owner                      | App code, `apps.json`, the owner section of AGENTS.md, the setup record in INIT.md, each app's development notes                   | Preserve; never overwrite.                                                                                  | `sections`; unnamed files      |
| Shared                     | Template part of AGENTS.md, README, INIT.md, `CLAUDE.md`, `docs/start.md`, skill adapters, workspace, Git, CI and Dependabot files | Three-way merge with the copy's template version as base; a file the owner changed goes to review.         | `shared`                       |
| Shared manifests           | Root and app `package.json` files                                                                                                  | Update only template tooling and SDK entries; keep app dependencies, scripts and metadata.                  | `rootManifest`, `appManifests` |
| Generated                  | Each app's `src/sempods.generated.ts` and `vite.sempods.generated.ts`; `pnpm-lock.yaml`                                            | Regenerate from `apps.json`, and the lockfile from the updated manifests with the pinned pnpm version.      | none                           |
| Template reference         | `docs/vision.md`, `docs/maintaining.md`                                                                                            | Replace if the copy still has them; INIT removes them.                                                      | `replaceIfPresent`             |
| Owner after setup          | `LICENSE`, `CONTRIBUTING.md`, `.github/CODEOWNERS`, the DCO workflow                                                               | Preserve; report a template change for review.                                                              | `ownerAfterSetup`              |
| Retired                    | Template paths that a release no longer ships                                                                                      | Remove and report.                                                                                          | `retired`, `ownerReferences`   |

Keep a removed shared file in `shared` while copies from before its removal can
still update: the merge deletes it there only if the owner left it unchanged.
When an upgrade needs a change to an owner-owned file, the upgrade notes explain
the migration for review; the update never overwrites it.

## Template decisions

The vision records the direction. These decisions explain choices that the
files alone do not:

- **One shared SDK version.** All apps of a copy use one exact version of both
  SDK packages, one matching shipped reference and one update process. This is
  template policy for reproducible builds, not a runtime requirement of one
  origin: the SDK namespaces sessions and locks by identity kind plus app DID
  ([session persistence](https://github.com/sempods/sempods-typescript/blob/012fa63cea292d6b63b71e3a17187710f7180d44/docs/migration.md#know-what-persists)),
  while the apps share the origin's browser security boundary.
- **pnpm workspaces**
  ([#32](https://github.com/sempods/sempods-apps-template/issues/32)). People
  starting an apps repository expect pnpm, and the SDK repository uses it.
  `check` already finds undeclared imports, so the gain is familiar, consistent
  tooling rather than stricter dependencies.
- **Template setting.** The repository is public and marked as a GitHub
  template; "Use this template" and `gh repo create --template` depend on that
  setting.

## Release the template

A change that copies should receive belongs to a release, and one release can
collect several PRs. Its first PR sets `.sempods/VERSION` to the release's
prerelease, for example `0.5.0-dev` (semver; before 1.0 a minor release for
changes that need upgrade work), and adds a section `## 0.5.0` to
`.sempods/CHANGELOG.md` with its changes and upgrade notes written for the
assistant that applies them. Later PRs extend that section; the PR that
completes the release sets the final version. Name what `update-template`
cannot do alone: owner files to adapt, configuration choices, SDK migrations.
New shared files, retired paths and owner sections belong in
`.sempods/update-policy.json`; the new release's policy governs its update.

A copy created from `main` between those merges carries the prerelease. It
sorts before the release, so `update-template` still brings the copy to the
tagged release, inferring its base from the template commits with that
version. A final version on `main` before its last PR would instead make such
a copy look up to date.

After the last merge, the owner tags `v<version>` on that merge commit;
`update-template` only offers tagged releases. Tags are never moved. The
repository ruleset `protect-release-tags` protects `refs/tags/v*` against
updates and deletion, with no bypass actors; new tags remain allowed. This
GitHub setting is not installed by template updates. Verify an upgrade from
the previous release in a copy before tagging, and keep the update tests in
`.sempods/scripts/test/` passing.

## Handoff

Sign off every commit using the configured contributor identity
(`git commit -s`) and honestly attribute AI assistance. Open a PR linked to the
issue, record checks and remaining work, and request independent review of its
exact head SHA. Do not count review of an earlier head, or the author's own
checks, as independent approval.
