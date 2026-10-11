# My sempods apps

Describe a shopping list, a small tracker or another idea to your coding
assistant. Try the first version, then ask for the next change. Your
[sempods](https://www.sempods.org/) Pod keeps the data; the app gives it a
screen.

You need a coding assistant that can work with local files, Node.js in the
version `.node-version` names, pnpm, and a Pod account for trying real saves.
Your assistant helps with the local setup. A hosting account is needed only to
publish.

> **Preview.** This starter is new and still changing. Today you can build
> apps, try them locally against your Pod, update the SDK and the tooling, and
> publish all apps together on one site.

## Start with your idea

Open this repository in your coding assistant and paste:

> Read AGENTS.md and INIT.md. Help me build a shopping list in German. Start
> with adding an item and marking it as bought. Show me how to try it on my Pod.

[Start, change, try, publish](docs/start.md) explains the next steps. Sign in
only in your browser; never paste passwords or tokens into the chat.

Apps include PWA configuration by default, for later installation from your
HTTPS site. That does not make data editing work offline.

For assistants: [AGENTS.md](AGENTS.md) and [INIT.md](INIT.md).

## Licence

Your apps and this repository are yours; add the licence you choose. The
tooling package `@sempods/apps` is MIT-0. The SDK packages, including the
documentation and examples they ship, keep their own licences: Apache-2.0 for
code and CC BY 4.0 for documentation. Code adapted from SDK examples keeps its
Apache-2.0 notice.
