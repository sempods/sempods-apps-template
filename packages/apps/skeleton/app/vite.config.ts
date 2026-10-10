import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { base, pwa, server } from './vite.sempods.generated.ts';

// Base path, development port and PWA settings come from apps.json through the
// generated file; add your own plugins and options here.
export default defineConfig({
  base,
  server,
  preview: server,
  plugins: [react(), ...(pwa ? [VitePWA(pwa)] : [])],
});
