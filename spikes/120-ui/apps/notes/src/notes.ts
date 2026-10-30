import { fields, text, type DraftOf } from '@sempods/client-sdk/edit';

const schema = 'https://schema.org/';

/**
 * A note as agreed in NOTES.md: a schema:NoteDigitalDocument with a title
 * (schema:name) and its text (schema:text), both plain strings without a
 * language. Other values on a note are kept when it is edited.
 *
 * The title is required, so an empty note cannot be saved. The text is
 * optional: a note may be only a title, and an existing note without text
 * still shows in the list.
 */
export const noteFields = fields(
  {
    title: text(schema + 'name', { language: null, trim: true }),
    body: text(schema + 'text', { language: null, trim: true, optional: true }),
  },
  { type: schema + 'NoteDigitalDocument' },
);

export type Note = DraftOf<typeof noteFields>;

export const emptyNote: Note = { title: '', body: null };

/** The text field holds `null` for "no text", so clearing it removes the value. */
export const bodyValue = (typed: string): string | null => (typed.trim() === '' ? null : typed);
