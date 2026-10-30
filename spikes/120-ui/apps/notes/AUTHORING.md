# Building this app

The template's "Build the screen" instructions, as they would read with the
UI package proposed in #120. Everything else in the app workflow (design
conversation, data agreement, vocabulary) is unchanged and already recorded
in `NOTES.md`.

## Layout

Keep the frame in `src/App.tsx`: `AppAccess` beside `TargetScreen`, the
SDK's components, and a header with the app's name, its icon actions and a
menu whose "Pods & sharing" opens `AppAccess` as a dialog. The SDK owns
connection, editing and recovery behaviour; use it rather than rebuilding
those facilities. Keep the runtime and provider in `App.tsx`; take behaviour
from the SDK's quickstart and examples
(`node_modules/@sempods/app-sdk/docs/`, `README.md`), never their runtime,
provider or styles.

Most apps show a list: loading and failed reads (`LoadNotice`), an empty
state, rows whose name opens a `ResourceEditor` in a dialog, `RemoveButton`,
open outcomes (`UpdateNotice`, `UnresolvedNotices`) and a way to add items,
which a list the person can only read does not show.

## UI components

Build the screen from the UI package `@sempods-spike/ui-aria` instead of
writing your own interaction code or adding another library. It is a
versioned dependency: do not copy its files into the app.

- `kit` (`import { kit } from '@sempods-spike/ui-aria'`): the sempods
  adapters. `kit.ScreenDialog` (a routed dialog, full screen on phones, that
  works with SDK editors and their confirmations; it closes only when `open`
  turns false), `kit.HeaderMenu` (a menu with submenus of checked choices),
  `kit.DateField` (a calendar day as `YYYY-MM-DD`), `kit.Button` with
  `variant` `primary`, `secondary` or `ghost` and `shape` `pill`, `round` or
  `round-lg`, and `kit.Icon`.
- `@sempods-spike/ui-aria/ui/<name>`: the shadcn/ui components on React Aria
  it is built from: `button`, `dialog`, `dropdown-menu`, `popover`,
  `calendar`, `input`, `textarea`, `select`, `input-group`. Their props are
  React Aria's (`onPress`, `isDisabled`, `isOpen`, `onOpenChange`).
- Icons come from `lucide-react`.

Style the app's own markup with Tailwind classes and the theme's colour roles
(`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-card`,
`border-border`, `bg-primary text-primary-foreground` and so on). Leave SDK
components (`[data-sempods-ui]`) to the SDK.

## Theme

The colours are roles in `src/theme.css`, in light and dark mode. Restyle by
changing the roles there, or switch a component variant on `<html>` in
`index.html`: `data-actions="solid|inverted"` for the primary action and
`data-secondary="tonal|outline|text"` for secondary actions. Never use
one-off colours in components; keep text at 4.5:1 and control boundaries at
3:1 against their background.

## Rules

- Touch targets are at least 44 × 44px; wrap each checkbox in its `<label>`.
- Keep every text of the app in `src/texts.ts`, in English and German, and
  read it with `useMessages(texts)`; reuse the SDK's own texts where they fit
  (`useSdkLocale().messages.controls`). Format dates and numbers with
  `useSdkLocale().format`.
- Delete with the SDK's `RemoveButton` or the `ResourceEditor`'s Delete,
  which ask by themselves. Do not use `confirm()`, `alert()` or `prompt()`.
- `pnpm exec tsc -b` in this folder checks the types; `pnpm build` builds.
  Update `NOTES.md` when you are done.
