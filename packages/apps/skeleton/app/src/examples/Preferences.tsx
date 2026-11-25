// An example, not mounted: appearance (system, light, dark) and UI language
// (browser, German, English) chosen on this device, for an app whose owner
// wants them in its menu. To use it:
// 1. Copy it next to App.tsx and change its imports of '../…' to './…'.
// 2. Add this line to src/index.css after the UI kit's import, so Tailwind's
//    `dark:` classes follow the choice instead of the system:
//    @custom-variant dark (&:where([data-appearance=dark], [data-appearance=dark] *));
// 3. In App.tsx, call `const preferences = usePreferences()` in App and pass
//    its `language` and `locale` to SempodsProvider and I18nProvider instead
//    of the module's uiLocale(…), and drop the module's line that sets
//    <html lang>. Pass `preferences` to Frame, call
//    `const entries = usePreferenceEntries(preferences)` at its top, next to
//    its other hooks, and put `...entries, null,` first in the HeaderMenu's
//    items.
// For a Settings dialog, also before sign-in, see PreferencesDialog.tsx.
// The runtime and the provider stay mounted: a change of language keeps
// drafts and open edits. Test it with the system in the opposite mode, after
// a reload, with an unsaved edit open while the language changes, and with a
// second tab of the app open: it follows the choice at once.
import { useEffect, useLayoutEffect, useState } from 'react';
import type { Language } from '@sempods/app-sdk';
import { useMessages } from '@sempods/app-sdk/react';
import type { HeaderMenuEntry } from '@sempods/app-ui';
import { syncBrowserTheme } from '@sempods/apps/browser-theme';
import { app } from '../sempods.generated.ts';
import { chosenLocale, uiLocale } from '../texts.ts';

export type Appearance = 'system' | 'light' | 'dark';
export type LanguageChoice = 'browser' | Language;
export interface Preferences {
  readonly appearance: Appearance;
  readonly language: LanguageChoice;
  /**
   * An app's own preference, offered by PreferencesDialog.tsx. Add another
   * the same way: a field here, its check in read(), its effect below and a
   * control in the settings.
   */
  readonly largeText: boolean;
}

// Stored per app: every app of the repository shares the site's origin.
const KEY = `${app.id}:preferences`;
const SYSTEM_DARK = '(prefers-color-scheme: dark)';

function read(): Preferences {
  // Until the person chooses, the language the app was created with: the
  // browser's for "auto", else the fixed one.
  const configured: string = app.language;
  const language: LanguageChoice =
    configured === 'de' || configured === 'en' ? configured : 'browser';
  const fallback: Preferences = {
    appearance: 'system',
    language,
    largeText: false,
  };
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!stored || typeof stored !== 'object') return fallback;
    const { appearance, language, largeText } = stored as Record<
      string,
      unknown
    >;
    return {
      appearance: ['system', 'light', 'dark'].includes(appearance as string)
        ? (appearance as Appearance)
        : 'system',
      language: ['browser', 'de', 'en'].includes(language as string)
        ? (language as LanguageChoice)
        : fallback.language,
      largeText: largeText === true,
    };
  } catch {
    // Private mode or blocked storage: the defaults, every time.
    return fallback;
  }
}

/**
 * Shows the page light or dark: `color-scheme` switches every `light-dark()`
 * palette role, the SDK's surfaces through the kit's bridge and portals such
 * as menus; `data-appearance` drives Tailwind's `dark:` classes; the browser's
 * bar (`theme-color`) takes the app's background.
 */
function apply(appearance: Appearance) {
  const root = document.documentElement;
  const dark =
    appearance === 'dark' ||
    (appearance === 'system' && matchMedia(SYSTEM_DARK).matches);
  root.dataset.appearance = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  syncBrowserTheme();
}

/**
 * Larger text: a factor on the app's own root size, which src/index.css
 * multiplies by `--text-scale` (PreferencesDialog.tsx says how), so an app
 * already made larger grows from its size.
 */
