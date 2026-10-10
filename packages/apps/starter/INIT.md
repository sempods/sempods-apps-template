# Set up this repository

This is the assistant's starting point for setup. Users can start with
[the short guide](docs/start.md). Follow [AGENTS.md](AGENTS.md) and preserve the
setup record below on later runs and updates.

## Bootstrap

The setup procedure ships with the tooling package, so install the
dependencies first. Check `node --version` against `.node-version`. If it
differs, switch with the owner's version manager and name that version
explicitly; not every manager reads `.node-version` by default, and with mise
prefix each command with `mise exec node@<version> --`. Do not write a
version-manager configuration into the repository: `.node-version` stays the
only source. Otherwise ask the owner to install that version; do not work
around it. `pnpm-workspace.yaml` sets `engineStrict`, so `pnpm install` stops
on an older Node.

Then check `pnpm --version`. If pnpm is missing, Node 24 brings Corepack:
`corepack enable pnpm`. Without Corepack (Node 25 and later), or if it cannot
write to Node's directory, install pnpm globally with npm after asking the
owner. pnpm switches to the version that `packageManager` in `package.json`
pins. From the repository root:

```sh
pnpm install
```

A repository that has committed `pnpm-lock.yaml` installs with
`pnpm install --frozen-lockfile` instead. Commit the lockfile the first install
writes.

## Setup procedure

Follow `node_modules/@sempods/apps/instructions/setup.md`. It covers the first
app, optional repository preferences and when setup is done. Record progress
only in the setup record below.

## Setup record

The assistant updates only this record as setup progresses; updates preserve
it. Keep it free of credentials and private data.

<!-- BEGIN INSTANCE SETUP RECORD -->

- Status: not started
- Created from (`.sempods-baseline.json`): not recorded
- SDK version at setup (`@sempods/app-sdk` in the root `package.json`): not recorded
- Owner and review identity: not recorded
- UI language: not selected
- First app ID and idea: not selected
- Test Pod/context: not selected (optional; synthetic data only)
- Automatic SDK updates / Actions PR setting: not checked
- Local URL and check result: not checked
- Pod exercise and remaining gaps: not tested

<!-- END INSTANCE SETUP RECORD -->
