# Contributing to sempods apps

This guide applies to contributions to
[`sempods/sempods-apps-template`](https://github.com/sempods/sempods-apps-template),
the source of `@sempods/apps` and `@sempods/create-apps`. Repositories created
from the starter set their own contribution policy.

## Licences

Original code and documentation in this repository are licensed under
[MIT-0](LICENSE). Contributions to that material are accepted under MIT-0. This
is this project's exception to the organisation's Apache-2.0/CC BY 4.0
defaults.

Imported SDK examples and documentation retain their own licences and notices:
Apache-2.0 for SDK code and examples, CC BY 4.0 for SDK documentation. Preserve
those notices when adapting examples; MIT-0 does not replace them. The installed
SDK packages contain their LICENSE and NOTICE files.

## Sign-off and AI assistance

Follow the organisation's
[Developer Certificate of Origin and AI-assisted contribution rules](https://github.com/sempods/.github/blob/main/CONTRIBUTING.md#developer-certificate-of-origin).
Sign off each contribution commit with your configured contributor identity
(`git commit -s`), honestly attribute substantial AI assistance, and submit work
you have tested and can explain. There is no CLA.

## Working on the packages

Read [the maintainer guide](docs/maintaining.md).
Open an issue before a large change. Keep SDK changes in the SDK repository.
Run `pnpm install --frozen-lockfile`, `pnpm run check` and
`pnpm run self-test` with the Node version in `.node-version`.
Changes that reach owners need a version bump, changelog and upgrade notes.
The owner merges pull requests and publishes releases after review.

Report vulnerabilities privately following the
[security policy](https://github.com/sempods/.github/blob/main/SECURITY.md).
Participation follows the organisation's
[code of conduct](https://github.com/sempods/.github/blob/main/CODE_OF_CONDUCT.md).
