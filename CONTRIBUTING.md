# Contributing to the sempods apps template

This guide applies to contributions to
[`sempods/sempods-apps-template`](https://github.com/sempods/sempods-apps-template).
In a personal repository created from this template, the owner sets the
contribution policy for their apps and may replace or remove this guide.

## Licences

Original template code and documentation are licensed under [MIT-0](LICENSE).
Contributions to that material are accepted under MIT-0. This is the template's
exception to the organisation's Apache-2.0/CC BY 4.0 defaults.

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

## Working on the template

Read [template maintenance](docs/maintaining.md).
Open an issue before a large change. Keep SDK changes in the SDK repository.
Run `pnpm install --frozen-lockfile`, `pnpm run check --standalone all`,
`node packages/apps/maintainer/check-tooling.mjs`,
`node packages/apps/maintainer/self-test.mjs` and
`node packages/apps/maintainer/pack-test.mjs` with the Node version in
`.node-version`.
Changes for existing copies need a version bump, changelog and upgrade notes.
The owner merges pull requests and publishes releases after review.

Report vulnerabilities privately following the
[security policy](https://github.com/sempods/.github/blob/main/SECURITY.md).
Participation follows the organisation's
[code of conduct](https://github.com/sempods/.github/blob/main/CODE_OF_CONDUCT.md).
