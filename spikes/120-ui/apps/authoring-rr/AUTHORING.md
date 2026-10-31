# Building screens in Focus

Focus is a task app under `/focus/` on a site with several apps. Sign-in,
data access, reading and writing, and the question before unsaved edits are
lost come from the SDK (`@sempods/app-sdk`). UI components come from the UI
package (`kit` from `@sempods-spike/ui-aria`: `kit.Button`,
`kit.ScreenDialog`, `kit.HeaderMenu`). The task data is `taskFields` from
`@spike/harness` (`title`, `description`, `done`, `planned`).

## Addresses

Every screen has its own address, so it can be shared, reloaded and opened
in a new tab. Routing is React Router 8.

- The routes are declared in `src/App.tsx` (`createAppRouter([...])`). Paths
  are below the basename `/focus/`: `to="/list"` is `/focus/list`. Literal
  routes and patterns (`tasks/:id`) are matched by React Router's ranking.
  Invalid parameters show `<NotFound reason="invalid" />`.
- `routes.json` declares every address for the host and the offline app:
  `routes` are literal paths below `/focus/` (the host serves a copy of the
  app for each), `resources` are patterns where `:name` stands for one path
  segment (the host rewrites them to the app). An address missing here
  answers 404 when someone opens it directly, and does not open offline.
- A task address names the task's source Context in `?context=`
  (`taskPath(subject, context)` in `src/addresses.ts`). A task screen edits
  that Context, never the currently selected one.

## Navigation

`src/sempods/router.tsx` is provided by the UI package; do not edit it.

- Links: `<Link to="...">`. They keep a real address, so a modified click
  opens a new tab.
- Buttons and menu items: `const navigate = useNavigate()`, then
  `navigate(path)`; `navigate(path, { replace: true })` switches without a
  new history entry.
- Leaving a screen: `const close = useClose(fallback)` returns to the screen
  that opened it, or after a direct entry replaces the address with
  `fallback`.
- Every React Router navigation and every Back and Forward runs through the
  SDK: with unsaved edits it asks first. Do not add your own `useBlocker`,
  and never call `history.pushState`, `history.back()` or `location` setters
  yourself; they bypass that question.

## Screens

- A screen is a route element that renders a `kit.ScreenDialog`; it shows
  over the overview through the `<Outlet />` in `Frame` (see `TaskScreen`).
- To edit a resource, use `useContextEditor(taskFields)` with
  `ResourceEditor`, as `TaskScreen` does: on Close, `await edit.close()`
  (the SDK asks about unsaved edits), then `close()`.

## Checking

Run `npx tsc -b` and `npx vite build` in this folder.
