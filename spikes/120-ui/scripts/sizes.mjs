// Stage 3 costs: production builds of the variants, split into React, the
// SDK, the UI library and the app, with gzip sizes, plus the number of
// production packages each variant installs.
// Usage: node scripts/sizes.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { root } from './lib.mjs';

const groups = [
  ['react', /node_modules\/(react|react-dom|scheduler)\//],
  ['sdk', /node_modules\/@sempods\/|vendor\/sdk-main/],
  ['ui-library', /node_modules\/(@base-ui|@floating-ui|react-aria|react-aria-components|@react-aria|@react-stately|@react-types|react-stately|@internationalized|react-day-picker|date-fns|@date-fns|tabbable|use-sync-external-store|@swc|client-only|reselect|lucide-react|cn|class-variance-authority)\b/],
];
const report = {};
for (const variant of ['base', 'aria']) {
  const dir = join(root, 'apps', variant);
  process.env.SDK = 'main';
  await build({
    root: dir,
    configFile: join(dir, 'vite.config.ts'),
    logLevel: 'error',
    build: {
      outDir: join(dir, 'dist'),
      emptyOutDir: true,
      rolldownOptions: {
        output: {
          advancedChunks: {
            groups: groups.map(([name, test]) => ({ name, test })),
          },
        },
      },
    },
  });
  const assets = join(dir, 'dist', 'assets');
  const sizes = {};
  for (const file of readdirSync(assets)) {
    const bytes = readFileSync(join(assets, file));
    const key = file.endsWith('.css') ? 'css' : file.replace(/-[\w-]{8}\.js$/, '');
    sizes[key] ??= { raw: 0, gzip: 0 };
    sizes[key].raw += statSync(join(assets, file)).size;
    sizes[key].gzip += gzipSync(bytes, { level: 9 }).length;
  }
  const prod = JSON.parse(execFileSync('pnpm', ['list', '--prod', '--depth', 'Infinity', '--json'], { cwd: dir, encoding: 'utf8' }));
  const names = new Set();
  const walk = (deps) => {
    for (const [name, info] of Object.entries(deps ?? {})) {
      if (name.startsWith('@spike/')) continue;
      names.add(name);
      walk(info.dependencies);
    }
  };
  walk(prod[0].dependencies);
  report[variant] = { sizes, productionPackages: names.size, packages: [...names].sort() };
  console.log(variant, JSON.stringify(sizes), 'prod packages', names.size);
}
writeFileSync(join(root, 'evidence', 'sizes.json'), JSON.stringify(report, null, 2) + '\n');
