#!/usr/bin/env node
// Publishes the packed tooling package from the publish workflow, through npm
// trusted publishing with provenance. The tag must name the package version;
// a prerelease goes to the `next` dist-tag. On a rerun, a version already on
// the registry is skipped only if its contents equal the packed tarball.
// Usage: node packages/apps/maintainer/publish.mjs <tarball>
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from '../scripts/lib/json.mjs';
import { TOOLING } from '../scripts/lib/paths.mjs';

const [tarball] = process.argv.slice(2);
const { name, version } = readJson(join(TOOLING, 'package.json'));
const tag = (process.env.GITHUB_REF_NAME ?? '').replace(/^v/, '');
if (!tarball) throw new Error('Usage: publish.mjs <tarball>');
if (tag !== version)
  throw new Error(`${name} is ${version}, but the tag names ${tag || 'none'}`);

const npm = (args) =>
  spawnSync('npm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 2] });
const digest = createHash('sha512').update(readFileSync(tarball));
const integrity = `sha512-${digest.digest('base64')}`;
const published = npm(['view', `${name}@${version}`, 'dist.integrity']);
if (published.status === 0 && published.stdout.trim()) {
  if (published.stdout.trim() !== integrity)
    throw new Error(
      `${name}@${version} is already published with other contents`,
    );
  console.log(`${name}@${version} is already published; nothing to do.`);
} else {
  const distTag = version.includes('-') ? 'next' : 'latest';
  const result = spawnSync(
    'npm',
    ['publish', tarball, '--provenance', '--access', 'public', '--tag', distTag],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error('npm publish failed');
  console.log(`Published ${name}@${version} (${distTag}).`);
}
