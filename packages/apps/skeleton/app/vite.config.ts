import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { base, pageTitle, pwa, server } from './vite.sempods.generated.ts';

// Base path, development port, page title and PWA settings come from apps.json
// through the generated file; Tailwind CSS styles the UI kit and the app. Add
// your own plugins and options here.
export default defineConfig({
  base,
  server,
  preview: server,
  // React, the SDK and the UI kit come to about 570 kB minified (180 kB
  // gzip) in one chunk; Vite warns only well above that.
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [
    react(),
    tailwindcss(),
    pageTitle,
    ...(pwa ? [VitePWA(pwa)] : []),
  ],
});
