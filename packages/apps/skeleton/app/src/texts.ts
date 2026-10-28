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
};

export const texts: { readonly en: typeof en; readonly de: typeof en } = {
  en,
  de: {
    start: 'Verbunden. Beschreibe deinem Assistenten, was diese App tun soll.',
    newVersion:
      'Eine neue Version ist bereit. Sie wird verwendet, sobald alle Fenster dieser App geschlossen sind.',
    menu: 'Menü',
  },
};
