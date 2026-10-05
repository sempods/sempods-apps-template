import { createBrowserRuntime } from '@sempods/app-sdk';
import {
  AppShell,
  SempodsProvider,
  TargetScreen,
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
      <AppShell title={app.title}>
        <TargetScreen>
          <Start />
        </TargetScreen>
      </AppShell>
    </SempodsProvider>
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
