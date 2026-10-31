import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { harness } from '@spike/harness/vite';

export default defineConfig({
  // The app lives under /focus/, as in a site with several apps.
  base: '/focus/',
  plugins: [react(), tailwindcss(), ...harness()],
  // The UI package is TypeScript source in this workspace.
  optimizeDeps: { include: ['@sempods-spike/ui-aria > react-aria-components'] },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1' },
});
