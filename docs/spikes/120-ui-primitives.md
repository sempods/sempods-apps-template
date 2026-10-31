# Spike #120: UI primitives and role tokens

[Claude] Result of the spike in sempods/sempods-apps-template#120, run on
2026-10-30 and revised after Codex's review of commit 4ff2b48 (in the issue).
**Decided on 2026-10-31** (closing comment in #120): shadcn/ui on React Aria
as the package `@sempods/app-ui` in sempods/sempods-typescript (sempods/sempods-typescript#202),
with the SDK follow-ups in sempods/sempods-typescript#200 and #201. The spike
code stays on the branch `claude/120-ui-spike`; evidence, scripts and the
variants are in [spikes/120-ui](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/README.md). The
[status](#status) at the end separates what is verified from remaining spike
work and adoption prerequisites.

## Recommendation

Replace the hand-built kit with **shadcn/ui on React Aria Components**, and
deliver its reusable interaction layer as a **versioned sempods package**
rather than as source copied into each app:

- The package holds the shadcn aria-nova components the starter uses, the
  sempods adapters (routed screen dialog, header menu, calendar-date chooser,
  action button) and the token contract. It stays thin: no wrapper over the
  whole React Aria API.
- Each app owns its `theme.css` (palette roles and component variants), its
  screens and anything it ejects from the package on purpose.
- `@sempods/client-sdk` stays UI-free. `@sempods/app-sdk` gets no UI
  framework; it needs four bounded styling follow-ups (below).
- Adopt only with the SDK release that contains the Escape fix from
  sempods/sempods-typescript#186 and the calendar-date field from
  sempods/sempods-typescript#190 (both on main, not in 0.6.0). On 0.6.0 every
  candidate fails the interop gate.

Why React Aria over Base UI, given that both pass the gate on SDK main, in
Chromium and WebKit:

1. **Dates.** React Aria's calendar works on `CalendarDate`, a date without
   time or zone, which matches the SDK's `xsd:date` field. The persistence
   roundtrip below passes with it in three time zones. Base UI ships no
   calendar; shadcn's base-nova calendar is react-day-picker on `Date`
   objects, so the conversion at local noon has to live somewhere. That could
   be one adapter in the package rather than in every app, so this is a
   reason of fit, not a blocker.
2. **Overlay integration.** React Aria handles Escape and outside presses
   through React events on its own overlay and so respects the SDK's
   propagation boundaries. Base UI listens on `document` and ignores
   `defaultPrevented`; on SDK 0.6.0 it leaked Escape from every SDK
   confirmation, React Aria from one. On SDK main both pass.

The kit corrections the spike needed (for React Aria the dialog's outside
presses, the calendar locale and size, and no entry animation, because
WebKit kept a modal closed during it mounted; three for Base UI) are a
snapshot of this exercise, not a maintenance metric. **Base UI remains a viable
alternative.** The price of React Aria: about 13 KB gzip more JavaScript,
and shadcn's aria track is newer than its base track (shadcn's default
preset is base-nova), so assistants have seen fewer examples of it.

## Baseline and candidates

| | Version |
|---|---|
| Template | `main` at 908615c (0.8.0) |
| SDK, released | `@sempods/app-sdk` and `@sempods/client-sdk` 0.6.0 (npm) |
| SDK, source | sempods-typescript `main` at addf662 (built from source; contains #186, #190, font and radius tokens) |
| shadcn CLI and registry | `shadcn` 4.23.0, presets base-nova, aria-nova, radix-nova |
| Primitives | `@base-ui/react` 1.9.0, `react-aria-components` 1.22.1 (+ `@internationalized/date` 3.12.4), `radix-ui` 1.8.1 |
| Styling | `tailwindcss` 4.3.3, `cn` 0.5.1, `class-variance-authority` 0.7.1 |
| Calendar (base, radix) | `react-day-picker` 10.0.2, `date-fns` 4.4.0 |
| React, Vite | React 19.3.1, Vite 8.3.5 |
| Browsers | Playwright 1.64.1: Chromium 156.0.8078.4, WebKit 27.2; Firefox 157 did not launch on the test machine |
| Node | 24.21.0 (the repository pins 24.15.0; `pnpm run check` was run with 24.21.0) |

Every result names its SDK baseline. "main" results are not available to
apps until the SDK releases them. All evidence uses a loopback fake Pod in
the dev server; it is fixture and browser evidence, not a real Pod, an
installed PWA or a human test.

**Desk step.** The candidates share the styling and distribution layer
(shadcn) and differ only in primitives. Reading the libraries' dismissal code
before building predicted the gate well:

- Radix `DismissableLayer` and Mantine 9.7.4 `useModal` catch Escape on the
  document or window in the **capture** phase, before any SDK handler runs.
- Base UI's `useDismiss` listens on the document in the bubble phase and
  closes regardless of `defaultPrevented`; only `stopPropagation` keeps it out.
- React Aria's `useOverlay` reacts to React `keydown` on its own overlay and
  keeps a stack of open overlays.

Mantine 9.7.4 was compared on the desk only: a complete, versioned library
(fixes reach apps as dependency updates, `@mantine/dates` uses day strings),
but its own theme object and CSS-module styling replace the token contract
instead of extending it, it brings its own date library (dayjs), and its
capture-phase Escape would need the same workarounds as Radix. That did not
justify a third full implementation. **Plain React Aria with our own CSS** was
dropped: it removes the behaviour work but keeps all styling and its
maintenance with sempods, which is what the kit already costs.

## Stage 1: interop gate

A routed task dialog from each candidate holds an SDK `ResourceEditor`; SDK
confirmations (native `<dialog>` with `showModal()`) open above it. The
route lives in the address and, as in the template's `routes.ts`, every
switch, Back and Forward runs through the SDK's `navigate`, which asks before
an unsaved edit is left. Fifteen checks per candidate and SDK baseline, by
keyboard and pointer, each from a fresh page
([gate.mjs](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/scripts/gate.mjs), results in
`evidence/gate-*.json`). Chromium:

| Check | Base UI 0.6.0 | Base UI main | React Aria 0.6.0 | React Aria main | Radix main |
|---|---|---|---|---|---|
| Escape in a dirty field asks; dialog and draft stay | ✗ ¹ | ✓ | ✗ ¹ | ✓ | ✓ |
| Escape in the SDK leave confirmation closes only it | ✗ ² | ✓ | ✓ | ✓ | ✓ |
| Escape on the heading's Close asks, then only the question closes | ✗ ² | ✓ | ✓ | ✓ | ✓ |
| Close, then Cancel in the question: all stays; question on top, centred, Tab trapped | ✓ | ✓ | ✓ ³ | ✓ ³ | ✗ ⁴ |
| Escape in the heading menu closes only the menu | ✓ | ✓ | ✓ | ✓ | ✓ |
| Escape in the date chooser inside the fields closes only it | ✓ | ✓ | ✓ | ✓ | ✓ |
| Escape in the SDK delete question closes only it | ✗ ² | ✓ | ✗ ² | ✓ | ✗ ⁵ |
| Tab stays in the dialog; page behind inert or hidden | ✓ ⁶ | ✓ ⁶ | ✓ | ✓ | ✓ |
| Clean Escape closes and returns focus to the opener (opened by keyboard) | ✓ | ✓ | ✓ | ✓ | ✗ ⁷ |
| Explicit Save after the cancelled closes | ✗ ² | ✓ | ✓ | ✓ | ✓ |
| 1280 → 375 → 1280 px keeps the draft, full screen on the phone | ✓ | ✓ | ✓ | ✓ | ✓ |
| Back closes the routed dialog, Forward reopens it | ✓ | ✓ | ✓ | ✓ | ✓ |
| Back with a dirty draft asks; "Keep editing" keeps dialog, draft and address | ✓ | ✓ | ✓ | ✓ | ✗ ⁴ |
| Back with a dirty draft, then discard: the dialog closes | ✓ | ✓ | ✓ | ✓ | ✗ ⁴ |
| Closed right after opening, during its entry animation: it goes | ✓ | ✓ | ✓ ⁸ | ✓ ⁸ | ✓ |

1. SDK 0.6.0 discards the draft on Escape (the #186 bug), in every candidate.
2. The key reaches the library dialog, which asks to close again: the question
   reappears.
3. With one adapter line: `shouldCloseOnInteractOutside={(el) => !el.closest('dialog')}`.
   Without it, a press in the SDK confirmation counts as a press beside the
   modal and the question reappears.
4. Radix's modal sets `pointer-events: none` on `body`; the SDK confirmation
   lives there, so its buttons cannot be pressed.
5. Capture-phase Escape closes the dialog from inside the SDK question.
6. Base UI moves focus away from its end guard one frame later; with key
   presses less than 16 ms apart, focus escapes
   ([probe-min.mjs](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/scripts/probe-min.mjs)). Not a
   concern for people, but for automated tests.
7. Focus lands on `body`.
8. In WebKit, React Aria's modal stayed mounted for good (`data-entering`
   and `data-exiting` at once, no animation running) when it closed within
   about 150 ms of opening, a quick Back or Close; Base UI did not
   ([probe-fast-close.mjs](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/scripts/probe-fast-close.mjs)).
   Found by the routing spike. The package's dialog no longer animates its
   entry; with that, the check passes in Chromium and WebKit.

**WebKit 27.2** (Playwright, SDK main): Base UI and React Aria pass all
fifteen checks (`evidence/gate-*-main-webkit.json`). An earlier version of
the focus check opened the dialog with a mouse click; WebKit does not focus a
link on click, so there was nothing to return focus to, in both candidates.
The check now opens the dialog by keyboard. WebKit automation is not evidence
of installed iOS or PWA behaviour. **Firefox** stays untested: Playwright's
Firefox 157 failed to launch on the test machine (a macOS sandbox extension
error), with and without the tool sandbox.

A first version of the harness switched routes with plain
`history.pushState`, without the SDK's `navigate`. There, Back with a dirty
draft closed the dialog before the SDK asked, in every candidate; the first
version of this write-up attributed that to #114. With the template's routing
pattern, both Back checks pass on SDK 0.6.0 and main.

**Radix is out**: its modal blocks the SDK confirmations, and working around
it would mean overriding three library internals. Base UI and React Aria
continue.

Found on the way, in every candidate (fixed app-side in the spike, SDK
follow-ups proposed below):

- **Cascade layers.** Tailwind 4 puts its utilities in `@layer utilities`;
  the SDK's `:where()` styles are unlayered, and unlayered rules beat layered
  ones whatever their specificity. Inside SDK surfaces (the editor's fields),
  shadcn components lost their look. The spike imports Tailwind's utilities
  unlayered; the SDK could instead put its styles in `@layer sempods`.
- **Preflight vs native dialogs.** Tailwind's preflight sets `margin: 0` on
  every element, which pushed the SDK confirmations into the top-left corner.
  The spike restores `margin: auto` for `dialog:modal`.
- **Inherited properties.** Inside SDK surfaces, SDK rules still colour what
  a component does not set itself (the outline button's text).

## Stage 2: reference screen, dates, contract, contrast, prompts

### Focus Zen screen

The Zen view, the header menu with a View submenu and checked choices, the
routed dialog (full screen below 640 px, up to 42rem wide above) and a
calendar-date chooser inside the editor fields run on both candidates
([screen.tsx](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/harness/src/screen.tsx)). Keyboard-only
checks ([interaction.mjs](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/scripts/interaction.mjs)),
Chromium, SDK main, in Europe/Berlin, Pacific/Kiritimati (UTC+14) and
Pacific/Pago_Pago (UTC−11):

| Check | Base UI | React Aria |
|---|---|---|
| Menu: Enter opens, ArrowRight opens View, ArrowLeft returns, Escape closes the submenu first, then the menu, focus back on the button; choosing "List" closes and checks it | ✓ after a | ✓ |
| Calendar selection: focus starts on the chosen day; arrows, PageDown, Enter, Apply; the chooser shows exactly one day and one month later in all three zones | ✓ after b, c | ✓ |
| German: month names, Monday first, SDK texts | ✓ | ✓ after d |
| Touch targets at 375 × 812 and 375 × 560: days and month buttons at least 44 × 44px without overlap, no horizontal overflow, Apply reachable by Tab and visible, focus back on the trigger | ✗ (not corrected) | ✓ after e |

Kit corrections the checks forced:

- a. Base UI keeps a menu open after a radio choice: `closeOnClick` on each
  choice.
- b. Base UI's popover focuses its first button (the month arrow):
  `initialFocus` returns the chosen day.
- c. The base-nova registry calendar (shadcn 4.23.0) lacks `ref={ref}` on its
  day button, so arrow keys never move the focus; the radix-nova item has it
  ([probe-cal.mjs](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/scripts/probe-cal.mjs)). A one-line
  patch in generated code, worth reporting upstream.
- d. React Aria reads the browser's locale unless the calendar sits in an
  `I18nProvider` with the app's locale.
- e. shadcn's calendar uses 28 × 28px cells (`--cell-size: --spacing(7)`),
  below the template's 44px targets. The kit sets `--spacing(11)` on the
  calendar, and the popover scrolls within the screen height (otherwise it
  overflowed a 812px screen by 8px). The same correction is in the package.
  The first version of this write-up claimed 44px controls throughout; the
  calendar was missed. Base UI's calendar was left at 28px. With 44px cells
  the chooser is tall: below a field low on a 375 × 812 screen, Apply first
  sits partly beyond the popover's edge and comes into view when the popover
  scrolls or Tab reaches it. A more compact chooser (presets first, as in
  Focus) is reference-screen work for #118.

### Calendar dates: persistence

With SDK main, the start date uses the SDK's public
`date(predicate, { optional: true, orDateTime: true })` field; the fake Pod
is seeded with typed RDF (two `xsd:date` days and one zoned `xsd:dateTime`).
SDK 0.6.0 has no date field; its gate runs read the same property as plain
text and are labelled as the compatibility baseline.
[roundtrip.mjs](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/scripts/roundtrip.mjs) checks what the
Pod stores, React Aria, in the three time zones (`evidence/roundtrip.json`):

| Check | Berlin | UTC+14 | UTC−11 |
|---|---|---|---|
| Select, Apply, explicit SDK Save, fresh page: stored `"2026-10-29"^^xsd:date`, no time, read back and shown | ✓ | ✓ | ✓ |
| Chooser closed without Apply: draft and stored value unchanged, Save stays disabled | ✓ | ✓ | ✓ |
| Day applied, then the edit cancelled: nothing written | ✓ | ✓ | ✓ |
| Stored `"2026-10-30T09:30:00+02:00"^^xsd:dateTime`: unchanged lexical value and datatype after a title edit and a cancelled chooser; applying a day replaces it with an `xsd:date` | ✓ | ✓ | ✓ |

One open design point: the trigger shows a stored date-time in the device's
zone (in UTC−11 "29 Oct 2026, 20:30"), while the chooser starts at the day of
the stored offset (30 October). Which day a person expects there is a
question for #118, not for the library.

### Theme and variant contract

[theme.css](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/harness/src/theme.css) has three parts:

1. **Palette roles per theme**, shadcn's names with foreground pairs, in
   `light-dark()`: `background`, `foreground`, `card`, `popover`, `primary`,
   `secondary`, `muted` (a surface) with `muted-foreground` (its text),
   `accent` (the highlight surface of focused menu items), `destructive`,
   `border` (decorative separators), `input` (control boundaries, 3:1) and
   `ring`. A theme changes only these values.
2. **Component variants per app**, switched with `data-actions`
   (`solid`, `inverted`) and `data-secondary` (`tonal`, `outline`, `text`) on
   `<html>`. They map controls to roles (`--action*`), never to colour
   values, so a theme's checked contrast stays checked. `inverted` gives the
   primary action the page colour with a 2 px primary outline and primary
   text, so it still stands out more than the secondary actions. The shadcn
   button reads these tokens (two edited lines in `button.tsx`).
3. **The SDK bridge**:

| SDK token | Role | Note |
|---|---|---|
| `--sempods-bg` | `background` | |
| `--sempods-text` | `foreground` | |
| `--sempods-muted` | `muted-foreground` | SDK muted is a text colour; shadcn `muted` is a surface |
| `--sempods-line` | `input` | The SDK draws field borders and separators with one token; field borders need 3:1, so SDK separators come out stronger than the app's |
| `--sempods-accent` | `primary` | Fills the SDK's primary button and also colours its secondary button text, checkbox accents and focus outlines |
| `--sempods-on-accent` | `primary-foreground` | |
| `--sempods-font`, `--sempods-radius` | `font-sans`, `radius` | SDK main only |

Roles the SDK cannot represent through its tokens: separate field-boundary
and separator colours, and action variants. With `inverted` or `outline` the
app's buttons change and the SDK's Save, Cancel and confirmation buttons do
not.

The focus indicator is part of the contract: shadcn's ring is the ring
colour at 50 % opacity, which measured 2.3:1 with a teal accent. The contract
draws a solid 2 px outline in the ring colour instead.

### Contrast

[contrast.js](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/scripts/contrast.js) measures what the
browser renders in the states a run reaches. It is a measurement aid for
these states, not a complete accessibility validation:

- Text, including the displayed value and the placeholder of inputs and text
  areas, against its composited background: 4.5:1, or 3:1 when large.
- Icons in buttons and field boundaries against the adjacent colour: 3:1.
- The focus indicator of each control reached by Tab: 3:1.
- Colours are resolved through a canvas, so `oklch`, `color-mix` and
  transparency count as painted. Disabled controls and content covered by a
  modal are exempt; decorative borders are not measured.

[contrast-selftest.mjs](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/scripts/contrast-selftest.mjs)
holds 19 controls that must behave as stated: white text on white,
transparent text, small text at 3:1, an input value white on white, a grey
text area value, a light placeholder, a light icon, a light field border, a
50 % teal ring and a light outline all fail; their readable counterparts pass.
One control repeats the reported blind spot in the real app: the task title
made white on white fails, the normal title passes. The first version of the
checker did not measure field values at all.

The runs cover six theme and variant combinations (calm and fresh; solid and
inverted actions; tonal, outline and text secondary actions) × light and dark
× 375 px and 1280 px × five states (Zen, menu open, dialog, date chooser, SDK
question) × two candidates. In the Zen state the three kinds of action
(primary, secondary, icon) are also measured hovered and pressed, and every
control reached by Tab while focused. Results (`evidence/contract/contrast-*.json`): 240 page states with 5,928
measurements, no failure. Lowest values: text 4.93:1, field values 14.76:1
(these screens have no placeholders; the notes app below does), icons
4.96:1, field boundaries 3.05:1, focus indicators 6.51:1.

On the way there:

- Field boundaries: SDK editor fields measured 1.13:1 with `--sempods-line`
  on the decorative border role, and 2.89:1 on the editor's tinted card with
  the first `input` value. Both are corrected in the contract (see the
  bridge). The template's current themes have the same problem: `line` at
  1.24:1, although their comments claim 4.5:1 for every pair.
- Focus: shadcn's ring measured 2.3:1 with the teal theme; the contract's
  solid outline replaced it, also on menu items, which otherwise show focus
  only through the `accent` surface (about 1.1:1).

Not measured: states the runs do not reach (for example validation errors
inside the SDK editor), selected text, scrollbars, Windows high-contrast
mode, and anything beyond colour contrast.

### Theme-edit prompts

Three owner prompts from the issue, each given once to a fresh assistant
(Claude Sonnet) per candidate, in an isolated copy of the app with the theme
moved into the app as in an owner repository. The brief named the app folder
and the owner's words only; no hint about roles or variants. Each result was
rendered and measured afterwards with the extended checker.

| Prompt | Base UI | React Aria |
|---|---|---|
| "Invert the colours of the action buttons." | Made `inverted` the default in `theme.css`, kept `solid` as the switch. | First run reported a change to `index.html` that was not on disk; the rendered check caught it. Second run: same as Base UI. |
| "Make the secondary actions outlined." | Made `outline` the default, kept `tonal` as the switch. | Same. |
| "Switch to a warmer colour palette." | New palette values (cream, terracotta, amber in dark). | New palette values, destructive moved to crimson to stay distinct. |

All results changed one file and used the contract instead of editing
component colours (each run's change is in `evidence/prompt-*/change.diff`).
Contrast, with the extended checker at 375 px and 1280 px, light and dark,
five states each (120 page states): no failure in any of the six results;
lowest text 4.88:1 (React Aria, warm), lowest icon 4.58:1 (Base UI, warm). Every "invert" run read "action buttons" as the
primary action only and said so. The prompts show no difference between the
candidates: the contract decided the outcome, not the primitives. Whether
assistants build better UI with libraries they know stays open; these
prompts did not test it.

## Stage 3: update path, costs, an ordinary app

### Update path

shadcn distributes source. The spike tried its update tools on a customised
app:

- `shadcn add calendar --overwrite` replaced the customised `button.tsx` as a
  dependency of the calendar, silently dropping the app's action-token
  styling.
- Without `--overwrite`, it asks per file "already exists, overwrite?". The
  unit is the whole file: keep the customisation and miss the fix, or take
  the fix and lose the customisation.
- `shadcn add calendar --diff` shows the difference to the registry,
  including the app's own changes, mixed with any upstream fix. Applying a fix
  means merging by hand in every app.

The versioned package reached a customised app: an app on the warm theme
from the prompt run, depending on `@sempods-spike/ui-aria` 0.1.0 (without the
outside-press adapter), failed `close-click-cancel`. Changing the dependency
to 0.1.1 changed `package.json` and the lockfile only; `theme.css` stayed as
the owner made it, and the gate checks of that version passed
(`evidence/gate-aria-main-pkg-*.json`, 13 checks: the Back checks came
later). Dependabot does this step today for the SDK. This is evidence for
the mechanism, not a finished distributable:

- A real package ships built JavaScript; the spike's TSX source package
  needed a Vite `optimizeDeps` hint and a Tailwind `@source` line in the app.
- A component an owner copies out of the package to change its behaviour
  becomes a fork that updates no longer reach; that is a deliberate choice,
  not a default.

### Bundle and dependencies

Production builds with SDK main, gzip, split by origin
(`evidence/sizes.json`):

| | Base UI | React Aria |
|---|---|---|
| React | 67.4 KB | 67.4 KB |
| SDK | 50.5 KB | 50.5 KB |
| UI library (primitives, calendar, icons, `cn`, `cva`) | 83.6 KB | 96.7 KB |
| App code | 7.8 KB | 8.3 KB |
| CSS | 8.8 KB | 10.0 KB |
| Production packages for the UI layer | 16 | 16 |

The UI layer adds about two thirds to the JavaScript of an app. shadcn's
init also makes the `shadcn` CLI a runtime dependency (for its
`shadcn/tailwind.css`), which pulls 199 more packages into production
dependencies; it belongs in `devDependencies`. The default Geist font adds
up to 76 KB of WOFF2 files; the template's `system-ui` would avoid it (the
notes app uses it).

### Notes app from a short owner brief

The ordinary case, React Aria only. The starter
([apps/notes](https://github.com/sempods/sempods-apps-template/tree/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/apps/notes)) had the frame (sign-in, "Pods
& sharing", a placeholder screen), the package as a dependency, the theme
contract, `NOTES.md` with the data agreed and inspected beforehand
(`schema:NoteDigitalDocument` with `schema:name` and `schema:text`; contexts
`personal`, an empty `work`, a read-only `shared`) and
[AUTHORING.md](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/apps/notes/AUTHORING.md), the template's
"Build the screen" instructions rewritten for the package. The template's
`ListScreen` reference and its `routes.ts` were not carried over.

A fresh assistant (Claude Opus 5.5, the session default) got this brief and
nothing else about the implementation:

> I'd like a simple notes app. I want to jot down short notes with a title
> and some text, see them in a list, open one to change it, and delete the
> ones I don't need any more. It should feel calm and be easy to use on my
> phone.

| | |
|---|---|
| Elapsed | 5.2 minutes, 32 tool calls, no intervention, no rework |
| Result | `src/App.tsx`, `src/notes.ts`, `src/texts.ts` (EN/DE), `NOTES.md` (change in `evidence/notes-run/change.diff`); `tsc` and `pnpm build` pass |
| Its own decisions | Title required, text optional; list sorted by title (no date in the vocabulary); the new-note draft survives closing its dialog ("Continue new note"); read-only contexts show notes as text without add or delete |
| Reported obstacles | No app-side routing guidance; the SDK's buttons cannot follow the theme's variants; the bundle warning above 500 kB |

Rendered check ([notes-check.mjs](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/scripts/notes-check.mjs),
`evidence/notes.json`), Chromium, SDK main, against the stored data:

- Passed: list in title order; create (stored as `schema:NoteDigitalDocument`
  with name and text); edit and Save; edit and Cancel (nothing written);
  Close with unsaved text asks and keeps it; delete from the row after the
  SDK's question.
- Passed at 375 px and 1280 px, light and dark, with no contrast failure
  (placeholders included): list, open note, new note, empty context,
  read-only context (no add, no editor), loading, read error with "Try
  again", and recovery once the Pod answers again.

Defects and observations:

- **Back loses an unsaved note silently.** Without routes, the browser's Back
  leaves the document; the app reloads, restores the session and the list,
  and the typed text is gone without a question. The template's `routes.ts`
  would have guarded this, but neither it nor any routing guidance was in the
  starter, and the assistant correctly declined to depend on the spike
  harness. Routing belongs to the app baseline (#114).
- "New note" stays offered while the list is loading or failed.
- On desktop the sticky "New note" button sits at the bottom of a mostly
  empty page.

This is agent authoring evidence on a fake Pod. It is not human usability
evidence.

## Screenshots

375 px and 1280 px, light and dark:

- [Base UI, default contract](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/evidence/sheets/base.jpg)
  and [React Aria, default contract](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/evidence/sheets/aria.jpg):
  Zen view, open menu, task dialog, date chooser, SDK question.
- [Notes app](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/evidence/sheets/notes.jpg): list, note,
  new note, empty, read-only, loading, error.
- Prompt runs: [Base invert](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/evidence/sheets/prompt-base-invert.jpg),
  [Base outline](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/evidence/sheets/prompt-base-outline.jpg),
  [Base warm](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/evidence/sheets/prompt-base-warm.jpg),
  [Aria invert](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/evidence/sheets/prompt-aria-invert.jpg),
  [Aria outline](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/evidence/sheets/prompt-aria-outline.jpg),
  [Aria warm](https://github.com/sempods/sempods-apps-template/blob/6e1b2015504207791536a5796711025255ab0a80/spikes/120-ui/evidence/sheets/prompt-aria-warm.jpg).
  The prompt copies were taken before the calendar size correction.

## Rejected alternatives

- **Radix (shadcn radix-nova)**: fails the gate; its modal blocks the SDK
  confirmations.
- **Base UI (shadcn base-nova)**: passes the gate on SDK main in Chromium and
  WebKit. Not recommended because of the date model and the document-level
  Escape handling; a viable alternative with a shared date adapter.
- **Mantine**: desk comparison only; replaces the token contract with its
  own theme system and shares Radix's capture-phase Escape.
- **Plain React Aria with our own CSS**: keeps the whole styling burden.
- **shadcn source copied into every app**: does not let fixes reach
  customised apps; kept only as the way an owner deliberately ejects a
  component.

## Status

### Verified (fixture and browser evidence)

- The interop gate: Base UI and React Aria pass all fifteen checks on SDK
  main in Chromium and WebKit 27.2; Radix fails
  (`evidence/gate-*.json`).
- Keyboard menu with submenu, calendar selection in three time zones and
  German, both candidates (`evidence/interaction.json`).
- 44px calendar targets at 375 × 812 and 375 × 560, React Aria
  (`evidence/interaction.json`).
- Calendar-date persistence with the SDK's `date` field, React Aria, three
  time zones, including cancelling and an unchanged zoned `xsd:dateTime`
  (`evidence/roundtrip.json`).
- Contrast of the measured states and the checker's controls (above).
- Theme-edit prompts through the contract, rendered and measured.
- A version bump of the package delivering a fix to a customised app.
- A notes app from a short brief, with its flows and states checked against
  the stored data.

### Remaining spike work

- Firefox: the gate did not run (launch failure on the test machine).
- Base UI's calendar at 28px and its persistence roundtrip: not repeated,
  since React Aria is recommended.
- Human usability evidence: a non-technical participant identifying the
  primary action and completing, editing and cancelling a task. Open until
  the owner provides it; agent walkthroughs do not replace it.

### Adoption prerequisites

- The SDK release with sempods/sempods-typescript#186 (Escape) and #190
  (calendar-date field).
- The four SDK styling follow-ups below; until then the app's action
  variants do not reach the SDK's Save, Cancel and confirmation buttons.
- The package as a real distributable: built JavaScript, the Tailwind
  integration, its home and release process, and the owner upgrade path
  through Dependabot. The tarball experiment shows the mechanism only.
- Routing in the app baseline (#114): every app needs guarded routes, or
  Back loses unsaved work, as the notes app showed. The
  [routing spike](114-routing.md) recommends declared resource patterns
  with generated rewrites, allowlist and `returnTo`, and the template's own
  router.
- Starter and instructions: a `ListScreen` reference and `routes.ts` on the
  package, the theme contract in the owner instructions, and the rendered
  contrast check in the theme workflow.

## Adoption map

| Issue | With the recommendation |
|---|---|
| #116 Menu: submenus with checked choices and keyboard return | Absorbed by the package's header menu (React Aria `SubmenuTrigger`, single selection). |
| #117 Responsive routed screen | Absorbed: React Aria modal with the SDK adapter, full screen on phones, roomy on desktop; the Escape and Close semantics need the SDK release with #186. Back and Forward with a dirty draft work through the SDK's `navigate` when the app routes through it. |
| #118 Calendar-date chooser composed with SDK editors | Absorbed: React Aria calendar on `CalendarDate` with the SDK's `date` field; presets, typed entry and the display of stored date-times stay app or reference-screen composition. |
| #119 Filled action styles, bounded responsive action group | Styles absorbed by the variant contract (`data-actions`, `data-secondary`); the responsive action group stays a reference layout. |
| #115 Mobile dialogs inside the viewport with a scrollbar | Likely absorbed (the full-screen sheet held at 375 px); the scrollbar case was not tested. |
| #111 Chips, collection and log reference screens | Partly: chips can come from the package (React Aria `TagGroup`); the reference screens, copy and layouts remain. The notes app shows the list-and-editor case works from a short brief on the package. |
| #114 Routes with guarded history | Prerequisite: the notes app lost an unsaved note on Back without routes. The library dialog follows the route either way; see the [routing spike](114-routing.md). |
| sempods/sempods-typescript#107 Reference app for look and feel | Unaffected; it should use the package once it exists. |

SDK follow-ups (bounded, styling only, for `@sempods/app-sdk`):

1. Put the SDK's styles in a cascade layer (for example `@layer sempods`), so
   hosts using Tailwind 4 or other layered CSS can order them.
2. A field-boundary token separate from `--sempods-line`, so field borders
   reach 3:1 while separators stay quiet.
3. Separate tokens for the primary button, secondary action text and focus
   outline, or action variants, so the app's variants reach SDK buttons.
4. `margin: auto` on the SDK's own modal dialogs, so a CSS reset cannot move
   them.

Focus in haed/sempods-apps adopts the package after the template release and
drops its own `Menu.tsx`, `Dialog.tsx` and `Calendar.tsx`.
