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
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // ROUTER=own|react-router|tanstack picks the router adapter.
      '@router': fileURLToPath(new URL(`./src/routers/${process.env.ROUTER || 'own'}.tsx`, import.meta.url)),
    },
  },
  define: { __ROUTER__: JSON.stringify(process.env.ROUTER || 'own') },
  server: { host: '127.0.0.1', port: 5305, strictPort: true },
  preview: { host: '127.0.0.1', port: 5305, strictPort: true },
});
