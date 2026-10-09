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
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readApps, SITE_PROFILES, siteIdentity } from './lib/apps.mjs';
import { PROFILE_MODES, staleGenerated } from './lib/generate.mjs';
import { readJsonIfPresent } from './lib/json.mjs';
import { renderNotFound, renderOverview } from './lib/overview.mjs';
import { pnpm, scriptArgs } from './lib/pnpm.mjs';
import { SDK } from './sdk-update.mjs';

export const SITE_DIR = 'site-dist';

/** Runs the app's own build script with a site mode into `outDir`. */
function appBuild(appDir, mode, outDir) {
  // pnpm appends these to the script's final `vite build`. The output path is
  // relative to the app, so no user directory name passes through the Windows
  // shell (lib/pnpm.mjs).
  const args = ['run', 'build', '--mode', mode, '--outDir'];
  args.push(relative(appDir, outDir), '--emptyOutDir');
  return pnpm(args, { cwd: appDir }).status === 0;
}

// build-site owns these files in the output: an app's own copies are replaced
// (did.json) or left out (host files, which hosts read only at the site root;
// Cloudflare would serve a nested 404.html).
const OWNED_FILES = ['did.json', '_redirects', '_headers', '404.html'];

// The callback page loads its scripts before the SDK scrubs code and state
// from the address; without this, same-origin requests carry them in Referer.
const REFERRER = '<meta name="referrer" content="strict-origin" />';
function withReferrerPolicy(html) {
  if (/<meta\s+name=["']?referrer["']?/i.test(html)) return html;
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}\n    ${REFERRER}`);
}

/** Copies a file and reports false when there is none (no check-then-use). */
function copyIfPresent(from, to) {
  try {
    copyFileSync(from, to);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** The SDK's Apache-2.0 notices, which travel with the published code. */
function copyLicences(roots, appOut, appId) {
  for (const pkg of SDK) {
    const to = join(appOut, 'licenses', pkg.split('/')[1]);
    mkdirSync(to, { recursive: true });
    let copied = false;
    for (const base of roots) {
      const from = join(base, 'node_modules', pkg);
      if (!copyIfPresent(join(from, 'LICENSE'), join(to, 'LICENSE'))) continue;
      copyIfPresent(join(from, 'NOTICE'), join(to, 'NOTICE'));
      copied = true;
      break;
    }
    if (!copied)
      throw new Error(
        `${pkg} with its LICENSE is not installed for apps/${appId}; run pnpm install.`,
      );
  }
}

/** The overview entry of a built app: apps.json, then its PWA manifest. */
function overviewEntry(app, outDir) {
  const entry = {
    id: app.id,
    title: app.title,
    language: app.language,
    href: app.path,
  };
  const manifest = readJsonIfPresent(join(outDir, 'manifest.webmanifest'));
  if (manifest) {
    const { name, description, icons = [] } = manifest;
    if (name) entry.title = name;
    if (description) entry.description = description;
    const size = (icon) => Number(String(icon.sizes).split('x')[0]) || 0;
    const largest = icons.reduce(
      (best, icon) => (!best || size(icon) > size(best) ? icon : best),
      undefined,
    );
    // Icon URLs are relative to the manifest, not to the overview at /.
    if (largest?.src) {
      const base = new URL(`${app.path}manifest.webmanifest`, 'https://site.invalid');
      const url = new URL(largest.src, base);
      entry.icon = url.origin === base.origin ? url.pathname : url.href;
    }
  } else if (existsSync(join(outDir, 'icon-192.png')))
    entry.icon = `${app.path}icon-192.png`;
  return entry;
}

/** Builds the site for `profile`; returns what it built and any warnings. */
export function buildSite(root, { profile = 'production', build = appBuild } = {}) {
  if (!SITE_PROFILES.includes(profile))
    throw new Error(`The profile is one of ${SITE_PROFILES.join(', ')}.`);
  const { apps, site } = readApps(root);
  if (!site?.[profile])
    throw new Error(
      `apps.json has no site.${profile}; run pnpm run configure-site first.`,
    );
  if (apps.length === 0) throw new Error('There are no apps to publish yet.');
  const netlify = site.host === 'netlify';
  const out = join(root, SITE_DIR);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // A hand edit of apps.json would build one identity and publish another.
  for (const app of apps) {
    const stale = staleGenerated(join(root, 'apps', app.id), app, site);
    if (stale.length > 0)
      throw new Error(
        `apps/${app.id}/${stale[0]} does not match apps.json; run pnpm run configure-site to regenerate it.`,
      );
  }

  const entries = [];
  const redirects = [];
  const warnings = [];
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

    for (const file of OWNED_FILES)
      if (existsSync(join(appOut, file))) {
        rmSync(join(appOut, file));
        warnings.push(
          `apps/${app.id}/public/${file} is not published: build-site writes this file itself.`,
        );
      }

    // Some Pods resolve the did:web document before they accept the app.
    const { clientId, redirectUri } = siteIdentity(site[profile], app);
    writeFileSync(
      join(appOut, 'did.json'),
      `${JSON.stringify({ '@context': 'https://www.w3.org/ns/did/v1', id: clientId }, null, 2)}\n`,
    );
    copyLicences([appDir, root], appOut, app.id);
    writeFileSync(index, withReferrerPolicy(readFileSync(index, 'utf8')));

    // The callback must answer 200 at its exact path with its query intact.
    // On Netlify the rewrite is forced (200!), so no file at that path can
    // shadow it.
    const callback = new URL(redirectUri).pathname;
    if (netlify) redirects.push(`${callback} ${app.path}index.html 200!`);
    else copyFileSync(index, join(out, `${callback.slice(1)}.html`));

    entries.push(overviewEntry(app, appOut));
  }

  writeFileSync(join(out, 'index.html'), renderOverview(entries));
  // Hosts serve it for unknown paths; without it, Cloudflare Pages would serve
  // the overview for every unknown path.
  writeFileSync(join(out, '404.html'), renderNotFound(entries));
  if (netlify) writeFileSync(join(out, '_redirects'), `${redirects.join('\n')}\n`);
  return { out, apps, site, warnings };
}

function main() {
  const { values } = parseArgs({
    args: scriptArgs(),
    options: { profile: { type: 'string' } },
  });
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const profile =
    values.profile ?? process.env.SEMPODS_SITE_PROFILE ?? 'production';
  const { apps, site, warnings } = buildSite(root, { profile });
  for (const warning of warnings) console.warn(`build-site: ${warning}`);
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
