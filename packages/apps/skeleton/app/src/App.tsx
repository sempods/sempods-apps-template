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
import { NewVersionNotice } from './NewVersionNotice.tsx';
import { replaceUrl } from './routes.ts';
import { app, runtimeOptions } from './sempods.generated.ts';
import { texts, uiLocale } from './texts.ts';
import { MenuIcon } from './ui/icons.tsx';
import { Menu } from './ui/Menu.tsx';

// One runtime for the app's lifetime, created outside rendering. Its return
// after a sign-in goes through the router, which then shows that route.
const runtime = createBrowserRuntime({ ...runtimeOptions, replaceUrl });

// One UI language for the app's texts, the SDK components and the page.
const { locale, language } = uiLocale(app.language, navigator.languages);
document.documentElement.lang = language;

// Vite hot replacement ends this module's runtime lifetime.
if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose());

// The app icon (public/favicon.svg), decorative next to the app's name.
const icon = <img src={`${app.basePath}favicon.svg`} alt="" />;

export default function App({
  registration,
}: {
  readonly registration: Promise<ServiceWorkerRegistration | undefined>;
}) {
  return (
    <SempodsProvider runtime={runtime} language={language} locale={locale}>
      <NewVersionNotice registration={registration} />
      <Frame />
    </SempodsProvider>
  );
}

// The app owns its layout: a header with the app's icon and name, its icon
// actions and a menu; AppAccess beside the content for sign-in and recovery,
// and as a dialog for managing Pods and sharing from the menu. An app that
// switches between contexts (lists) puts ui/ContextSwitch in place of the
// name.
function Frame() {
  const [managing, setManaging] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { connections } = useAppState();
  const { messages } = useSdkLocale();
  const t = useMessages(texts);
  const header = connections.length > 0;
  return (
    <main>
      {header && (
        <header>
          <h1>
            {icon}
            {app.title}
          </h1>
          <div className="header-actions">
            {/* The app's own icon actions go here. */}
            <Menu
              label={t.menu}
              trigger={<MenuIcon />}
              button={menuButton}
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
        focusTarget={menuButton}
      />
      <AccessNotice only="write" />
      <TargetScreen>
        <Start />
      </TargetScreen>
    </main>
  );
}

// Replace this screen with your app. It renders once a Pod context is chosen.
function Start() {
  const t = useMessages(texts);
  return <p>{t.start}</p>;
}
