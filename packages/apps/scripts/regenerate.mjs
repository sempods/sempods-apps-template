#!/usr/bin/env node
// Rewrites every app's generated configuration from apps.json, for example
// after a tooling update changed the generator. Usage: pnpm run regenerate
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApps } from './lib/apps.mjs';
import { staleGenerated, writeGenerated } from './lib/generate.mjs';
import { repositoryRoot } from './lib/paths.mjs';

/** Rewrites the generated files that differ; returns them as apps/<id>/<file>. */
export function regenerate(root) {
  const { apps, site } = readApps(root);
  const changed = [];
  for (const app of apps) {
    const dir = join(root, 'apps', app.id);
    if (!existsSync(dir)) continue;
    const stale = staleGenerated(dir, app, site);
    if (stale.length === 0) continue;
    writeGenerated(dir, app, site);
    changed.push(...stale.map((file) => `apps/${app.id}/${file}`));
  }
  return changed;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const changed = regenerate(repositoryRoot());
    console.log(
      changed.length
        ? `Regenerated:\n${changed.map((file) => `  ${file}`).join('\n')}`
        : 'Generated configuration is up to date.',
    );
  } catch (error) {
    console.error(`regenerate: ${error.message}`);
    process.exitCode = 1;
  }
}
