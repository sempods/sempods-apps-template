# Make an app with your assistant

## Start

You need Node.js in the version `.node-version` names. With a version manager,
name that version explicitly, for example with `nvm install` or
`fnm use --install-if-missing` followed by the version. The installation stops
with a clear message on an older Node.

You also need pnpm. With Node 24, run `corepack enable pnpm`; otherwise install
pnpm with npm. `package.json` names the exact pnpm version, and pnpm switches
to it by itself.

[Open this repository in your assistant and paste the starter prompt](../README.md#start-with-your-idea).
Describe one thing you want to do: “Add something to my shopping list.” Your
assistant sets up the app and gives you a local link to open.
It chooses the technical details and proposes a fitting look. It asks a few
short questions about what the app is for, whether people use their own data
or work on the same data, and where new entries and changes should go. You can
describe these choices as lists or shared areas; no technical terms are needed.
Review rules and automatic updates can wait until you have tried the first
version.

Already have data for this app? If you want, connect your Pod to the assistant
through MCP, its connection to external tools and data. Agree which data it
may inspect so it can make the app fit your existing tasks, contacts or events.
This optional look only reads; it does not change your records. You can also
provide a made-up example or start without it. You still sign in to the app
separately when trying it.

## Change

Ask for the next small improvement: “Let me mark an item as bought.” Keep trying
the app as it grows. For another app, say “Create a new app for my book list.”
Your existing apps stay in the same repository.

## Try

Use a test context with made-up data in your Pod. Sign in on the Pod's page,
then choose that context in the app. Ask your assistant to check a save and a
reload, and to tell you what it has not tested. Never paste passwords or tokens
into chat. Without a Pod you only see the sign-in screen; the app's own
screens need a test context.

Before your assistant hands over a screen, it shows you a screenshot from a
phone-sized window and asks what you think. Say what you like and what feels
off; that is how the app gets its look.

## Keep apps up to date

After trying your first app, you can ask your assistant to turn on update
suggestions: GitHub then proposes each new SDK or tooling version as a change
for you to review. Until then, it proposes none; security fixes still arrive.
Ask your assistant: “Update my SDK and explain what I should try.” A patch
update is merged when checks pass. Before 1.0 a minor update may break apps;
your assistant follows the migration guide, adapts your apps and lists what to
try on the Pod. You decide when to merge.

When the tooling gets better, ask your assistant: “Update the tooling.” It
brings in the new version as a change you can review and tells you if your
computer needs a newer Node or pnpm first. Your apps, notes and instructions
stay yours. Where the update and one of your changes overlap, your assistant
combines them and asks you when it is a matter of choice.

## Publish

When an app is ready, ask your assistant: “Publish my apps.” It asks for the
web address you own, for example a free Netlify or Cloudflare address, and
optionally a second address for previews. All your apps then share one site,
each under its own path, with an overview page. Choose the address once:
changing it later means signing in to every app again. On the published site,
apps can be installed on a device. Offline startup will not make Pod edits
work offline. You decide when to publish.

Your assistant follows the repository's instructions and records progress in
each app's `NOTES.md`, so a later session can pick up where you left off.
