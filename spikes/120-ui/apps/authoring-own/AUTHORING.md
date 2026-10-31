# Building screens in Focus

Focus is a task app under `/focus/` on a site with several apps. Sign-in,
data access, reading and writing, and the question before unsaved edits are
lost come from the SDK (`@sempods/app-sdk`). UI components come from the UI
package (`kit` from `@sempods-spike/ui-aria`: `kit.Button`,
`kit.ScreenDialog`, `kit.HeaderMenu`). The task data is `taskFields` from
`@spike/harness` (`title`, `description`, `done`, `planned`).

## Addresses

Every screen has its own address, so it can be shared, reloaded and opened
in a new tab.

- `src/places.ts` owns the addresses: the `Place` type, `format` (place to
  address) and `parse` (address to place and its canonical form). Literal
  addresses come before patterns in `parse`. Invalid or unknown addresses
  become `not-found` and keep their address.
- `routes.json` declares every address for the host and the offline app:
  `routes` are literal paths below `/focus/` (the host serves a copy of the
  app for each), `resources` are patterns where `:name` stands for one path
  segment (the host rewrites them to the app). An address missing here
  answers 404 when someone opens it directly, and does not open offline.
- A task address names the task's source Context in `?context=`. A task
  screen edits that Context, never the currently selected one.

## Navigation

`src/sempods/router.tsx` is provided by the UI package; do not edit it.

- Call `useNav(places)` once, in `Frame`, and pass `nav` down.
- Links: `<a {...nav.link(place)}>`. They keep a real address, so a
  modified click opens a new tab.
- Buttons and menu items: `nav.go(place)`; `nav.go(place, { replace: true })`
  switches without a new history entry.
- Leaving a screen: `nav.close(fallback)` returns to the screen that opened
  it, or after a direct entry replaces the address with `fallback`.
- Every `nav` navigation and every Back and Forward runs through the SDK:
  with unsaved edits it asks first. Never call `history.pushState`,
  `history.back()` or `location` setters yourself; they bypass that question.

## Screens

- A screen is a `kit.ScreenDialog` over the overview, open while the current
  place is the screen's place (see `TaskScreen`).
- To edit a resource, use `useContextEditor(taskFields)` with
  `ResourceEditor`, as `TaskScreen` does: on Close, `await edit.close()`
  (the SDK asks about unsaved edits), then `nav.close(...)`.

## Checking

Run `npx tsc -b` and `npx vite build` in this folder.
