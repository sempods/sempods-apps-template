#!/usr/bin/env node
// Records where the site is published in apps.json and regenerates every app's
// configuration from it. Each app gets a did:web identity per site origin;
// local development keeps its own profile.
// Usage: pnpm run configure-site --production <origin> [--preview <origin> |
//        --no-preview] [--host netlify|cloudflare-pages|static] [--change-domain]
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  readApps,
  SITE_PROFILES,
  siteIdentity,
  validateApps,
  writeApps,
} from './lib/apps.mjs';
import { writeGenerated } from './lib/generate.mjs';
import { scriptArgs } from './lib/pnpm.mjs';

/** Applies the options to apps.json and regenerates the apps; returns the site. */
export function configureSite(
  root,
  { production, preview, noPreview = false, host, changeDomain = false } = {},
) {
  const manifest = readApps(root);
  const current = manifest.site;
  if (preview !== undefined && noPreview)
    throw new Error('Use either --preview or --no-preview.');
  // A new origin is a new identity for every app: logins and grants start over.
  if (
    current?.production &&
    production !== undefined &&
    production !== current.production &&
    !changeDomain
  )
    throw new Error(
      `site.production is ${current.production}. Changing it gives every app a new identity, so every login and Pod grant must be made again. Rerun with --change-domain if that is intended.`,
    );
  const site = {
    production: production ?? current?.production,
    ...(noPreview ? {} : { preview: preview ?? current?.preview }),
    host: host ?? current?.host ?? 'static',
  };
  if (site.preview === undefined) delete site.preview;
  if (site.production === undefined)
    throw new Error('Name the published site: --production <https-origin>.');
  const next = { ...manifest, site };
  const problems = validateApps(next);
  if (problems.length > 0) throw new Error(problems.join('; '));
  writeApps(root, next);
  for (const app of next.apps) {
    const dir = join(root, 'apps', app.id);
    if (existsSync(dir)) writeGenerated(dir, app, site);
  }
  return next;
}

function main() {
  const { values } = parseArgs({
    args: scriptArgs(),
    options: {
      production: { type: 'string' },
      preview: { type: 'string' },
      'no-preview': { type: 'boolean' },
      host: { type: 'string' },
      'change-domain': { type: 'boolean' },
    },
  });
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { site, apps } = configureSite(root, {
    production: values.production,
    preview: values.preview,
    noPreview: values['no-preview'],
    host: values.host,
    changeDomain: values['change-domain'],
  });
  console.log(`Site configured for ${site.host} hosting.`);
  for (const profile of SITE_PROFILES) {
    if (!site[profile]) continue;
    console.log(`\n${profile}: ${site[profile]}`);
    for (const app of apps) {
      const { clientId, redirectUri } = siteIdentity(site[profile], app);
      console.log(`  ${app.id}: ${clientId} → ${redirectUri}`);
    }
  }
  console.log('\nBuild it: pnpm run build-site (see .sempods/instructions/publish.md)');
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`configure-site: ${error.message}`);
    process.exitCode = 1;
  }
}
