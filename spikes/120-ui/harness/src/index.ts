// Library-independent parts of the spike apps: the task data, texts, a tiny
// history route and date helpers. Each variant composes its own screen.
import { useCallback, useSyncExternalStore } from 'react';
import { createBrowserRuntime } from '@sempods/app-sdk';
import { fields, flag, text, type DraftOf } from '@sempods/client-sdk/edit';

declare const __SDK_BASELINE__: string;
/** The SDK the app was built against: "0.6.0" or "main@<sha>". */
export const sdkBaseline: string = __SDK_BASELINE__;

const schema = 'https://schema.org/';
/** Plain day strings on purpose: SDK 0.6.0 has no calendar-date field. */
export const taskFields = fields(
  {
    title: text(schema + 'name', { language: null, trim: true }),
    description: text(schema + 'description', { language: null, trim: true, optional: true }),
    done: flag(schema + 'actionStatus', {
      on: schema + 'CompletedActionStatus',
      off: schema + 'PotentialActionStatus',
    }),
    planned: text(schema + 'startDate', { language: null, trim: true, optional: true }),
  },
  { type: schema + 'Action' },
);
export type TaskDraft = DraftOf<typeof taskFields>;

export const createRuntime = (name: string) =>
  createBrowserRuntime({
    identity: { kind: 'dynamic', name, redirectUri: location.origin + '/callback' },
    returnTo: '/',
    development: 'loopback-http',
  });

export const texts = {
  en: {
    menu: 'Menu', view: 'View', zen: 'Zen', list: 'List', back: 'Back',
    details: 'Details', close: 'Close', taskMenu: 'Task menu', check: 'Check',
    complete: 'Complete', notToday: 'Not today', previous: 'Previous task', next: 'Next task',
    title: 'Title', description: 'Description', planned: 'Start considering', noPlanning: 'No date',
    chooseDate: 'Choose a date', apply: 'Apply', emptyZen: 'Enjoy your day.',
    position: (n: number, total: number) => `${n} of ${total}`, theme: 'Theme',
  },
  de: {
    menu: 'Menü', view: 'Ansicht', zen: 'Zen', list: 'Liste', back: 'Zurück',
    details: 'Details', close: 'Schließen', taskMenu: 'Aufgabenmenü', check: 'Prüfen',
    complete: 'Erledigen', notToday: 'Nicht heute', previous: 'Vorherige Aufgabe', next: 'Nächste Aufgabe',
    title: 'Titel', description: 'Beschreibung', planned: 'Vormerken ab', noPlanning: 'Kein Datum',
    chooseDate: 'Datum wählen', apply: 'Übernehmen', emptyZen: 'Genieß deinen Tag.',
    position: (n: number, total: number) => `${n} von ${total}`, theme: 'Thema',
  },
};

/** The route lives in the query: ?task=<iri>&view=list. Back/Forward work. */
const subscribe = (notify: () => void) => {
  addEventListener('popstate', notify);
  addEventListener('spike-route', notify);
  return () => {
    removeEventListener('popstate', notify);
    removeEventListener('spike-route', notify);
  };
};
export function useRoute() {
  const search = useSyncExternalStore(subscribe, () => location.search);
  const params = new URLSearchParams(search);
  const go = useCallback((changes: Record<string, string | null>) => {
    const next = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(changes)) if (v === null) next.delete(k); else next.set(k, v);
    history.pushState(null, '', '?' + next.toString());
    dispatchEvent(new Event('spike-route'));
  }, []);
  return { params, go };
}

/** Day strings (YYYY-MM-DD) without instants; local "today". */
export const today = () => new Date().toLocaleDateString('sv-SE');
export const validDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
export function addDays(day: string, n: number) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dayText = (day: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));
