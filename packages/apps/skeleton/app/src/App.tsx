import { useRef, useState } from 'react';
import { createBrowserRuntime } from '@sempods/app-sdk';
import {
  AppAccess,
  SempodsProvider,
  TargetScreen,
  useAppState,
  useSdkLocale,
} from '@sempods/app-sdk/react';
import { NewVersionNotice } from './NewVersionNotice.tsx';
import { app, runtimeOptions } from './sempods.generated.ts';
import { startMessage } from './start.ts';

// One runtime for the app's lifetime, created outside rendering.
const runtime = createBrowserRuntime(runtimeOptions);

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
    <SempodsProvider runtime={runtime} language={app.language}>
      <NewVersionNotice registration={registration} />
      <Frame />
    </SempodsProvider>
  );
}

// The app owns its layout. AppAccess shows sign-in and recovery beside the
// content and hides once a context is readable; the button reopens it.
function Frame() {
  const [open, setOpen] = useState(false);
  const focusTarget = useRef<HTMLButtonElement>(null);
  const { connections } = useAppState();
  const { messages } = useSdkLocale();
  const header = connections.length > 0;
  return (
    <main>
      {header && (
        <header>
          <h1>
            {icon}
            {app.title}
          </h1>
          <button
            ref={focusTarget}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {messages.controls.dataAccess}
          </button>
        </header>
      )}
      {/* Below the header's h1, AppAccess uses h2. */}
      <AppAccess
        appName={app.title}
        icon={icon}
        headingLevel={header ? 2 : 1}
        open={open}
        focusTarget={focusTarget}
      />
      <TargetScreen>
        <Start />
      </TargetScreen>
    </main>
  );
}

// Replace this screen with your app. It renders once a Pod context is chosen.
function Start() {
  const { language } = useSdkLocale();
  return <p>{startMessage(language)}</p>;
}
