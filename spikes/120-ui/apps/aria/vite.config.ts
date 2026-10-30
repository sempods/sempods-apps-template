import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { harness } from '@spike/harness/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), ...harness()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5302, strictPort: true },
  preview: { host: '127.0.0.1', port: 5302, strictPort: true },
});
