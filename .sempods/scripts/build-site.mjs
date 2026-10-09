#!/usr/bin/env node
// Builds every app with a published profile into its path of one static site
// folder, site-dist/, and writes the overview and the host's routing files.
// apps/<id>/dist keeps the app's local build.
// Usage: pnpm run build-site [--profile production|preview]
//        (or SEMPODS_SITE_PROFILE=<profile> in the host's environment)
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readApps, SITE_PROFILES, siteIdentity } from './lib/apps.mjs';
import { PROFILE_MODES } from './lib/generate.mjs';
import { renderNotFound, renderOverview } from './lib/overview.mjs';
import { pnpm, scriptArgs } from './lib/pnpm.mjs';

export const SITE_DIR = 'site-dist';
const SDK = ['app-sdk', 'client-sdk'];

/** Runs the app's own build script with a site mode into `outDir`. */
function appBuild(appDir, mode, outDir) {
  // pnpm appends these to the script's final `vite build`.
  const args = ['run', 'build', '--mode', mode, '--outDir', outDir];
  return pnpm([...args, '--emptyOutDir'], { cwd: appDir }).status === 0;
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** The overview entry of a built app: apps.json, then its PWA manifest. */
function overviewEntry(app, outDir) {
  const entry = {
    id: app.id,
    title: app.title,
    language: app.language,
    href: app.path,
  };
  const manifest = join(outDir, 'manifest.webmanifest');
  if (existsSync(manifest)) {
    const { name, description, icons = [] } = readJson(manifest);
    if (name) entry.title = name;
    if (description) entry.description = description;
    const size = (icon) => Number(String(icon.sizes).split('x')[0]) || 0;
    const largest = [...icons].sort((a, b) => size(b) - size(a))[0];
    if (largest?.src) entry.icon = largest.src;
  } else if (existsSync(join(outDir, 'icon-192.png')))
    entry.icon = `${app.path}icon-192.png`;
  return entry;
}

/** Builds the site for `profile`; returns the output directory. */
export function buildSite(root, { profile = 'production', build = appBuild } = {}) {
  if (!SITE_PROFILES.includes(profile))
    throw new Error(`The profile is one of ${SITE_PROFILES.join(', ')}.`);
  const { apps, site } = readApps(root);
  if (!site?.[profile])
    throw new Error(
      `apps.json has no site.${profile}; run pnpm run configure-site first.`,
    );
  if (apps.length === 0) throw new Error('There are no apps to publish yet.');
  const host = site.host ?? 'static';
  const out = join(root, SITE_DIR);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const entries = [];
  const redirects = [];
  for (const app of apps) {
    const appDir = join(root, 'apps', app.id);
    const appOut = join(out, app.id);
    if (!build(appDir, PROFILE_MODES[profile], appOut))
      throw new Error(`apps/${app.id}: the build failed.`);
    const index = join(appOut, 'index.html');
    if (!existsSync(index))
      throw new Error(
        `apps/${app.id}: the build wrote no index.html to ${SITE_DIR}/${app.id}; the app's build script must end with vite build.`,
      );

    // Some Pods resolve the did:web document before they accept the app.
    const { clientId } = siteIdentity(site[profile], app);
    const didFile = join(appOut, 'did.json');
    if (existsSync(didFile) && readJson(didFile).id !== clientId)
      throw new Error(
        `apps/${app.id} ships a did.json for another identity; remove it, build-site writes ${clientId}.`,
      );
    writeFileSync(
      didFile,
      `${JSON.stringify({ '@context': 'https://www.w3.org/ns/did/v1', id: clientId }, null, 2)}\n`,
    );

    // The SDK's Apache-2.0 notices travel with the published code.
    for (const name of SDK) {
      const from = [appDir, root]
        .map((base) => join(base, 'node_modules', '@sempods', name))
        .find((dir) => existsSync(dir));
      if (!from) continue;
      const to = join(appOut, 'licenses', name);
      mkdirSync(to, { recursive: true });
      for (const file of ['LICENSE', 'NOTICE'])
        if (existsSync(join(from, file)))
          copyFileSync(join(from, file), join(to, file));
    }

    // The callback must answer 200 at its exact path with its query intact.
    if (host === 'netlify')
      redirects.push(`${app.path}callback ${app.path}index.html 200`);
    else copyFileSync(index, join(appOut, 'callback.html'));

    entries.push(overviewEntry(app, appOut));
  }

  writeFileSync(join(out, 'index.html'), renderOverview(entries));
  // Hosts serve it for unknown paths; without it, Cloudflare Pages would serve
  // the overview for every unknown path.
  writeFileSync(join(out, '404.html'), renderNotFound(entries));
  if (host === 'netlify')
    writeFileSync(join(out, '_redirects'), `${redirects.join('\n')}\n`);
  return out;
}

function main() {
  const { values } = parseArgs({
    args: scriptArgs(),
    options: { profile: { type: 'string' } },
  });
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const profile =
    values.profile ?? process.env.SEMPODS_SITE_PROFILE ?? 'production';
  buildSite(root, { profile });
  const { apps, site } = readApps(root);
  console.log(`\nBuilt ${SITE_DIR}/ for ${site[profile]} (${profile}):`);
  for (const app of apps) console.log(`  ${site[profile]}${app.path}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`build-site: ${error.message}`);
    process.exitCode = 1;
  }
}
