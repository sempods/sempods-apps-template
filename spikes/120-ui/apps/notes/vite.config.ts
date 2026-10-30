import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { harness } from '@spike/harness/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), ...harness({ fixture: 'notes' })],
  // The UI package is TypeScript source in this workspace.
  optimizeDeps: { include: ['@sempods-spike/ui-aria > react-aria-components'] },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5304, strictPort: true },
  preview: { host: '127.0.0.1', port: 5304, strictPort: true },
});
