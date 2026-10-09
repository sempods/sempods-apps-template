# Make an app with your assistant

## Start

You need Node.js 24.15 or newer; your copy names the exact version in
`.node-version`. With a version manager, name the version explicitly, for
example `nvm install 24.15.0` or `fnm use --install-if-missing 24.15.0`. The
installation stops with a clear message on an older Node.

You also need pnpm. With Node 24, run `corepack enable pnpm`; if that is not
available, `npm install --global pnpm@11`. Your copy names the exact pnpm
version, and pnpm switches to it by itself.

[Create your own copy and paste the starter prompt](../README.md#start-with-your-idea).
Describe one thing you want to do: “Add something to my shopping list.” Your
assistant sets up the app and gives you a local link to open.
It chooses the technical details and asks you about what the app should do.
Review rules and automatic updates can wait until you have tried the first
version.

## Change

Ask for the next small improvement: “Let me mark an item as bought.” Keep trying
the app as it grows. For another app, say “Create a new app for my book list.”
Your existing apps stay in the same repository.

## Try

Use a test context with made-up data in your Pod. Sign in on the Pod's page,
then choose that context in the app. Ask your assistant to check a save and a
reload, and to tell you what it has not tested. Never paste passwords or tokens
into chat. Without a Pod, you can still try the screen.

## Keep apps up to date

If you choose weekly SDK updates after trying your first app, your assistant
enables them with your existing GitHub access. Until then, the
scheduled SDK update job stays off.
Ask your assistant: “Update my SDK and explain what I should try.” A patch
update is merged when checks pass. Before 1.0 a minor update may break apps;
your assistant follows the migration guide, adapts your apps and lists what to
try on the Pod. You decide when to merge.

## Publish

When an app is ready, ask your assistant: “Publish my apps.” It asks for the
web address you own, for example a free Netlify or Cloudflare address, and
optionally a second address for previews. All your apps then share one site,
each under its own path, with an overview page. Choose the address once:
changing it later means signing in to every app again. On the published site,
apps can be installed on a device. Offline startup will not make Pod edits
work offline. You decide when to publish.

## Update

When the template gets better, ask your assistant: “Update the template.” It
brings in the new version as a change you can review; your apps and notes stay
yours.

Your assistant follows the repository's instructions and records progress in
each app's `NOTES.md`, so a later session can pick up where you left off.
