// An example, not mounted: the choices of Preferences.tsx and one of the
// app's own (larger text) in a Settings dialog, for an app whose owner wants
// more than the menu's two sections or the choices before sign-in. One
// content serves both places: a dialog from the header's menu and, while the
// sign-in screen blocks, AppAccess's settings above it. To use it:
// 1. Copy Preferences.tsx and this file next to App.tsx, change their imports
//    of '../…' to './…' and wire in Preferences.tsx as its first lines say,
//    without its menu entries. So larger text grows from the app's own size,
//    give src/index.css's `@layer base` one root size that takes its factor:
//      html { font-size: calc(100% * var(--text-scale, 1)); }
//    An app made larger with the sizing recipe keeps its percentage there,
//    such as calc(112.5% * var(--text-scale, 1)).
// 2. In Frame, next to its other hooks, importing what they name:
//      const [showSettings, setShowSettings] = useState(false);
//      const label = useMessages(preferenceTexts).settings;
//      const settings = { label, content: <SettingsContent {...preferences} /> };
//    Put `{ label, onSelect: () => setShowSettings(true) }` first in the
//    HeaderMenu's items, pass `settings={settings}` to AppAccess and render
//    `<SettingsDialog settings={settings} isOpen={showSettings}
//    onOpenChange={setShowSettings} />` beside it.
// 3. So the static splash shows a stored choice before the app's script
//    loads, add this to <head> in index.html, before its <style>:
//    <script>
//      try {
//        const { appearance, largeText } =
//          JSON.parse(localStorage.getItem('__APP_ID__:preferences')) ?? {};
//        const root = document.documentElement.style;
//        if (appearance === 'light' || appearance === 'dark')
//          root.colorScheme = appearance;
//        if (largeText === true) root.setProperty('--text-scale', '1.125');
//      } catch {}
//    </script>
// The choices live in App, above the provider, the dialog and the gate: both
// presentations show and change the same state, and the runtime, the
// provider and drafts stay mounted. Each choice applies at once and is
// stored; Close saves nothing. Offer only choices of this device's
// presentation here: the gate grants no session, so no data or account
// settings. Test both entry points with the keyboard (Escape returns the
// focus to the menu's button or the gate's), at 375px light and dark, a
// change of language with an unsaved edit open, and the larger text after a
// reload.
import { CheckIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useMessages } from '@sempods/app-sdk/react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
} from '@sempods/app-ui';
import {
  preferenceTexts,
  type usePreferences,
  type Appearance,
  type LanguageChoice,
} from './Preferences.tsx';

type Host = Pick<ReturnType<typeof usePreferences>, 'preferences' | 'change'>;

// 44px targets that wrap a long label; the kit draws the rest.
const item = 'h-auto min-h-11 min-w-11 px-3 whitespace-normal';

/**
 * A labelled group with exactly one choice, which shows a check mark, so the
 * choice does not rest on colour alone. Arrow keys move inside the group.
 */
function Choices<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  /** Each choice's value, label and, if it differs from the page's, language. */
  readonly choices: readonly (readonly [T, string, string?])[];
  readonly change: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <span id={id} className="font-medium">
        {props.label}
      </span>
      <ToggleGroup
        aria-labelledby={id}
        variant="outline"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[props.value]}
        onSelectionChange={(keys) => {
          const [key] = keys;
          if (key !== undefined) props.change(key as T);
        }}
        className="w-full flex-wrap"
      >
        {props.choices.map(([value, label, lang]) => (
          <ToggleGroupItem key={value} id={value} className={item}>
            {({ isSelected }) => (
              <>
                {isSelected && <CheckIcon aria-hidden="true" />}
                <span lang={lang}>{label}</span>
              </>
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/**
 * The settings: appearance, language and larger text. Language names are
 * written and marked in their own language, so a person finds theirs in
 * either one. Another setting is another child here.
 */
export function SettingsContent({ preferences, change }: Host) {
  const t = useMessages(preferenceTexts);
  return (
    <div className="grid gap-5 text-sm">
      <Choices<Appearance>
        label={t.appearance}
        value={preferences.appearance}
        change={(appearance) => change({ appearance })}
        choices={[
          ['system', t.system],
          ['light', t.light],
          ['dark', t.dark],
        ]}
      />
      <Choices<LanguageChoice>
        label={t.language}
        value={preferences.language}
        change={(language) => change({ language })}
        choices={[
          ['browser', t.browser],
          ['de', 'Deutsch', 'de'],
          ['en', 'English', 'en'],
        ]}
      />
      <Toggle
        variant="outline"
        isSelected={preferences.largeText}
        onChange={(largeText) => change({ largeText })}
        className={`${item} justify-self-start`}
      >
        {({ isSelected }) => (
          <>
            {isSelected && <CheckIcon aria-hidden="true" />}
            {t.largeText}
          </>
        )}
      </Toggle>
    </div>
  );
}

/**
 * The settings in the kit's compact dialog, opened from the header's menu.
 * Its Close, Escape and a press beside it close it; focus returns to the
 * menu's button. It scrolls when longer settings do not fit.
 */
export function SettingsDialog({
  settings,
  isOpen,
  onOpenChange,
}: {
  /** The same `{ label, content }` as AppAccess's `settings`. */
  readonly settings: { readonly label: string; readonly content: ReactNode };
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
    >
      <DialogHeader>
        <DialogTitle>{settings.label}</DialogTitle>
      </DialogHeader>
      {settings.content}
    </Dialog>
  );
}
