import { resolveLocale } from '@sempods/app-sdk';

/** The UI language and regional formats: German or English, from the browser. */
export const { locale, language } = resolveLocale(undefined, navigator.languages);

// The app's own texts in English and German, read in components with the
// SDK's useMessages(texts). Both languages have every key.
const en = {
  appName: 'Notes',
  description: 'Short notes, stored in your Pod.',
  menu: 'Menu',
  notes: 'Notes',
  note: 'Note',
  newNote: 'New note',
  continueNote: 'Continue new note',
  title: 'Title',
  body: 'Text',
  titlePlaceholder: 'What is it about?',
  bodyPlaceholder: 'Write your note…',
  close: 'Close',
  empty: 'No notes yet. Your first one is a tap away.',
  emptyReadOnly: 'There are no notes here.',
};
const de: typeof en = {
  appName: 'Notizen',
  description: 'Kurze Notizen, gespeichert in deinem Pod.',
  menu: 'Menü',
  notes: 'Notizen',
  note: 'Notiz',
  newNote: 'Neue Notiz',
  continueNote: 'Neue Notiz fortsetzen',
  title: 'Titel',
  body: 'Text',
  titlePlaceholder: 'Worum geht es?',
  bodyPlaceholder: 'Schreib deine Notiz …',
  close: 'Schließen',
  empty: 'Noch keine Notizen. Die erste ist nur einen Tipp entfernt.',
  emptyReadOnly: 'Hier gibt es keine Notizen.',
};
export const texts = { en, de };
