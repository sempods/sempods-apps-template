# Spike #120: UI primitives and role tokens

[Claude] Result of the spike in sempods/sempods-apps-template#120, run on
2026-10-30. The owner decides; nothing here changes the starter. Evidence,
scripts and the variants are in [spikes/120-ui](../../spikes/120-ui/README.md).

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
  sempods/sempods-typescript#186 (merged on main, not in 0.6.0). On 0.6.0
  every candidate fails the interop gate.

Why React Aria over Base UI, given that both pass the gate on SDK main:

1. **Dates.** React Aria's calendar works on `CalendarDate`, a date without
   time or zone; it matches the day strings the SDK edits (#118,
   sempods/sempods-typescript#190). Base UI ships no calendar; shadcn's
   base-nova calendar is react-day-picker on `Date` objects, so every app
   converts at local noon to avoid midnight shifts, and the registry item had
   a keyboard bug (below).
2. **Event model.** React Aria handles Escape and outside presses through
   React events on its own overlay, so it respects the SDK's propagation
   boundaries. Base UI listens on `document` and ignores `defaultPrevented`;
   on SDK 0.6.0 it leaked Escape from every SDK confirmation, React Aria only
   from one.
3. **Fewer kit corrections**: two for React Aria, three for Base UI, all
   found by the evidence scripts rather than by reading.

The price: about 13 KB gzip more JavaScript than Base UI, and shadcn's aria
track is newer than its base track (shadcn's default preset is now
base-nova), so fewer examples exist that assistants have seen.

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
| React, Vite, browser | React 19.3.1, Vite 8.3.5, Playwright 1.64.1 Chromium |

Every result below names its SDK baseline. "main" results are not
available to apps until the SDK releases them.

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
an unsaved edit is left. Fourteen checks per candidate and SDK baseline, by
keyboard and pointer, each from a fresh page
([gate.mjs](../../spikes/120-ui/scripts/gate.mjs), results in
`evidence/gate-*.json`).

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
| Clean Escape closes and returns focus to the opener | ✓ | ✓ | ✓ | ✓ | ✗ ⁷ |
| Explicit Save after the cancelled closes | ✗ ² | ✓ | ✓ | ✓ | ✓ |
| 1280 → 375 → 1280 px keeps the draft, full screen on the phone | ✓ | ✓ | ✓ | ✓ | ✓ |
| Back closes the routed dialog, Forward reopens it | ✓ | ✓ | ✓ | ✓ | ✓ |
| Back with a dirty draft asks; "Keep editing" keeps dialog, draft and address | ✓ | ✓ | ✓ | ✓ | ✗ ⁴ |
| Back with a dirty draft, then discard: the dialog closes | ✓ | ✓ | ✓ | ✓ | ✗ ⁴ |

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
   ([probe-min.mjs](../../spikes/120-ui/scripts/probe-min.mjs)). Not a
   concern for people, but for automated tests.
7. Focus lands on `body`.

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

## Stage 2: reference screen, contract, contrast, prompts

### Focus Zen screen

The Zen view, the header menu with a View submenu and checked choices, the
routed dialog (full screen below 640 px, up to 42rem wide above) and a
calendar-date chooser inside the editor fields run on both candidates
([screen.tsx](../../spikes/120-ui/harness/src/screen.tsx)). Keyboard-only
checks ([interaction.mjs](../../spikes/120-ui/scripts/interaction.mjs)), in
Europe/Berlin, Pacific/Kiritimati (UTC+14) and Pacific/Pago_Pago (UTC−11):

| Check | Base UI | React Aria |
|---|---|---|
| Menu: Enter opens, ArrowRight opens View, ArrowLeft returns, Escape closes the submenu first, then the menu, focus back on the button; choosing "List" closes and checks it | ✓ after fix a | ✓ |
| Calendar: focus starts on the chosen day; arrows, PageDown, Enter, Apply; the stored day is exactly one day and one month later in all three zones | ✓ after fixes b, c | ✓ |
| German: month names, Monday first, SDK texts | ✓ | ✓ after fix d |

Kit corrections the checks forced:

- a. Base UI keeps a menu open after a radio choice: `closeOnClick` on each
  choice.
- b. Base UI's popover focuses its first button (the month arrow):
  `initialFocus` returns the chosen day.
- c. The base-nova registry calendar (shadcn 4.23.0) lacks `ref={ref}` on its
  day button, so arrow keys never move the focus; the radix-nova item has it
  ([probe-cal.mjs](../../spikes/120-ui/scripts/probe-cal.mjs)). A one-line
  patch in generated code, worth reporting upstream.
- d. React Aria reads the browser's locale unless the calendar sits in an
  `I18nProvider` with the app's locale.

shadcn's default control heights (32 px buttons, 28 px icon buttons) are
below the 44 px touch targets the template uses; the kit sets sizes
explicitly.

### Theme and variant contract

[theme.css](../../spikes/120-ui/harness/src/theme.css) has three parts:

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

Measured on what the browser renders, not on token pairs
([contrast.js](../../spikes/120-ui/scripts/contrast.js)): every visible
text against its composited background (4.5:1, 3:1 when large), icons in
buttons and field boundaries against their adjacent colour (3:1), and the
focus indicator of each control reached by Tab (3:1). Colours are resolved
through a canvas, so `oklch`, `color-mix` and transparency count as painted.
Disabled controls and content covered by a modal are exempt; decorative
borders are not measured.

Six theme and variant combinations × light and dark × five states (Zen, menu
open, dialog, date chooser, SDK question) × two candidates:

With the contract as described, all 120 measured states pass
(`evidence/contract/contrast-*.json`): text at least 4.93:1, icons 6.51:1,
field boundaries 3.05:1, focus indicators 6.51:1. On the way there:

- Field boundaries: SDK editor fields measured 1.13:1 with `--sempods-line`
  on the decorative border role, and 2.89:1 on the editor's tinted card with
  the first `input` value. Both are corrected in the contract (see the
  bridge). The template's current themes have the same problem: `line` at
  1.24:1, although their comments claim 4.5:1 for every pair.
- Focus: shadcn's ring measured 2.3:1 with the teal theme; the contract's
  solid outline replaced it, also on menu items, which otherwise show focus
  only through the `accent` surface (about 1.1:1).

### Theme-edit prompts

Three owner prompts from the issue, each given once to a fresh assistant
(Claude Sonnet) per candidate, in an isolated copy of the app with the theme
moved into the app as in an owner repository. The brief named the app folder
and the owner's words only; no hint about roles or variants. Each result was
rendered and measured afterwards.

| Prompt | Base UI | React Aria |
|---|---|---|
| "Invert the colours of the action buttons." | Made `inverted` the default in `theme.css`, kept `solid` as the switch. | First run reported a change to `index.html` that was not on disk; the rendered check caught it. Second run: same as Base UI. |
| "Make the secondary actions outlined." | Made `outline` the default, kept `tonal` as the switch. | Same. |
| "Switch to a warmer colour palette." | New palette values (cream, terracotta, amber in dark). Text ≥ 5.21:1. | New palette values, destructive moved to crimson to stay distinct. Text ≥ 4.88:1. |

All results changed one file, used the contract instead of editing component
colours, and rendered without a contrast failure in light and dark across the
five states (`evidence/prompt-*/contrast-*.json`; each run's change is in
`change.diff` next to it). Every "invert" run
read "action buttons" as the primary action only and said so. The prompts
show no difference between the candidates: the contract decided the outcome,
not the primitives. Whether assistants build better UI with libraries they
know therefore stays open; these prompts did not test it.

## Stage 3: update path, costs, notes app

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
the owner made it, and all gate checks passed
(`evidence/gate-aria-main-pkg-*.json`). Dependabot does this step today for
the SDK. Remaining work and forks:

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
| App code | 7.6 KB | 8.1 KB |
| CSS | 8.8 KB | 10.0 KB |
| Production packages for the UI layer | 16 | 16 |

The UI layer adds about two thirds to the JavaScript of an app. shadcn's
init also makes the `shadcn` CLI a runtime dependency (for its
`shadcn/tailwind.css`), which pulls 199 more packages into production
dependencies; it belongs in `devDependencies`. The default Geist font adds
up to 76 KB of WOFF2 files; the template's `system-ui` would avoid it.

### Notes app and human evidence

Not done in this spike: a simple notes or collection app from a short owner
prompt (#111) and a non-technical participant identifying the primary action
and completing, editing and cancelling a task. Human usability evidence
stays open until the owner provides it; agent walkthroughs do not replace
it.

## Screenshots

375 px and 1280 px, light and dark, for the Zen view, the open menu, the
task dialog, the date chooser and the SDK question.

- [Base UI, default contract](../../spikes/120-ui/evidence/sheets/base.jpg)
- [React Aria, default contract](../../spikes/120-ui/evidence/sheets/aria.jpg)
- Prompt runs: [Base invert](../../spikes/120-ui/evidence/sheets/prompt-base-invert.jpg),
  [Base outline](../../spikes/120-ui/evidence/sheets/prompt-base-outline.jpg),
  [Base warm](../../spikes/120-ui/evidence/sheets/prompt-base-warm.jpg),
  [Aria invert](../../spikes/120-ui/evidence/sheets/prompt-aria-invert.jpg),
  [Aria outline](../../spikes/120-ui/evidence/sheets/prompt-aria-outline.jpg),
  [Aria warm](../../spikes/120-ui/evidence/sheets/prompt-aria-warm.jpg)

## Rejected alternatives

- **Radix (shadcn radix-nova)**: fails the gate; its modal blocks the SDK
  confirmations.
- **Base UI (shadcn base-nova)**: passes the gate on SDK main; rejected for
  the date model, the document-level Escape handling and the extra kit
  corrections, not for a blocking defect. The closest second choice.
- **Mantine**: desk comparison only; replaces the token contract with its
  own theme system and shares Radix's capture-phase Escape.
- **Plain React Aria with our own CSS**: keeps the whole styling burden.
- **shadcn source copied into every app**: does not let fixes reach
  customised apps; kept only as the way an owner deliberately ejects a
  component.

## Uncertainties

- Every "main" result depends on an unreleased SDK; the release may differ.
- One browser engine (Chromium) and one run per prompt. Safari and Firefox
  top-layer and focus behaviour were not tested.
- Assistant familiarity: shadcn's aria track is newer than its base track.
- A real package needs a build, a Tailwind integration and a release process
  in this repository; the spike only packed tarballs.
- No human participant.

## Adoption map

| Issue | With the recommendation |
|---|---|
| #116 Menu: submenus with checked choices and keyboard return | Absorbed by the package's header menu (React Aria `SubmenuTrigger`, single selection). |
| #117 Responsive routed screen | Absorbed: React Aria modal with the SDK adapter, full screen on phones, roomy on desktop; the Escape and Close semantics need the SDK release with #186. Back and Forward with a dirty draft already work through the SDK's `navigate`. |
| #118 Calendar-date chooser composed with SDK editors | Absorbed: React Aria calendar on `CalendarDate`; presets and typed entry stay app or reference-screen composition. |
| #119 Filled action styles, bounded responsive action group | Styles absorbed by the variant contract (`data-actions`, `data-secondary`); the responsive action group stays a reference layout. |
| #115 Mobile dialogs inside the viewport with a scrollbar | Likely absorbed (the full-screen sheet held at 375 px); the scrollbar case was not tested. |
| #111 Chips, collection and log reference screens | Partly: chips can come from the package (React Aria `TagGroup`); the reference screens, copy and layouts remain. Not exercised here. |
| #114 Routes with guarded history | Unaffected: the library dialog follows the route, and the template's routing pattern with the SDK's `navigate` guarded Back and Forward in the gate. The route contract across generator, host, PWA and `returnTo` stays #114's work. |
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

Starter and instructions: the owner instructions name the theme contract
(roles in `theme.css`, `data-actions` and `data-secondary` for variants),
the theme check runs the rendered contrast measurement, and the reference
screens use the package. Focus in haed/sempods-apps adopts the package after
the template release and drops its own `Menu.tsx`, `Dialog.tsx` and
`Calendar.tsx`.
