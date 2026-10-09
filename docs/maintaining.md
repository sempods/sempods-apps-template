# Maintain the template

This guide applies to work on `sempods/sempods-apps-template` itself. Owner
copies remove it during setup. Do not run INIT's instance adaptations in the
upstream template: retain its CODEOWNERS and DCO.

Read the [vision](vision.md), the [plan](plan.md) and the issue you work on. Use
a branch from `origin/main`. The owner merges; implementation is not approval or
permission to publish, change visibility or release packages.

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

## Keep one instruction source

The canonical workflow lives in `.sempods/instructions/app-workflow.md`, and
`.sempods/skills/app-workflow/SKILL.md` is its canonical skill entry. Root/tool
adapters only route to it. When changing a command or path, check README, INIT,
AGENTS, user steps and all adapters together. Verify skill frontmatter and links
as well as whether the instructions lead to a usable outcome. Keep user-facing
prose short; point to the SDK reference shipped in the installed package instead
of copying SDK manuals.

Files an owner's copy removes during setup (this guide, the plan, the vision and
`CONTRIBUTING.md`) must not be linked from files a copy keeps; use an absolute
GitHub URL where a pointer is needed. `npm run check` validates local links.

In an instance, preserve the delimited owner section in AGENTS.md, the instance
setup record in INIT, app code, `apps.json` and app notes. Updates must respect
the [plan's file ownership](plan.md#updates). In this template repository those
initial records remain unfilled. Do not remove records from a user's copy to
make it resemble a fresh template. Code adapted from SDK examples keeps its
Apache-2.0 notice; template MIT-0 does not replace it.

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
