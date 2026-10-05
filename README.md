# Your own sempods apps

Describe a shopping list, a small tracker or another idea to your coding
assistant. Try the first version, then ask for the next change. Your
[sempods](https://www.sempods.org/) Pod keeps the data; the app gives it a
screen.

You need a coding assistant that can work with local files and a Pod account for
trying real saves. Your assistant helps with the local setup. No hosting account
is needed yet.

**M1a is being assembled:** use this entry once the
[skeleton](https://github.com/sempods/sempods-apps-template/issues/2) and
[instructions](https://github.com/sempods/sempods-apps-template/issues/3) are
integrated. Local apps come first; publishing and automatic updates come later.

## Start with your idea

Choose **Use this template → Create a new repository**, create your own private
copy, and open it in your coding assistant. While this template is private, you
need access to it. Alternatively, use the GitHub CLI:

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
[app-workflow skill](.sempods/skills/app-workflow/SKILL.md). For template
contributors: [maintaining](docs/maintaining.md).

## Licence

Original template material is [MIT-0](LICENSE). Copied SDK code and examples
keep Apache-2.0; copied SDK documentation keeps CC BY 4.0. Preserve the pinned
snapshot's own notices and source information.
