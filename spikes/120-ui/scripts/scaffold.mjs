// Writes the plain Vite shell of each variant app before `shadcn init`.
// Kept for reproducibility; running it again overwrites only these files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'apps');
const ports = { base: 5301, aria: 5302, radix: 5303 };
const json = (v) => JSON.stringify(v, null, 2) + '\n';

for (const [variant, port] of Object.entries(ports)) {
  const dir = join(root, variant);
  mkdirSync(join(dir, 'src'), { recursive: true });
  const write = (name, text) => writeFileSync(join(dir, name), text);
  write(
    'package.json',
    json({
      name: `spike-${variant}`,
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' },
      dependencies: {
        '@sempods/app-sdk': '0.6.0',
        '@sempods/client-sdk': '0.6.0',
        '@spike/harness': 'workspace:*',
        react: '19.3.1',
        'react-dom': '19.3.1',
      },
      devDependencies: {
        '@tailwindcss/vite': '4.3.3',
        '@types/node': '24.19.2',
        '@types/react': '19.3.0',
        '@types/react-dom': '19.3.0',
        '@vitejs/plugin-react': '6.1.2',
        tailwindcss: '4.3.3',
        typescript: '7.0.2',
        vite: '8.3.5',
      },
    }),
  );
  write(
    'vite.config.ts',
    `import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { harness } from '@spike/harness/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), ...harness()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: ${port}, strictPort: true },
  preview: { host: '127.0.0.1', port: ${port}, strictPort: true },
});
`,
  );
  write(
    'tsconfig.json',
    json({
      files: [],
      references: [{ path: './tsconfig.app.json' }],
      compilerOptions: { paths: { '@/*': ['./src/*'] } },
    }),
  );
  write(
    'tsconfig.app.json',
    json({
      compilerOptions: {
        tsBuildInfoFile: './node_modules/.tmp/tsconfig.app.tsbuildinfo',
        target: 'es2023',
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        module: 'esnext',
        types: ['vite/client'],
        skipLibCheck: true,
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        verbatimModuleSyntax: true,
        moduleDetection: 'force',
        noEmit: true,
        jsx: 'react-jsx',
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        paths: { '@/*': ['./src/*'] },
      },
      include: ['src'],
    }),
  );
  write(
    'index.html',
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content" />
    <meta name="referrer" content="strict-origin" />
    <title>Spike ${variant}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );
  write('src/index.css', '@import "tailwindcss";\n');
}
