import { followBrowserTheme } from '@sempods/apps/browser-theme';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Tailwind, the UI kit and the app's theme.
import './index.css';
import App from './App.tsx';
import { registerAppWorker } from './pwa.ts';
import { app } from './sempods.generated.ts';

// The browser's theme colour follows the app's background, also when the
// system's appearance changes.
const stopBrowserTheme = followBrowserTheme();
import.meta.hot?.dispose(stopBrowserTheme);

// Production builds only: the development server has no service worker.
const registration =
  import.meta.env.PROD && app.pwa
    ? registerAppWorker(`${app.basePath}sw.js`)
    : Promise.resolve(undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App registration={registration} />
  </StrictMode>,
);
