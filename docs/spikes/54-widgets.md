# Spike: widgets and shared-host embedding for #54

[Claude] Written on 2026-11-03 at the owner's request, as a decision paper
before any code. It answers whether and how an app of a copy can be embedded
as a widget in another page or host (sempods/sempods-apps-template#54),
within the SDK's widget contract, against template 0.9.0-dev.1 (a4179c6) and
SDK 0.7.0-dev.2. No prototype was built; the evidence is the SDK's
[widget guide](https://github.com/sempods/sempods-typescript/blob/v0.7.0-dev.2/docs/widgets.md),
its decision record and this repository's vision. **Not decided yet.**

## Answer

1. **Inside one app, widgets need nothing from the template.** The SDK's
   supported profile is components imported into one host document, under
   one runtime and provider. An app of this repository is already that host:
   a list beside a quick-add form, or several panels on one screen, are
   ordinary components of the app.
2. **A dashboard over several apps is its own app, not an embedding.** The
   vision makes data reusable and apps replaceable: a dashboard reads the
   same contexts the other apps write, with its own identity and grants. It
   copies the components it needs instead of importing them from another
   app's folder, so every app can still move into its own repository.
3. **Embedding into other sites is not supported, and the template should
   not attempt it.** The SDK lists cross-origin iframes as unsupported and
   warns against improvised token or attempt transfer. A script loaded into
   another site runs as that site, with its identity and callback.
4. **Recommendation:** close #54 as not planned for now and record the
   reasons. Reopen it when the SDK has a contract for independent targets or
   isolated iframe sign-in. One small, separate step is worth considering:
   publish the apps with `frame-ancestors 'none'`, so no other site can frame
   their sign-in.

## Baseline

- Each app is one page with one runtime, created in `App.tsx` from
  `sempods.generated.ts`, with its own `did:web` identity and callback under
  its path. `build-site` links the apps from a static overview and mounts no
  runtime there.
- The SDK's widget guide
  ([widgets.md](https://github.com/sempods/sempods-typescript/blob/v0.7.0-dev.2/docs/widgets.md),
  decision "Host-integrated widgets share one target and guard registry")
  demonstrates two widgets in one host document. They share one runtime,
  one provider, one selected target and one leave policy. The host owns
  identity, preset, sign-in and disposal; widgets never create a runtime or
  provider and keep the SDK as an external peer.
- Its table of embedding profiles:
  - components in the host document: demonstrated;
  - a standalone mini app: a host around one widget;
  - two independent Pods or contexts at once: a future contract;
  - same-origin iframe: a separate document that shares nothing;
  - cross-origin iframe: not supported.
- The vision: "Apps of one repository trust each other's JavaScript" and
  share one site; "apps of different people never share a site".

## Three meanings of "widget"

| Meaning                                                    | What it needs                                                                                                            | Verdict                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Several panels inside one app                              | Components under the app's provider, as the SDK's guide shows                                                            | Already possible; at most an example later, if owners ask                                                                 |
| A dashboard showing parts of several apps of one repository | Either one host importing other apps' components, or a dashboard app reading the same data                              | A dashboard app reading the same data, with copied components                                                            |
| An app shown inside someone else's site (blog, Notion, intranet) | A cross-origin iframe or a script in the other site's document                                                       | Not supported by the SDK; do not build it                                                                                |

### Why a dashboard does not import other apps

Importing `apps/focus/src/widgets/` into `apps/dashboard` would work
technically inside one workspace, but:

- it binds two apps' code together, so neither can move into its own
  repository, which the vision keeps as a first-class path;
- the dashboard signs in as itself, with its own identity, and needs its own
  grants anyway; sharing code does not share the other app's session;
- a change to Focus could break the dashboard, and Focus's own checks would
  not notice: they build and test Focus, not the apps that reach into its
  folder.

Copying a component keeps each app self-contained, as the examples already
do. A shared workspace package for widgets is possible later, but it would be
a new kind of folder for the tooling to create, check and update.

### Why not iframes

- **Sign-in breaks across sites.** Browsers partition storage by top-level
  site, so the attempt an iframe stores is not the one a top-level OAuth
  callback finds. The SDK names this and forbids passing tokens, PKCE or
  attempts through URLs or messages.
- **Pods and identity providers may refuse framing** of their login pages,
  and sandbox settings can block navigation.
- **A same-origin iframe gains nothing:** it is a second document with its
  own runtime, which can report `busy` against the first.

## Framing protection

Today nothing stops another site from framing a published app. The owner's
own repository already sends `X-Frame-Options: DENY` and
`Content-Security-Policy: frame-ancestors 'none'` from its `netlify.toml`;
the template's publish guide does not mention it. Because embedding is out of
scope, refusing it costs nothing and protects the sign-in from clickjacking.
`build-site` could write the same header in a `_headers` file, which Netlify
and Cloudflare Pages read, next to `_redirects`. This belongs in its own
issue, with a check that the published callback still works.

## Follow-up work, if decided

1. Close #54 as not planned, linking this paper.
2. A new issue: `_headers` with `frame-ancestors 'none'` and
   `X-Frame-Options: DENY` from `build-site`, the publish guide, a test, and
   a check that sign-in still works on Netlify. About 40 lines.
3. Optionally, later: a short note in `app-workflow.md` that a dashboard is
   its own app over the same data, with copied components.

## Open decisions for the owner

- Close #54 now, or keep it under "later" until the SDK's next widget
  contract?
- Should published apps refuse framing by default?
- Is a dashboard over several apps something owners ask for, so that it
  deserves an example screen?
