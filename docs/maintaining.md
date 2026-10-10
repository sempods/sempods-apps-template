# Maintain sempods apps

This guide applies to work on `sempods/sempods-apps-template`, the source of
the tooling package `@sempods/apps`, its creator `@sempods/create-apps` and the
starter that owner repositories are created from.

Read the [vision](vision.md) and the issue you work on; open issues hold the
planned work and open decisions. Use a branch from `origin/main`. The owner
merges; implementation is not approval or permission to publish, tag a release
or change repository settings.

## What this repository holds

- `packages/apps/`: the tooling package. `scripts/` holds the commands behind
  `sempods-apps <command>`, `skeleton/app/` the start of a new app,
  `instructions/` and `skills/` what an owner's assistant follows, `starter/`
  the files of a new owner repository, `update-policy.json` the role of each
  starter file, `test/` the script tests and `maintainer/` the checks and
  release scripts of this repository. `test/`, `maintainer/` and `starter/` are
  not published; the starter reaches owners as the packed snapshot `shared/`.
- `packages/create-apps/`: the creator behind `pnpm create @sempods/apps`. It
  depends on the `@sempods/apps` of the same version and runs its `create`.
- The repository root: this guide, the vision, the contribution guide and the
  maintainers' CI. Nothing here reaches an owner repository.

## Keep one instruction source

The owner's assistant starts at the starter's `AGENTS.md` and `INIT.md`, which
route into the installed package: `instructions/app-workflow.md`,
`instructions/setup.md`, `instructions/publish.md` and the skills. The skill
adapters in the starter only point there. When changing a command or path,
check the starter's README, AGENTS.md, INIT.md, `docs/start.md`, the adapters
and the packaged instructions together. Verify skill frontmatter and links as
well as whether the instructions lead to a usable outcome. Keep user-facing
prose short; point to the SDK reference shipped in the installed package
instead of copying SDK manuals.

The packaged instructions and skills live in `node_modules/@sempods/apps` of an
owner repository. Link only within the package; name repository files such as
`AGENTS.md` or `INIT.md` in text. The starter names packaged files by their
`node_modules` path in text, because they exist only after `pnpm install`; its
bootstrap steps in `INIT.md` work without them. `pnpm run check` validates the
links of this repository, the package and the starter.

Write the starter and the packaged instructions for the owner of a repository
created from it. Keep maintainer topics out of them. Code adapted from SDK
examples keeps its Apache-2.0 notice; MIT-0 does not replace it.

## Starter files and updates

Every starter file has a role in `packages/apps/update-policy.json`, and a
test requires one for each:

- `shared`: AGENTS.md, CLAUDE.md, README, INIT.md, `docs/start.md`, the skill
  adapters and the workspace, Git, CI and Dependabot files. Merged on update;
  the delimited `sections` (the owner section of AGENTS.md, the setup record of
  INIT.md) stay the owner's.
- `seed`: `apps.json` and `apps/.gitkeep`. Written once; the owner's from then
  on.
- `rootManifest`: `package.json`. Only the tooling, SDK and script entries
  follow updates.

App code and app notes belong to the owner. Packing writes the starter as a
snapshot with a content revision; `create` writes it into a new repository and
records that version and revision in `.sempods-baseline.json`. `migrate`
applies the installed version's starter from that baseline: the baseline's
snapshot comes from the installed package or, for an older version, from the
published one, so skipped releases need nothing in between. A release that
leaves the starter unchanged needs no migration. The script applies only
unambiguous changes; whatever needs judgment (both sides changed a file, a
dropped file the owner changed, an owner section that cannot be kept, a
file/directory collision) becomes a manual case that the owner's assistant
decides with the update skill, confirmed by `migrate --done`. A shared file
the starter drops is removed only where the owner left it unchanged; keep
that in mind before removing one. `update-template` only refuses: it
served copies of the template, which the starter replaces.

## Decisions

The vision records the direction. These decisions explain choices that the
files alone do not:

- **One shared SDK version.** All apps of a repository use one exact version
  of both SDK packages, one matching shipped reference and one update process.
  This is policy for reproducible builds, not a runtime requirement of one
  origin: the SDK namespaces sessions and locks by identity kind plus app DID
  ([session persistence](https://github.com/sempods/sempods-typescript/blob/012fa63cea292d6b63b71e3a17187710f7180d44/docs/migration.md#know-what-persists)),
  while the apps share the origin's browser security boundary. The starter's
  `package.json` pins the SDK for new repositories; the tooling's
  `peerDependencies` name the range it supports, and a test keeps both in step.
- **pnpm workspaces**
  ([#32](https://github.com/sempods/sempods-apps-template/issues/32)). People
  starting an apps repository expect pnpm, and the SDK repository uses it.
  `check` already finds undeclared imports, so the gain is familiar, consistent
  tooling rather than stricter dependencies.
- **Tooling as a package, repositories from a starter**
  ([#10](https://github.com/sempods/sempods-apps-template/issues/10)). Owner
  repositories contain only their apps and thin shared files; the tooling, its
  instructions and the starter come from published versions.

## Check

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run self-test
```

`check` runs the script tests and the Markdown link check. `self-test` packs
both packages, creates a repository with the creator, installs the packed
tooling and creates, checks, configures and builds an app there; it needs the
npm registry. CI runs both.

## Release

A change that reaches owners belongs to a release, and one release can collect
several PRs. Its first PR sets the `version` of both packages to the release's
prerelease, for example `0.8.0-dev` (semver; before 1.0 a minor release for
changes that need upgrade work), and adds a section `## 0.8.0` to
`packages/apps/CHANGELOG.md` with its changes and upgrade notes written for the
assistant that applies them. Later PRs extend that section; the PR that
completes the release sets the final version. Both packages always carry the
same version.

After the last merge, the owner tags `v<version>` on that merge commit; the
tag publishes both packages. Tags are never moved. The repository ruleset
`protect-release-tags` protects `refs/tags/v*` against updates and deletion,
with no bypass actors; new tags remain allowed.

`.github/workflows/publish.yml` publishes `@sempods/apps` and then
`@sempods/create-apps` for a `v*` tag, only in this repository, through npm
trusted publishing with provenance; there is no npm token. The tag must equal
the packages' version. A release tag publishes to the `latest` dist-tag. A tag
with a prerelease part, for example `v0.8.0-dev.1` on a commit whose version is
`0.8.0-dev.1`, publishes to `next` for acceptance testing. Until the starter
and the tested update path pass the
[readiness gate](https://github.com/sempods/sempods-apps-template/issues/10),
do not point owners to the packages. The npm trusted publisher of each package
names this repository, `publish.yml` and the `npm` environment; both are
settings outside the repository.

## Handoff

Sign off every commit using the configured contributor identity
(`git commit -s`) and honestly attribute AI assistance. Open a PR linked to the
issue, record checks and remaining work, and request independent review of its
exact head SHA. Do not count review of an earlier head, or the author's own
checks, as independent approval.