function enlarge(largeText: boolean) {
  const root = document.documentElement.style;
  if (largeText) root.setProperty('--text-scale', '1.125');
  else root.removeProperty('--text-scale');
}

// Before the first render, so a reload shows no flash of the other mode;
// not when a test imports this module without a page.
if (typeof document === 'object') {
  const initial = read();
  apply(initial.appearance);
  enlarge(initial.largeText);
}

/** The device's choices, their effect on the page and the resolved locale. */
export function usePreferences() {
  const [preferences, setPreferences] = useState(read);
  const { appearance, largeText } = preferences;
  // Layout effects: a change shows in the frame it is made in.
  useLayoutEffect(() => {
    apply(appearance);
    if (appearance !== 'system') return;
    // "System" follows a change of the system's mode while the app is open.
    const system = matchMedia(SYSTEM_DARK);
    const follow = () => apply('system');
    system.addEventListener('change', follow);
    return () => system.removeEventListener('change', follow);
  }, [appearance]);
  useLayoutEffect(() => enlarge(largeText), [largeText]);
  // A chosen language keeps the browser's region for dates and numbers when
  // it matches (de-AT stays de-AT), else that language's default.
  const { locale, language } =
    preferences.language === 'browser'
      ? // The browser's language, also in an app created with a fixed one.
        uiLocale('auto', navigator.languages)
      : chosenLocale(preferences.language, navigator.languages);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    // Another tab of this app changed the choice, or cleared the storage
    // (`key` null): take what is stored now, without a new runtime.
    const follow = (event: StorageEvent) => {
      if (event.key !== KEY && event.key !== null) return;
      setPreferences((current) => {
        const stored = read();
        return stored.appearance === current.appearance &&
          stored.language === current.language &&
          stored.largeText === current.largeText
          ? current
          : stored;
      });
    };
    addEventListener('storage', follow);
    return () => removeEventListener('storage', follow);
  }, []);
  const change = (next: Partial<Preferences>) =>
    setPreferences((current) => {
      const updated = { ...current, ...next };
      try {
        localStorage.setItem(KEY, JSON.stringify(updated));
      } catch {
        // Not stored: the choice holds until the page is closed.
      }
      return updated;
    });
  return { preferences, change, locale, language };
}

export const preferenceTexts = {
  en: {
    appearance: 'Appearance',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    browser: 'Browser',
    // For PreferencesDialog.tsx.
    settings: 'Settings',
    largeText: 'Larger text',
  },
  de: {
    appearance: 'Darstellung',
    system: 'System',
    light: 'Hell',
    dark: 'Dunkel',
    language: 'Sprache',
    browser: 'Browser',
    settings: 'Einstellungen',
    largeText: 'Größere Schrift',
  },
};

/**
 * Two sections for the header's menu: appearance and language, each with
 * its current choice checked. Language names are written in their own
 * language, so a person finds theirs in either one, and `lang` marks them,
 * so a screen reader reads "Deutsch" as German in an English menu.
 */
export function usePreferenceEntries({
  preferences,
  change,
}: Pick<ReturnType<typeof usePreferences>, 'preferences' | 'change'>) {
  const t = useMessages(preferenceTexts);
  const entries: readonly HeaderMenuEntry[] = [
    {
      label: t.appearance,
      display: 'section',
      choices: (['system', 'light', 'dark'] as const).map((appearance) => ({
        id: appearance,
        label: t[appearance],
        checked: preferences.appearance === appearance,
        onSelect: () => change({ appearance }),
      })),
    },
    {
      label: t.language,
      display: 'section',
      choices: (
        [
          ['browser', t.browser, undefined],
          ['de', 'Deutsch', 'de'],
          ['en', 'English', 'en'],
        ] as const
      ).map(([language, label, lang]) => ({
        id: language,
        label,
        lang,
        checked: preferences.language === language,
        onSelect: () => change({ language }),
      })),
    },
  ];
  return entries;
}
