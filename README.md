# sempods apps

Small apps around your own data, built with your coding assistant. Your
[sempods](https://www.sempods.org/) Pod keeps the data; each app gives it a
screen. One repository holds all of your apps: a new app is a folder and a
conversation.

This repository is the source of the tooling behind such repositories:

- [`@sempods/apps`](packages/apps): the commands (`new-app`, `dev`, `check`,
  `build-site`, `sdk-update` and more), the app skeleton, the instructions
  your assistant follows and the starter of a new repository.
- [`@sempods/create-apps`](packages/create-apps): creates a repository from
  that starter with `pnpm create @sempods/apps <directory>`.

> **Preview.** The packages are being prepared. Until a release recommends
> them, they are published for testing only, and a repository created from the
> starter cannot yet take a newer starter. Progress is tracked in
> [the roadmap](https://github.com/sempods/sempods-apps-template/issues/10).

The [vision](docs/vision.md) explains the direction. To contribute, read the
[contribution guide](CONTRIBUTING.md).

## Licence

Original material in this repository is [MIT-0](LICENSE). The SDK packages,
including the documentation and examples they ship, keep their own licences:
Apache-2.0 for code and CC BY 4.0 for documentation. Code adapted from SDK
examples keeps its Apache-2.0 notice.
