# Your own sempods apps

Describe a shopping list, a small tracker or another idea to your coding
assistant. Try the first version, then ask for the next change. Your
[sempods](https://www.sempods.org/) Pod keeps the data; the app gives it a
screen.

You need a coding assistant that can work with local files, Node.js 24.15 or
newer with pnpm, and a Pod account for trying real saves. Your assistant helps with the local setup. No hosting account
is needed yet.

> **Preview.** This template is new and still changing. Today you can build
> apps, try them locally against your Pod and bring template and SDK updates
> into your copy. Publishing apps on your own site comes later.

## Start with your idea

Choose **Use this template → Create a new repository**, create your own private
copy, and open it in your coding assistant. Alternatively, use the GitHub CLI:

```sh
gh repo create my-sempods-apps --template sempods/sempods-apps-template --private --clone
cd my-sempods-apps
```

Then paste:

> Read AGENTS.md and INIT.md. Help me build a shopping list in German. Start
> with adding an item and marking it as bought. Show me how to try it on my Pod.

[Start, change, try, publish](docs/start.md) explains the next steps. Sign in
only in your browser; never paste passwords or tokens into the chat.

Apps include PWA configuration by default, for later installation from your
HTTPS site. That does not make data editing work offline.

For assistants: [AGENTS.md](AGENTS.md) and the
[app-workflow skill](.sempods/skills/app-workflow/SKILL.md). To improve the
template itself, see its
[contribution guide](https://github.com/sempods/sempods-apps-template/blob/main/CONTRIBUTING.md).

## Licence

Original template material is [MIT-0](LICENSE). The SDK packages, including the
documentation and examples they ship, keep their own licences: Apache-2.0 for
code and CC BY 4.0 for documentation. Code adapted from SDK examples keeps its
Apache-2.0 notice.
