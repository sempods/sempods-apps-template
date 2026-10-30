// Routing spike costs: the routing app built once per router, with the
// router library in its own chunk (gzip). Results: evidence/routing-sizes.json.
// Usage: node scripts/routing-sizes.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { root } from './lib.mjs';

const dir = join(root, 'apps', 'routing');
const report = {};
for (const name of ['own', 'react-router', 'tanstack']) {
  process.env.ROUTER = name;
  process.env.SDK = 'main';
  await build({
    root: dir,
    configFile: join(dir, 'vite.config.ts'),
    logLevel: 'error',
    build: {
      outDir: join(dir, 'dist', name),
      emptyOutDir: true,
      rolldownOptions: {
        output: {
          advancedChunks: {
            groups: [{ name: 'router', test: /node_modules\/(react-router|@remix-run|cookie-es|@tanstack|isbot)\b/ }],
          },
        },
      },
    },
  });
  const assets = join(dir, 'dist', name, 'assets');
  const sizes = { router: 0, total: 0 };
  for (const file of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
    const gzip = gzipSync(readFileSync(join(assets, file)), { level: 9 }).length;
    sizes.total += gzip;
    if (file.startsWith('router-')) sizes.router += gzip;
  }
  report[name] = { routerGzipKB: +(sizes.router / 1000).toFixed(1), totalJsGzipKB: +(sizes.total / 1000).toFixed(1) };
  console.log(name, JSON.stringify(report[name]));
}
writeFileSync(join(root, 'evidence', 'routing-sizes.json'), JSON.stringify(report, null, 2) + '\n');
