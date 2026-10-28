import { useRef, useState } from 'react';
import { createBrowserRuntime } from '@sempods/app-sdk';
import {
  AccessNotice,
  AppAccess,
  SempodsProvider,
  TargetScreen,
  useApp,
  useAppState,
  useSdkLocale,
  useWorkflowAccess,
} from '@sempods/app-sdk/react';
import { NewVersionNotice } from './NewVersionNotice.tsx';
import { replaceUrl } from './routes.ts';
import { app, runtimeOptions } from './sempods.generated.ts';
import { textsFor, uiLocale } from './texts.ts';
import { ContextSwitch } from './ui/ContextSwitch.tsx';
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

// The app owns its layout: a header with the app or the context switch, the
// app's icon actions and a menu; AppAccess beside the content for sign-in and
// recovery, and as a dialog for managing Pods and sharing from the menu.
function Frame() {
  const [managing, setManaging] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { connections } = useAppState();
  const { connection } = useWorkflowAccess();
  const { disconnect } = useApp();
  const t = textsFor(useSdkLocale().language);
  const header = connections.length > 0;
  return (
    <main>
      {header && (
        <header>
          <h1 className="visually-hidden">{app.title}</h1>
          <ContextSwitch
            icon={icon}
            label={t.context}
            texts={t}
            fallback={
              <span className="app-name" aria-hidden="true">
                {icon}
                {app.title}
              </span>
            }
          />
          <div className="header-actions">
            {/* The app's own icon actions go here, for example a reload. */}
            <Menu
              label={t.menu}
              trigger={<MenuIcon />}
              button={menuButton}
              items={[
                { label: t.podsAndSharing, onSelect: () => setManaging(true) },
                ...(connection
                  ? [
                      {
                        label: t.signOut,
                        hint: t.signOutHint,
                        onSelect: () => void disconnect(connection.id),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </header>
      )}
      {/* Below the header's h1, AppAccess uses h2. */}
      <AppAccess
        appName={app.title}
        icon={icon}
        headingLevel={header ? 2 : 1}
        open={managing}
        onClose={() => setManaging(false)}
        focusTarget={menuButton}
      />
      <TargetScreen>
        {/* Says so when the person shared the context read-only. */}
        <AccessNotice />
        <Start />
      </TargetScreen>
    </main>
  );
}

// Replace this screen with your app. It renders once a Pod context is chosen.
function Start() {
  const t = textsFor(useSdkLocale().language);
  return <p>{t.start}</p>;
}
