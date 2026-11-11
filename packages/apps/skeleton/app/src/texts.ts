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

/**
 * A language the person chose, with the browser's region when the browser
 * names that language: English on an en-GB browser formats dates as in
 * Britain, German on de-AT as in Austria; otherwise the language's default.
 */
export function chosenLocale(
  language: Language,
  browser: readonly string[],
): { readonly locale: string; readonly language: Language } {
  const regional = browser.find((tag) => {
    try {
      return new Intl.Locale(tag).language === language;
    } catch {
      // Not a valid language tag: skip it.
      return false;
    }
  });
  return { locale: regional ?? language, language };
}

// The app's own texts in English and German, read in components with the
// SDK's useMessages(texts); SDK components bring their own, and SDK texts are
// reused where they fit (useSdkLocale().messages.controls). Both languages
// have every key, so TypeScript reports a missing translation. Add the app's
// texts here, never inline in components.
const en = {
  start: 'Connected. Tell your assistant what this app should do.',
  newVersion:
    'A new version is ready. It is used once every window of this app has been closed.',
  menu: 'Menu',
  notFound: 'Not found',
  notFoundText: 'This address does not lead anywhere in this app.',
  invalidLink: 'This link is not valid.',
  toStart: 'To the start page',
};

export const texts: { readonly en: typeof en; readonly de: typeof en } = {
  en,
  de: {
    start: 'Verbunden. Beschreibe deinem Assistenten, was diese App tun soll.',
    newVersion:
      'Eine neue Version ist bereit. Sie wird verwendet, sobald alle Fenster dieser App geschlossen sind.',
    menu: 'Menü',
    notFound: 'Nicht gefunden',
    notFoundText: 'Diese Adresse führt nirgendwohin in dieser App.',
    invalidLink: 'Dieser Link ist ungültig.',
    toStart: 'Zur Startseite',
  },
};
