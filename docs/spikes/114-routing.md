# Spike: routing approach for #114

[Claude] Companion to the [UI spike](120-ui-primitives.md), run on
2026-10-30 at the owner's request so that both decisions are settled before
implementation starts, and revised after Codex's review of 368057f
(sempods/sempods-apps-template#121). It answers how apps get addressable
resource and action screens (sempods/sempods-apps-template#114) and whether
a router library should sit under them. The owner decides; nothing here
changes the starter. Evidence and scripts are in
[spikes/120-ui](../../spikes/120-ui/README.md) (`apps/routing`,
`scripts/routing-gate.mjs`, `scripts/route-contract.mjs`).

## Answer

1. **One declaration per app drives the address contract.** Literal routes
   and resource patterns in `apps.json` (for Focus `list`, `tasks/add`,
   legacy `tasks/new`, `tasks/:id`, `tasks/:id/postpone`) generate the host
   rewrites, the PWA navigation allowlist and the bounded sign-in return.
   The app's own parser recognises the same addresses and shows an explicit
   page for anything else.
2. **Keep the template's own router.** After Codex's review it needed one
   correction for history moves during an open leave question; the fix is
   about twenty lines, and the own router now passes the whole expanded
   matrix in Chromium and WebKit. React Router fails one of its cases,
   TanStack Router three, one of them losing a draft without a question.
   This is evidence for these adapters on this matrix, not a general
   ranking of the libraries. In an [authoring test](#authoring-test),
   assistants extended the app equally well on the own router and on
   idiomatic React Router; prior knowledge of the library gave no visible
   advantage.
3. **The source Context belongs to the address.** A resource address names
   its source (`?context=…`); the app edits that Context or shows an explicit
   error, never the currently selected one.
4. **Leaving the document is not protected by any router.** Back past the
   document's first entry, a reload or closing the tab loses an unsaved
   draft without a question. That needs an SDK decision (a `beforeunload`
   prompt or draft persistence), not routing.

The routing work does not change the UI recommendation: the package's
screen dialog follows the route, whichever router moves the history. The
routed screen (#117) is built once, on both.

## Baseline

Template 0.8.0 (908615c), SDK main at addf662, the UI package from the UI
spike (React Aria). Routers: `react-router` 8.5.1 (data router, library
use) and `@tanstack/react-router` 1.170.46 (code-based route tree).
Playwright 1.64.1 with Chromium 156.0.8078.4 and WebKit 27.2; Firefox did
not launch on the test machine. A loopback fake Pod in which two Contexts
hold the same task subject with different titles; no live host, no
installed PWA, no real OAuth provider.

## The contract today

Apps declare static routes in `apps.json`. The generator turns them into
`app.routes` and a `returnPath` that returns only to a static route, a
Workbox `navigateFallbackAllowlist` of the start page and the routes, and in
the site build one copy of `index.html` per route, so "the layout is the
same for every host" and needs no rewrites. Today's allowlist ends at the
path although Workbox matches path and query: of the thirteen addresses
below that should open the app offline, it serves ten without the shell
(every query, every resource and creation path). Focus works around this in
`routeFallback.ts`, with its own Netlify rules and a `returnTo` override.

## The proposed contract, checked layer by layer

[route-contract.mjs](../../spikes/120-ui/scripts/route-contract.mjs) checks
24 addresses against four layers at once (`evidence/route-contract.json`):

- **Host**: the published files first (the shell, a copy per literal route,
  the callback page, `did.json`, assets), then the generated rewrites
  `/focus/tasks/:id /focus/index.html 200` and
  `/focus/tasks/:id/postpone /focus/index.html 200`, with the placeholder
  semantics [Netlify](https://docs.netlify.com/manage/routing/redirects/redirect-options/#placeholders)
  and [Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/redirects/#placeholders)
  document: one segment including dots, query kept, trailing slash ignored.
  This is an emulation of the documented rules, not a deployment.
- **Worker**: the allowlist
  `^/focus/(?:(?:list|tasks/add|tasks/new|tasks/[A-Za-z0-9_-]+|tasks/[A-Za-z0-9_-]+/postpone)/?)?(?:\?[^#]*)?$`.
- **App**: the real parser of the routing app (`places.ts`).
- **Sign-in return**: the address itself if it is below the app's path and
  not the callback, else the start page.

Rules the check enforces: offline, the worker serves the shell only for
addresses the host would answer; wherever the shell answers, the app knows
the address or shows an explicit page; sign-in never returns to the callback
or another app. The one **permitted difference**: a host placeholder matches
any segment, so `/focus/tasks/abc.json` and `/focus/tasks/!!!` get the shell
online but not offline; the app shows "This task link is not valid" for
both. **Precedence**: literal routes win over patterns that share their
prefix (`tasks/add` before `tasks/:id`): the host serves their file first
and the parser checks literals first. The app guarantees its identifiers
never equal a literal; Focus's base64url-encoded absolute IRIs always start
with `aHR0c`. A literal route with a slash (`tasks/add`) needs the site build
to write `tasks/add.html` in a subfolder, which it does not do today.

Apps with resource patterns need a host that honours `_redirects` rewrites;
apps with literal routes only stay host-neutral.

## Client routers

The same Focus-like app under `/focus/`
([apps/routing](../../spikes/120-ui/apps/routing)): Zen and List views, a
task screen with the SDK's `ResourceEditor` in the package's dialog, its
"Not today" action, a creation route, the legacy `?task=` and `tasks/new`
links and not-found pages. The address model
([places.ts](../../spikes/120-ui/apps/routing/src/places.ts)) is the app's,
as #114 asks; the adapters only move through the history:

- **own**: the template's `routes.ts` pattern (History API, the shown
  entry's position in `history.state`, the SDK's `navigate` around every
  switch, undoing a declined Back or Forward), extended to the patterns and
  an opener-aware `close()`. The correction after the review: while the SDK
  decides about a Back or Forward, further history moves start no second
  decision, and the decision applies to wherever the browser is when it
  ends, never to an earlier target. An entry without the router's position
  shows the shown address again in place when the person stays.
- **React Router**: a data router with one catch-all route; `useBlocker`
  pauses every Back and Forward and hands it to the SDK's `navigate`, which
  calls `proceed()` or `reset()`. The basename needs its trailing slash.
- **TanStack Router**: a code-based route tree; `useBlocker` with an
  asynchronous `shouldBlockFn` that awaits the SDK's `navigate`.

In both library adapters the blocker is only the transport that pauses the
navigation; the decision stays with the SDK. That is a legitimate design,
not a second policy for unsaved edits.

[routing-gate.mjs](../../spikes/120-ui/scripts/routing-gate.mjs): 29
checks and one observation per router, the same in Chromium and WebKit 27.2
(`evidence/routing-*.json`). Each history check asserts the address, what is
shown, the draft and the next Back together.

| Check | own | React Router | TanStack |
|---|---|---|---|
| Signed out: a resource link, a link with a named source, an invalid legacy link keep their address through sign-in and show it | ✓ | ✓ | ✓ |
| Direct entry, plain and Ctrl/Cmd-click on real links, action address, View menu | ✓ | ✓ | ✓ |
| Close returns to the in-app opener; after a direct entry it replaces with the start page | ✓ | ✓ | ✓ |
| Back with a dirty draft: keep editing, discard; clean Back and Forward | ✓ | ✓ | ✓ |
| Back, then Forward while the question is open, then **discard**: address and screen agree, the draft is gone, the next Back leaves | ✓ | ✓ | ✗ ¹ |
| Back, then Forward while the question is open, then **keep**: address, screen and draft kept, the next Back asks again | ✓ | ✓ | ✗ ¹ |
| Back twice while the question is open, then keep | ✓ | ✓ | ✓ |
| Back twice while the question is open, then **discard**: the person leaves the task | ✓ | ✗ ² | ✗ ² |
| Two entries back and forward at once (`history.go(±2)`) | ✓ | ✓ | ✓ |
| Reload on a task, then Back and Forward | ✓ | ✓ | ✓ |
| Legacy `?task=` and `tasks/new` become canonical by replacement; an invalid legacy link keeps its error page | ✓ | ✓ | ✓ |
| `tasks/add` wins over `tasks/:id` | ✓ | ✓ | ✓ |
| Unknown and invalid addresses show explicit pages; reload keeps a task | ✓ | ✓ | ✓ |
| Links name the source Context; a named source is read and written (the other Context's copy stays unchanged), also on the action route and after reload | ✓ | ✓ | ✓ |
| A named source the person cannot read: an explicit error, no editor | ✓ | ✓ | ✓ |
| Observation: Back out of the document with a dirty draft | ³ | ³ | ³ |

1. The Forward makes the SDK's question disappear; the draft is gone without
   an answer, and in the keep case the next Back leaves without asking.
2. After "Discard and continue" the task stays on screen (consistent with
   the address, but the person's step away is not carried out).
3. In every adapter: no prompt, and the draft is not restored when the
   person comes back. No router can intercept leaving the document.

Codex found three of these cases in 368057f: the own router applied an
obsolete target after a Forward during the question (fixed above), the
source query was dropped on canonicalisation and the editor opened the
selected Context (fixed in the model and the screen), and the own router
replaced an invalid legacy link with the start page (fixed: unknown and
invalid addresses keep their address). Writing the matrix also showed that
the not-found dialog, a modal, blocked sign-in for signed-out invalid links;
the app now shows it only once connected, as #114 asks.

| | own | React Router 8.5.1 | TanStack Router 1.170.46 |
|---|---|---|---|
| Router library, gzip | 0 | 32.9 KB | 29.1 KB |
| App JavaScript, gzip | 222.4 KB | 253.1 KB | 249.0 KB |
| Adapter, lines | 117 | 83 | 106 |
| Production packages added | 0 | 3 | 9 |
| Matrix (29 checks) | 29 | 28 | 26 |

The library adapters might reach the full matrix with more work on their
blocker handling; the spike did not try. If the own router's history code
grows well beyond the correction above during implementation, compare it
with the React Router adapter again on this matrix.

## Authoring test

Added on 2026-10-31 at the owner's request: the matrix shows robustness,
but apps in the template are built by assistants. Does an assistant extend
an app on the own router as well as on a router library it knows from many
examples?

**Setup.** Two bases with the same screens and the same matrix result as
the adapters above (29/29 and 28/29):
[authoring-own](../../spikes/120-ui/apps/authoring-own) uses the own router
as a package API (`useNav(places)`, `nav.link`, `nav.go`, `nav.close`) with
the app's address model in `places.ts`;
[authoring-rr](../../spikes/120-ui/apps/authoring-rr) uses React Router
idiomatically (a route tree, `<Link>`, `useNavigate`, `useParams`,
`useSearchParams`), with a provided module that hands every navigation,
links and `navigate()` included, to the SDK's leave question. In both, the
provided router module is marked as not to be edited, `routes.json` stands
for the declaration in `apps.json`, and an `AUTHORING.md` of the same
structure and length explains addresses, navigation and screens.

Six fresh agents, three per base (Sonnet 5.5 twice, Haiku 5.5 once), got
the same three owner requests in German and only their own copy of the
app, could run `tsc` and `vite build`, and had no browser:

1. A notes screen per task at `tasks/<id>/notes`, editing the description,
   linked from the list.
2. A settings page at `settings`, from the menu.
3. A "Next task" button in the task's details that switches to the next
   open task, without losing unsaved edits.

[authoring-check.mjs](../../spikes/120-ui/scripts/authoring-check.mjs)
checks each run: ten behaviour checks in the browser (link, direct entry,
saving to the named Context, Back with a dirty draft, Close, the menu
route, Next task clean, keep and discard), the declaration through the
generator rules (host and offline shell for the new addresses), history or
`location` calls and blockers outside the provided module, changes to that
module, and the 29-check matrix for regressions. A reference solution per
base passed every check before the runs (`evidence/authoring/ref-*`).

| Run | Notes | Settings | Next task | Declared | Matrix | Bypass | Router edited | Diff lines |
|---|---|---|---|---|---|---|---|---|
| own, Sonnet 1 | 5/5 | 2/2 | 3/3 | ✓ | 29/29 | 0 | no | 76 |
| own, Sonnet 2 | 5/5 | 2/2 | 3/3 | ✓ | 29/29 | 0 | no | 85 |
| own, Haiku | 5/5 | 2/2 | 3/3 | ✓ | 29/29 | 0 | no | 105 |
| React Router, Sonnet 1 | 5/5 | 2/2 | 3/3 | ✓ | 28/29 | 0 | no | 77 |
| React Router, Sonnet 2 | 5/5 | 2/2 | 3/3 | ✓ | 28/29 | 0 | no | 64 |
| React Router, Haiku | 5/5 | 2/2 | 3/3 | ✓ | 28/29 | 0 | no | 57 |

The one matrix failure in every React Router run is the base's
(repeated Back, then discard); no run introduced a regression. The agents
needed about the same effort on both bases (80 to 120 thousand tokens,
70 to 170 seconds per run). Observations, the same on both bases:

- Every run extended the declaration correctly; none touched the router
  module or called the History API itself.
- Every run switched "Next task" in place (`replace`), so Back after it
  leaves the task screen; the request did not say, and the choice was
  consistent.
- Every run named the selected Context in the next task's address, not the
  source the current address names. The instructions do not say which
  Context a derived link names; the template's should.
- Both Haiku runs additionally called `edit.close()` before switching:
  redundant with the guard, harmless.
- On the own router a new address means two edits in `places.ts` (`parse`
  and `format`); on React Router one route entry. The diffs differ little.

Limits: three runs per base; every request had a pattern to copy in the
app (an action route, a menu item, a guarded switch); labels were given;
both instructions were written for this test. Patterns the app does not
show yet (nested layouts, loaders, state in the query) were not tested,
and there a library's familiarity might weigh more. **Conclusion:** at this
level the authoring risk does not separate the two; the assistants followed
the app's existing code and its instructions, not prior knowledge of a
library. The router recommendation stands; what it requires is that the
own router ships as a documented package API with examples in the starter,
like the provided module here, not as `routes.ts` copied into each app.

## What is protected, and what is not

| Situation | Protected? |
|---|---|
| In-app links, menu switches, Close, Back and Forward within the app's history | Yes: the SDK asks; staying keeps address, screen and draft |
| History moves while the question is open | Yes, with the own router (see the matrix) |
| Back past the document's first entry, reload, closing the tab, a typed address | No: the draft is lost without a question |

## Not verified

- Live hosts: the rewrite semantics are emulated from the hosts'
  documentation, not deployed to Netlify or Cloudflare Pages.
- An installed PWA navigating offline with the proposed allowlist.
- A real OAuth provider and callback; the fake Pod redirects at once.
- Firefox (launch failure on the test machine).
- Creation completion and slow overview reads, which #114 also describes
  (return to the opener after a confirmed creation, not waiting for a
  reload): the creation route here only shows a placeholder.

## Scope for #114

- `apps.json`: literal `routes` (with slashes) and `resources` patterns,
  validated: no catch-all, literals win over patterns sharing their prefix,
  never the callback, reserved files or assets.
- Generator and site build: the allowlist with the optional query, a copy
  per literal route including subfolders, `_redirects` lines for the
  patterns only, a `returnTo` bounded to the app's path; tests over the 24
  addresses above.
- The router as a package API (`useNav` over the app's address model, as in
  the authoring test) instead of `routes.ts` copied into each app, so
  corrections reach existing apps: the corrected decision handling,
  `close()` with the opener in `history.state`, canonical replacement only
  for known addresses. The app keeps its address model; the starter shows
  a resource route, an action route and a menu route as examples, and a
  recipe for the source Context in resource addresses (including which
  Context a derived link names) and an explicit error when it cannot be
  used.
- Sign-in: explicit error pages wait until the person is connected.
- Publishing instructions: the rewrite requirement for apps with resource
  patterns, and a deployment check on each host the template supports.
- SDK: a decision on leaving the document with unsaved edits
  (`beforeunload` or draft persistence).
- Focus adoption in haed/sempods-apps#88: replace `routeFallback.ts`, the
  hand-written Netlify rules and the `returnTo` override with the generated
  ones.
