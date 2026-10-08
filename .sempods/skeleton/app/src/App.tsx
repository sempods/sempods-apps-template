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

// One runtime for the app's lifetime, created outside rendering.
const runtime = createBrowserRuntime(runtimeOptions);

// Vite hot replacement ends this module's runtime lifetime.
if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose());

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
  return (
    <main>
      {connections.length > 0 && (
        <header>
          <h1>{app.title}</h1>
          <button
            ref={focusTarget}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {messages.controls.dataAccess}
          </button>
        </header>
      )}
      <AppAccess appName={app.title} open={open} focusTarget={focusTarget} />
      <TargetScreen>
        <Start />
      </TargetScreen>
    </main>
  );
}

// Replace this screen with your app. It renders once a Pod context is chosen.
function Start() {
  const { language } = useSdkLocale();
  return (
    <p>
      {language === 'de'
        ? 'Verbunden. Beschreibe deinem Assistenten, was diese App tun soll.'
        : 'Connected. Tell your assistant what this app should do.'}
    </p>
  );
}
