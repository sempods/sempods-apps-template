#!/usr/bin/env node
// Creates apps/<id> from the skeleton and adds it to apps.json.
// Usage: pnpm run new-app <id> [--title "<title>"] [--language <de|en>] [--no-pwa]
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  invalidId,
  LANGUAGES,
  nextDevPort,
  readApps,
  writeApps,
} from './lib/apps.mjs';
import { writeGenerated } from './lib/generate.mjs';
import { INSTALL, pnpm, scriptArgs } from './lib/pnpm.mjs';

const TEXT = new Set(['.json', '.html', '.md', '.ts', '.tsx', '.css']);

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function fillTokens(dir, app) {
  // Directory entries carry their type, so no separate stat precedes the read
  // and write of the same path.
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const { name } = entry;
    const path = join(dir, name);
    if (entry.isDirectory()) {
      fillTokens(path, app);
      continue;
    }
    if (!TEXT.has(extname(name))) continue;
    const title = extname(name) === '.html' ? escapeHtml(app.title) : app.title;
    const source = readFileSync(path, 'utf8');
    const filled = source
      .replaceAll('__APP_ID__', app.id)
      .replaceAll('__APP_TITLE__', title)
      .replaceAll('__APP_LANGUAGE__', app.language);
    if (filled !== source) writeFileSync(path, filled);
  }
}

/**
 * Creates one app. Throws with a one-line reason and changes nothing when the
 * ID is invalid or already used.
 */
export function createApp(
  root,
  { id, title = id, language = 'en', pwa = true },
) {
  const reason = invalidId(id);
  if (reason) throw new Error(reason);
  if (!LANGUAGES.includes(language))
    throw new Error(`language must be one of ${LANGUAGES.join(', ')}`);
  if (typeof title !== 'string' || title.trim() === '')
    throw new Error('the title must not be empty');
  const manifest = readApps(root);
  const appDir = join(root, 'apps', id);
  if (manifest.apps.some((app) => app.id === id) || existsSync(appDir))
    throw new Error(`apps/${id} already exists; nothing was changed`);

  const app = {
    id,
    title: title.trim(),
    language,
    path: `/${id}/`,
    devPort: nextDevPort(manifest),
    pwa,
  };
  try {
    cpSync(join(root, '.sempods', 'skeleton', 'app'), appDir, {
      recursive: true,
      errorOnExist: true,
    });
    fillTokens(appDir, app);
    writeGenerated(appDir, app);
    writeApps(root, { ...manifest, apps: [...manifest.apps, app] });
  } catch (error) {
    rmSync(appDir, { recursive: true, force: true });
    throw error;
  }
  return app;
}

function main() {
  const { values, positionals } = parseArgs({
    args: scriptArgs(),
    allowPositionals: true,
    options: {
      title: { type: 'string' },
      language: { type: 'string' },
      'no-pwa': { type: 'boolean' },
      'skip-install': { type: 'boolean' },
    },
  });
  if (positionals.length !== 1) {
    console.error(
      'Usage: pnpm run new-app <id> [--title "<title>"] [--language <de|en>] [--no-pwa]',
    );
    process.exit(2);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let app;
  try {
    app = createApp(root, {
      id: positionals[0],
      title: values.title,
      language: values.language,
      pwa: !values['no-pwa'],
    });
  } catch (error) {
    console.error(`new-app: ${error.message}`);
    process.exit(1);
  }
  console.log(`Created apps/${app.id} (${app.title}).`);
  if (!values['skip-install']) {
    const install = pnpm(INSTALL, { cwd: root });
    if (install.status !== 0) {
      console.error('pnpm install failed; run it again, then start the app.');
      process.exit(1);
    }
  }
  console.log(`Start it: pnpm run dev ${app.id}`);
  console.log(`Then open http://127.0.0.1:${app.devPort}${app.path}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
