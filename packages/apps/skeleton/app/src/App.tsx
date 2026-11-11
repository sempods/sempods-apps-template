import { useRef, useState } from 'react';
import { createBrowserRuntime } from '@sempods/app-sdk';
import {
  AccessNotice,
  AppAccess,
  SempodsProvider,
  TargetScreen,
  useAppState,
  useMessages,
  useSdkLocale,
} from '@sempods/app-sdk/react';
import {
  ActionButton,
  HeaderMenu,
  I18nProvider,
  ScreenDialog,
  replaceUrl,
  useNav,
} from '@sempods/app-ui';
import { NewVersionNotice } from './NewVersionNotice.tsx';
import { inApp, places } from './places.ts';
import { app, runtimeOptions } from './sempods.generated.ts';
import { texts, uiLocale } from './texts.ts';

// One runtime for the app's lifetime, created outside rendering. Its return
// after a sign-in goes through the router, which then shows that address,
// always one in the app.
const runtime = createBrowserRuntime({
  ...runtimeOptions,
  replaceUrl: (url) => replaceUrl(inApp(url)),
});

// One UI language for the app's texts, the SDK components, the UI kit's
// controls and the page.
const { locale, language } = uiLocale(app.language, navigator.languages);
document.documentElement.lang = language;

// Vite hot replacement ends this module's runtime lifetime.
if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose());

// The app icon (public/favicon.svg), decorative next to the app's name.
const icon = <img src={`${app.basePath}favicon.svg`} alt="" className="size-7" />;

export default function App({
  registration,
}: {
  readonly registration: Promise<ServiceWorkerRegistration | undefined>;
}) {
  return (
    <SempodsProvider runtime={runtime} language={language} locale={locale}>
      <I18nProvider locale={locale}>
        <NewVersionNotice registration={registration} />
        <Frame />
      </I18nProvider>
    </SempodsProvider>
  );
}

// The app owns its layout: a header with the app's icon and name, its icon
// actions and a menu. AppAccess shows sign-in as a gate above the content
// while the app cannot work, outcomes as prompts that can be dismissed, and
// management of Pods and sharing as a dialog from the menu. An app that
// switches between contexts (lists) puts src/examples/ContextSwitch.tsx in
// place of the h1.
function Frame() {
  // The shown place of the app's address model (places.ts). Call it once,
  // here, and pass `nav` to the screens that link or switch.
  const nav = useNav(places);
  const [managing, setManaging] = useState(false);
  // The menu's button: closing Pods & sharing returns the focus there.
  const menu = useRef<HTMLButtonElement>(null);
  // `pod` is the active signed-in Pod; a remembered Pod after a sign-out has
  // none. `connections` includes remembered Pods, so the header stays.
  const { connections, pod } = useAppState();
  const { messages } = useSdkLocale();
  const t = useMessages(texts);
  const header = connections.length > 0;
  const { place } = nav;
  const toStart = () => nav.go({ kind: 'start' }, { replace: true });
  return (
    <main className="mx-auto max-w-3xl p-4">
      {header && (
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {icon}
            {app.title}
          </h1>
          <div className="flex items-center gap-2">
            {/* The app's own icon actions go here, as
                <ActionButton variant="ghost" shape="round-sm" label="…">. */}
            <HeaderMenu
              ref={menu}
              label={t.menu}
              items={[
                {
                  label: messages.controls.dataAccess,
                  onSelect: () => setManaging(true),
                },
              ]}
            />
          </div>
        </header>
      )}
      {/* Below the header's h1, AppAccess uses h2. It explains sign-in and
          lost access; AccessNotice adds only that a context is read-only. */}
      <AppAccess
        appName={app.title}
        description={app.description}
        icon={icon}
        headingLevel={header ? 2 : 1}
        open={managing}
        onClose={() => setManaging(false)}
        focusTarget={menu}
      />
      <AccessNotice only="write" />
      <TargetScreen>
        <Start />
      </TargetScreen>
      {/* An explicit page once the person is signed in; a modal before that
          would cover the sign-in, and closing it would lose the link. */}
      {place.kind === 'not-found' && pod && (
        <ScreenDialog
          title={t.notFound}
          open
          onRequestClose={toStart}
        >
          <div className="grid gap-4">
            <p>{place.reason === 'invalid' ? t.invalidLink : t.notFoundText}</p>
            <ActionButton
              shape="pill"
              onPress={toStart}
            >
              {t.toStart}
            </ActionButton>
          </div>
        </ScreenDialog>
      )}
    </main>
  );
}

// Replace this screen with your app. It renders once a Pod context is chosen.
function Start() {
  const t = useMessages(texts);
  return <p className="mt-6">{t.start}</p>;
}
