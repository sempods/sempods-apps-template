# Notes: development notes

Your assistant keeps these notes up to date so the next session can continue.

## Idea

A simple, calm notes app for the phone: jot down short notes with a title and
some text, see them in a list, open one to change it, and delete the ones no
longer needed.

## Design

Theme: calm (the default). Font: the system font.

## Data

One person's own notes. The app reads and writes the context the person
chooses in "Pods & sharing"; new notes go there. Deleting a note removes it
for every app that uses the same records.

Inspected with the owner: Pod `…/alice`. Context `personal` holds the
owner's notes; `work` is empty; `shared` is readable only (a friend shared
it).

## Vocabulary

Existing data (observed in `personal` and `shared`): each note is a
`https://schema.org/NoteDigitalDocument` with `https://schema.org/name` (the
title, a plain string without language) and `https://schema.org/text` (the
note, a plain string without language). Keep unknown fields when editing.

Mapping in `src/notes.ts`: `title` → `schema:name` (required, trimmed),
`body` → `schema:text` (optional, trimmed; clearing the text removes the
value). New notes are created in the collection `notes` of the chosen
context. A note without a title cannot be shown or saved; the list counts
such entries in its notice instead of hiding them silently.

## Decisions

- One screen: the notes as a list sorted by title (no date in the agreed
  vocabulary, so no "newest first"). Each row shows the title and the first
  two lines of the text; tapping opens the note in a full-screen dialog on
  phones. A trash button per row deletes after the SDK's question.
- Editing uses the SDK's `ResourceEditor` (Save, Cancel, Delete) inside
  `kit.ScreenDialog`; a confirmed save or delete closes the dialog.
- New notes: a "New note" button at the bottom of the screen (thumb reach)
  opens a dialog with title and text. Closing it keeps the unsent draft; the
  button then reads "Continue new note".
- Read-only contexts (`shared`): no add button, no delete, and a note opens as
  plain text instead of an editor. Detected with `useWorkflowAccess().write`.
- App name is translated (Notes / Notizen) in the header and on sign-in; the
  runtime identity name stays "Notes".
- Dialogs are not tied to the browser history: the phone's back button does
  not close an open note (see open questions).

## Open questions

- Should the back button close an open note? That needs routing, which the
  app does not have yet.
- Should notes get a creation/modified date (for example `schema:dateCreated`)
  so the list can show newest first? That changes the agreed vocabulary.

## Tested

- `pnpm exec tsc -b` and `pnpm build` pass.
- Not yet tried in a browser or against the Pod: sign-in, adding, editing,
  deleting, the read-only `shared` context and the phone layout still need a
  check with the owner.
