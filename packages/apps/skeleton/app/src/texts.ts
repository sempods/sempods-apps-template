import { resolveLocale, type Language } from '@sempods/app-sdk';

/**
 * The UI language and the regional formats. With "auto" in apps.json they
 * come from the browser: German or English, otherwise English, with the
 * browser's region for dates and numbers. A fixed language keeps its own.
 */
export function uiLocale(
  configured: string,
  browser: readonly string[],
): { readonly locale: string; readonly language: Language } {
  return resolveLocale(configured === 'auto' ? undefined : configured, browser);
}

// The app's own texts, one catalogue per UI language; SDK components bring
// their own. Every catalogue has every key, so TypeScript reports a missing
// translation. Add the app's texts here, never inline in components.
const en = {
  start: 'Connected. Tell your assistant what this app should do.',
  newVersion:
    'A new version is ready. It is used once every window of this app has been closed.',
  menu: 'Menu',
};

export type Texts = typeof en;

const de: Texts = {
  start: 'Verbunden. Beschreibe deinem Assistenten, was diese App tun soll.',
  newVersion:
    'Eine neue Version ist bereit. Sie wird verwendet, sobald alle Fenster dieser App geschlossen sind.',
  menu: 'Menü',
};

const catalogues: Readonly<Record<Language, Texts>> = { en, de };

/** The app's texts in `language`; pass `useSdkLocale().language`. */
export function textsFor(language: Language): Texts {
  return catalogues[language];
}
