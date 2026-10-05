# sempods apps template

A starting point for your own repository of small
[sempods](https://www.sempods.org/) apps. Describe a shopping list, a small
tracker or another idea to your coding assistant, try what it builds, and ask
for the next change. This is the standard way to use the template; you do not
need to think of yourself as a developer. Set it up once, then add more apps to
the same repository. Apps are static frontends built with
[`@sempods/app-sdk`](https://github.com/sempods/sempods-typescript); your Pod
stores the data and enforces access.

Apps will be installable PWAs by default, with an option to use them only in the
browser. Your Pod and a coding assistant are enough to try a first app;
publishing it later needs your chosen HTTPS host.

**Status: planning.** The setup, skills and app generator described in the
[vision](docs/vision.md) and [plan](docs/plan.md) are not implemented yet; until
then, build a single app with the SDK's
[quickstart](https://github.com/sempods/sempods-typescript/blob/main/docs/quickstart.md)
and
[AI app-builder guide](https://github.com/sempods/sempods-typescript/blob/main/docs/ai-app-builder.md).

The planned starting prompt for your own template copy is:

> Read AGENTS.md and INIT.md. Help me build a shopping list in German. Start
> with adding an item and marking it as bought, then show me how to try it on my
> Pod.

## Licence

Original template code and documentation are licensed under [MIT-0](LICENSE).
SDK packages and copied SDK examples retain Apache-2.0; copied SDK documentation
retains CC BY 4.0. The planned SDK reference snapshot preserves its own source
revision and licence/NOTICE files. These materials are not relicensed by the
template's MIT-0 licence.
