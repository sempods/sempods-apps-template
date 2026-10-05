import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerAppWorker } from './pwa.ts';
import { app } from './sempods.generated.ts';

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
