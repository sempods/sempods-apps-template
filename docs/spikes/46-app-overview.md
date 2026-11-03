# Spike: the app overview as an entry point for #46

[Claude] Written on 2026-11-03 at the owner's request, as a decision paper
before any code. It answers how the site's overview
(sempods/sempods-apps-template#46) becomes a good entry point "like an app
store with app icons", against template 0.9.0-dev.1 (a4179c6) and SDK
0.7.0-dev.2. No prototype was built; the evidence is the current code and
the SDK's PWA guide. **Not decided yet.**

## Answer

1. **Most of the store is already there.** Since 0.8.0, `build-site` renders
   one card per app with its monogram icon, title and the `description` from
   `apps.json`, in light and dark mode, with `lang` per card and a visible
   focus. What is missing is small, and none of it needs a script or the SDK
   on the overview.
2. **Add three things, in this order**, each its own PR:
   1. a site title and one line of introduction in `apps.json`;
   2. an install hint for apps with `pwa: true`, as text, because no page can
      install another page's app;
   3. a local overview: `pnpm run dev` without an ID lists every app with its
      development address.
3. **Leave out** owner HTML templates, grouping, search and store-like
   metadata (ratings, screenshots, categories) until an owner with many apps
   asks. Each would be a second data model or a file the update has to merge.

## Baseline

- `scripts/lib/overview.mjs` (107 lines) renders `site-dist/index.html` and
  `404.html` from entries `{ id, title, language?, href, icon?, description? }`.
  `build-site.mjs` fills them from `apps.json` and the built `icon-192.png`.
  Neither page runs a script.
- The cards sit in a grid of at least 12rem per column, with a 4rem icon, the
  title in bold and the description below. The page uses system colours
  (`Canvas`, `CanvasText`, `GrayText`, `LinkText`, `Highlight`), so it follows
  light and dark mode without a theme of its own.
- The order is the order of `apps.json`, which the owner controls. The page
  title is the fixed word "Apps" ("Apps" in German too). The page's language
  is the apps' shared language, else English.
- An app is a separate page with its own runtime, identity and manifest. The
  overview mounts no runtime and signs nobody in (one runtime owner per page,
  [vision](../vision.md)).

## The scope of #46, item by item

| Item in #46                                        | State                                                                 | Proposal                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cards with icon, name, short description           | Done in 0.8.0: `description` in `apps.json`, set by `new-app`          | Keep the one source, `apps.json`; the manifest is generated from it                                                                                 |
| Install hint for PWAs                              | Missing                                                               | A line on each installable card, with one short help text on the page (below)                                                                     |
| Local overview during development                  | Missing; `pnpm run dev` without an ID prints the IDs only             | `pnpm run dev` without an ID prints each app's title and `http://127.0.0.1:<devPort><path>`                                                         |
| Owner customisation and branding                   | Missing                                                               | `site.title` and `site.intro` in `apps.json`; no owner HTML file                                                                                    |
| Sorting and grouping                               | The order of `apps.json`                                              | Keep it; the assistant reorders `apps.json` when asked                                                                                              |
| Empty state, dark mode, accessibility              | Done: "No apps yet.", system colours, `lang` per card, focus outline   | Check the contrast of `GrayText` on the letter icon, which a browser may render below 4.5:1                                                         |
| No runtime or sign-in on the overview              | Done                                                                  | Keep                                                                                                                                                |

## Install hints

The [SDK's PWA guide](https://github.com/sempods/sempods-typescript/blob/v0.7.0-dev.2/docs/pwa.md)
keeps each app's manifest, `id`, `scope` and service worker under its own
path. That has two consequences for the overview:

- The overview cannot install an app. The browser offers installation, and
  Chromium's `beforeinstallprompt`, only on a page inside the app's manifest
  scope. A button on the overview would at most link to the app.
- Installation differs by browser: an install icon or menu entry in desktop
  Chromium, "Add to Home Screen" in the share menu on iOS, and little or
  nothing in desktop Firefox, depending on the system. Installed apps are
  marked experimental in the guide.

Proposal: an installable card gets a short line such as "Can be installed",
and the page gets one `<details>` block "Install an app" with the three
browser cases and the guide's caveat. There is no script, and nothing is
detected. An app's own page can later offer installation itself, with its
own `beforeinstallprompt`; that is an app feature, not the overview's.

## Branding

Three options were weighed:

| Option                                                         | For                                                     | Against                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **`site.title` and `site.intro` in `apps.json`** (recommended) | One source, validated by `check`; updates never merge it | No logo, colours or layout of the owner's own                                                         |
| An owner template, for example `site/overview.html` with slots | Full control                                            | A file that starter updates must never touch and the tooling must still fill; a second rendering path |
| The overview as an app in `apps/`                              | The full kit, themes and the visual check               | Needs a build, a runtime-free app variant and a reserved path; heavier than the page it replaces     |

A title and an introduction cover "a good entry point" for a personal or
family site. Colours and a logo can follow later as `site.theme` with one of
the skeleton's themes, if an owner asks.

## Local overview

`pnpm run dev <id>` starts one app. Starting all apps at once means one Vite
server per app, with its memory and file watchers; it is rarely what an owner
working on one app needs. The cheaper step is to make the command without an
ID helpful: print each app's title and address, and how to start one. A
served local overview page can follow if owners run several apps at the same
time.

## Follow-up work, if decided

1. `site.title` and `site.intro`: `validateApps`, `configure-site` or a new
   flag, `renderOverview`, the publish guide, tests. About 60 lines.
2. Install hint: an `installable` flag in the overview entry from `app.pwa`,
   the `<details>` text in English and German, tests. About 50 lines.
3. `pnpm run dev` without an ID: the list in `scripts/dev.mjs`, a test. About
   20 lines.
4. Contrast of the letter icon: measure `GrayText` on `Canvas` in Chromium,
   WebKit and Firefox, and switch to `CanvasText` on a tinted background if
   any falls below 4.5:1.

## Open decisions for the owner

- Is a site title with one line of introduction enough branding for now?
- Should the install hint appear at all, given that installed apps are still
  experimental in the SDK?
- Should `pnpm run dev` without an ID only list the apps, or start them all?
