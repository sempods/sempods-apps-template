# Spike: routing approach for #114

[Claude] Companion to the [UI spike](120-ui-primitives.md), run on
2026-10-30 at the owner's request so that both decisions are settled before
implementation starts. It answers how apps get addressable resource and
action screens (sempods/sempods-apps-template#114) and whether a router
library should sit under them. The owner decides; nothing here changes the
starter. Evidence and scripts are in
[spikes/120-ui](../../spikes/120-ui/README.md) (`apps/routing`,
`scripts/routing-gate.mjs`, `scripts/route-contract.mjs`).

## Answer

1. **The address contract is the decision; the router is not.** All three
   clients tested (the template's own router, React Router, TanStack Router)
   pass every client-side routing check in Chromium and WebKit with the
   SDK's `navigate` as the only guard. What differs is not the router but
   what the template generates for hosts, the PWA worker and sign-in.
2. **Declare resource and action patterns per app** (for Focus
   `tasks/:id` and `tasks/:id/postpone`) next to the static routes, and
   generate from them: narrow host rewrites, a PWA allowlist that accepts
   them and an optional query, and a `returnTo` that keeps them through
   sign-in. Static views keep their copies.
3. **Keep the template's own router** and extend `routes.ts` with the
   declared patterns, the opener-aware close and the canonical replacement
   of legacy links. A library adds 29–33 KB gzip and a second blocking
   mechanism and brings nothing this contract uses. Reconsider one if apps
   need nested layouts, typed search parameters or data loaders.

The routing work does not change the UI recommendation: the package's
screen dialog follows the route, whichever router moves the history. The
routed screen (#117) is built once, on both.

## Baseline

Template 0.8.0 (908615c), SDK main at addf662, the UI package from the UI
spike (React Aria). Routers: `react-router` 8.5.1 (data router, library
use) and `@tanstack/react-router` 1.170.46 (code-based route tree).
Playwright 1.64.1 with Chromium 156.0.8078.4 and WebKit 27.2; Firefox did
not launch on the test machine. A loopback fake Pod; no live host, no
installed PWA, no real OAuth provider.

## The contract today

Apps declare static routes in `apps.json`. The generator turns them into:

- `app.routes` and a `returnPath` for sign-in that returns only to a static
  route;
- a Workbox `navigateFallbackAllowlist` of the start page and the routes;
- in the site build, one copy of `index.html` per route, so "the layout is
  the same for every host" and needs no rewrites.

[route-contract.mjs](../../spikes/120-ui/scripts/route-contract.mjs) tests
the generated allowlist against addresses Focus needs. It misses five of
eight: every address with a query (Workbox matches path and query, the
pattern ends at the path) and every resource or action path
(`evidence/route-contract.json`). Offline, these addresses get no app
shell. Focus works around both in `routeFallback.ts` and with its own
Netlify rules; its `returnTo` override exists for the same reason.

## Options for resource addresses

| | Address | Host | PWA, `returnTo` | Owner's request |
|---|---|---|---|---|
| A. Query on a static route | `/focus/tasks?id=…` | Works on every host today (a copy) | Allowlist needs the optional query | Not met: the owner asked for stable paths |
| **B. Declared path patterns, generated rewrites** | `/focus/tasks/{id}`, `/focus/tasks/{id}/postpone` | Rewrites for the declared patterns only; Netlify and Cloudflare Pages read the same `_redirects` lines | Generated from the same declaration | Met |
| C. Paths through the 404 page | `/focus/tasks/{id}` | Every host, but answers with status 404 | Allowlist as in B | Met, at the cost of a wrong status and a site-wide 404 page that must boot apps |

**Recommendation: B.** One declaration in `apps.json` (for example
`"resources": ["tasks/:id", "tasks/:id/postpone"]`) generates:

- `_redirects` lines such as `/focus/tasks/:id /focus/index.html 200`, only
  for the declared patterns, never a catch-all;
- the allowlist
  `^/focus/(?:(?:list|tasks/[A-Za-z0-9_-]+|tasks/[A-Za-z0-9_-]+/postpone)/?)?(?:\?[^#]*)?$`,
  whose parameter segments cannot reach a file, the callback or another app;
- a `returnTo` that accepts the same addresses and nothing else.

The proposal opens all eight Focus addresses and none of ten that must stay
outside (callback with its query, assets, `did.json`, favicon, unknown
sub-paths, other apps). The cost: apps with resource paths need a host that
honours `_redirects` rewrites. The publishing instructions name that host
requirement; a static host without rewrites keeps working for apps with
static views only.

## Client routers

The same Focus-like app under `/focus/`
([apps/routing](../../spikes/120-ui/apps/routing)): Zen and List views, a
task screen with the SDK's `ResourceEditor` in the package's dialog, its
"Not today" action, the legacy `?task=` link and not-found pages. The
address model ([places.ts](../../spikes/120-ui/apps/routing/src/places.ts))
is the app's, as #114 asks: base64url subjects, canonical forms, legacy
migration. Each adapter only moves through the history:

- **own**: the template's `routes.ts` pattern (History API, the shown
  entry's position in `history.state`, the SDK's `navigate` around every
  switch, undoing a declined Back or Forward), extended from static views to
  the patterns, with `close()` going back to an in-app opener or replacing
  with the start page.
- **React Router**: a data router with one catch-all route; `useBlocker`
  blocks every Back and Forward and hands it to the SDK's `navigate`, which
  calls `proceed()` or `reset()`. The basename needs its trailing slash
  (`/focus/`): without it, the start page became `/focus`, which the
  allowlist and the static copies do not answer.
- **TanStack Router**: a code-based route tree; `useBlocker` with an
  asynchronous `shouldBlockFn` that awaits the SDK's `navigate` for Back
  and Forward.

[routing-gate.mjs](../../spikes/120-ui/scripts/routing-gate.mjs), fourteen
checks per router (`evidence/routing-*.json`):

| Check | own | React Router | TanStack |
|---|---|---|---|
| Signed out, a resource link keeps its address through sign-in and opens | ✓ | ✓ | ✓ |
| Direct entry, signed in | ✓ | ✓ | ✓ |
| A plain click on a real link switches in place, without a reload | ✓ | ✓ | ✓ |
| Ctrl/Cmd-click opens the address in a new tab; the page stays | ✓ | ✓ | ✓ |
| The action address (`…/postpone`) opens its screen | ✓ | ✓ | ✓ |
| Close returns to the in-app opener (List) | ✓ | ✓ | ✓ |
| Close after a direct entry replaces with the start page (no extra entry) | ✓ | ✓ | ✓ |
| Back with a dirty draft asks; "Keep editing" keeps address and draft | ✓ | ✓ | ✓ |
| Back with a dirty draft, then discard | ✓ | ✓ | ✓ |
| Clean Back and Forward | ✓ | ✓ | ✓ |
| Legacy `?task=` becomes the canonical path by replacement | ✓ | ✓ | ✓ |
| Unknown and invalid addresses show explicit pages | ✓ | ✓ | ✓ |
| Reload on a resource address keeps the screen | ✓ | ✓ | ✓ |
| The View menu switches the address | ✓ | ✓ | ✓ |

Results are the same in Chromium and WebKit 27.2.

| | own | React Router 8.5.1 | TanStack Router 1.170.46 |
|---|---|---|---|
| Router library, gzip | 0 | 32.9 KB | 29.1 KB |
| App JavaScript, gzip | 221.6 KB | 252.3 KB | 248.2 KB |
| Adapter, lines | 99 | 83 | 106 |
| Production packages added | 0 | 3 | 9 |
| Blocking | the SDK's `navigate` only | the library's blocker, handed to the SDK | the library's blocker, awaiting the SDK |

The libraries do not shorten the adapter, and each adds its own blocking
mechanism beside the SDK's; the SDK must stay the one that decides about
unsaved edits. Their strengths (nested layouts, typed search parameters,
loaders, code splitting by route) are not what sempods apps need for a few
views and resource screens.

Found on the way, recorded in the UI spike: in WebKit, React Aria's modal
stayed mounted for good when it closed during its entry animation (a quick
Back or Close). The package's dialog no longer animates its entry; a gate
check covers it.

## Not verified

- Live hosts: the `_redirects` rules were generated and tested as patterns,
  not deployed to Netlify or Cloudflare Pages.
- An installed PWA navigating offline with the proposed allowlist.
- A real OAuth provider and callback; the fake Pod redirects at once.
- Firefox (launch failure on the test machine).
- Creation completion and slow overview reads, which #114 also describes
  (return to the opener after a confirmed creation, not waiting for a
  reload): app composition on top of this contract, not tested here.

## Scope for #114

- `apps.json`: an optional `resources` list of patterns per app, validated
  (no catch-all, no overlap with static routes, the callback and reserved
  files).
- Generator: allowlist with the optional query, `_redirects` lines for the
  declared patterns, `returnTo` for the declared patterns, with tests for
  the addresses above.
- Skeleton `routes.ts`: the declared patterns, `close()` with the opener in
  `history.state`, canonical replacement; recipe and reference screen with
  the package's screen dialog (#117).
- Publishing instructions: the rewrite requirement for apps with resources.
- Focus adoption in haed/sempods-apps#88: replace `routeFallback.ts`, the
  hand-written Netlify rules and the `returnTo` override with the generated
  ones.
