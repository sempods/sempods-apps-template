# Maintaining sempods apps

This repository is the source of the tooling package `@sempods/apps`, its
creator `@sempods/create-apps` and the starter that owner repositories are
created from. Work here is maintainer work: read
[CONTRIBUTING.md](CONTRIBUTING.md) and [the maintainer guide](docs/maintaining.md),
then follow the [vision](docs/vision.md) and the scope of the task's issue.

- The starter (`packages/apps/starter/`), the packaged instructions and the
  skills are the product. They serve the owner of a repository created from
  the starter; when changing them, review them from that owner's side and keep
  maintainer topics out of them.
- Do not run owner setup here: this repository has no apps and no setup
  record.
- Run `pnpm run check` for every change and `pnpm run self-test` before a
  pull request; both use the Node version in `.node-version`.
- The owner merges, tags releases and changes repository or npm settings.
