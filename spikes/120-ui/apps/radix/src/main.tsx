import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SpikeApp } from '@spike/harness/screen';
import { kit } from './kit.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpikeApp ui={kit} />
  </StrictMode>,
);
