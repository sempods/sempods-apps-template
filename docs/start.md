# Make an app with your assistant

## Start

You need Node.js 24.15 or newer. Your copy names the exact version in
`.node-version`; a version manager such as fnm, mise or nvm can switch to it,
and the installation stops with a clear message on an older Node.

[Create your own copy and paste the starter prompt](../README.md#start-with-your-idea).
Describe one thing you want to do: “Add something to my shopping list.” Your
assistant sets up the app and gives you a local link to open.

## Change

Ask for the next small improvement: “Let me mark an item as bought.” Keep trying
the app as it grows. For another app, say “Create a new app for my book list.”
Your existing apps stay in the same repository.

## Try

Use a test context with made-up data in your Pod. Sign in on the Pod's page,
then choose that context in the app. Ask your assistant to check a save and a
reload, and to tell you what it has not tested. Never paste passwords or tokens
into chat. Without a Pod, you can still try the screen.

## Publish later

M1a runs apps on your computer. Shared hosting and deployment setup follow in
M3; your assistant should not present them as ready yet. Apps include PWA
configuration by default for later installation from an HTTPS site. Offline
startup will not make Pod edits work offline. You decide when to publish.

Your assistant uses the [app workflow](app-workflow.md) and records progress in
each app's `NOTES.md`, so a later session can pick up where you left off.
