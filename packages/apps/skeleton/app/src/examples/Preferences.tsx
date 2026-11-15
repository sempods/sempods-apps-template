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
// The runtime and the provider stay mounted: a change of language keeps
// drafts and open edits. Test it with the system in the opposite mode, after
// a reload, and with an unsaved edit open while the language changes.
import { useEffect, useState } from 'react';
import type { Language } from '@sempods/app-sdk';
import { useMessages } from '@sempods/app-sdk/react';
import type { HeaderMenuEntry } from '@sempods/app-ui';
import { syncBrowserTheme } from '../browser-theme.ts';
import { app } from '../sempods.generated.ts';
import { chosenLocale, uiLocale } from '../texts.ts';

export type Appearance = 'system' | 'light' | 'dark';
export type LanguageChoice = 'browser' | Language;
export interface Preferences {
  readonly appearance: Appearance;
  readonly language: LanguageChoice;
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
  const fallback: Preferences = { appearance: 'system', language };
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!stored || typeof stored !== 'object') return fallback;
    const { appearance, language } = stored as Record<string, unknown>;
    return {
      appearance: ['system', 'light', 'dark'].includes(appearance as string)
        ? (appearance as Appearance)
        : 'system',
      language: ['browser', 'de', 'en'].includes(language as string)
        ? (language as LanguageChoice)
        : fallback.language,
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

// Before the first render, so a reload shows no flash of the other mode.
apply(read().appearance);

/** The device's choices, their effect on the page and the resolved locale. */
export function usePreferences() {
  const [preferences, setPreferences] = useState(read);
  const { appearance } = preferences;
  useEffect(() => {
    apply(appearance);
    if (appearance !== 'system') return;
    // "System" follows a change of the system's mode while the app is open.
    const system = matchMedia(SYSTEM_DARK);
    const follow = () => apply('system');
    system.addEventListener('change', follow);
    return () => system.removeEventListener('change', follow);
  }, [appearance]);
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

const texts = {
  en: {
    appearance: 'Appearance',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    browser: 'Browser',
  },
  de: {
    appearance: 'Darstellung',
    system: 'System',
    light: 'Hell',
    dark: 'Dunkel',
    language: 'Sprache',
    browser: 'Browser',
  },
};

/**
 * Two sections for the header's menu: appearance and language, each with
 * its current choice checked. Language names are written in their own
 * language, so a person finds theirs in either one.
 */
export function usePreferenceEntries({
  preferences,
  change,
}: Pick<ReturnType<typeof usePreferences>, 'preferences' | 'change'>) {
  const t = useMessages(texts);
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
          ['browser', t.browser],
          ['de', 'Deutsch'],
          ['en', 'English'],
        ] as const
      ).map(([language, label]) => ({
        id: language,
        label,
        checked: preferences.language === language,
        onSelect: () => change({ language }),
      })),
    },
  ];
  return entries;
}
