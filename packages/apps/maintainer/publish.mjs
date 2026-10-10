#!/usr/bin/env node
// Publishes the packed packages from the publish workflow, in the order given
// (@sempods/apps before @sempods/create-apps, which depends on it), through
// npm trusted publishing with provenance. The tag must name each package's
// version; a prerelease goes to the `next` dist-tag. On a rerun, a version
// already on the registry is skipped only if its contents equal the tarball.
// Usage: node packages/apps/maintainer/publish.mjs <tarball>...
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const tarballs = process.argv.slice(2);
const tag = (process.env.GITHUB_REF_NAME ?? '').replace(/^v/, '');
if (tarballs.length === 0)
  throw new Error('Usage: publish.mjs <tarball>...');

const npm = (args, stdio = ['ignore', 'pipe', 2]) =>
  spawnSync('npm', args, { encoding: 'utf8', stdio });

for (const tarball of tarballs) {
  const manifest = spawnSync(
    'tar',
    ['-xzOf', tarball, 'package/package.json'],
    { encoding: 'utf8' },
  );
  if (manifest.status !== 0) throw new Error(`cannot read ${tarball}`);
  const { name, version } = JSON.parse(manifest.stdout);
  if (version !== tag)
    throw new Error(`${name} is ${version}, but the tag names ${tag || 'none'}`);
  const digest = createHash('sha512').update(readFileSync(tarball));
  const integrity = `sha512-${digest.digest('base64')}`;
  const published = npm(['view', `${name}@${version}`, 'dist.integrity']);
  if (published.status === 0 && published.stdout.trim()) {
    if (published.stdout.trim() !== integrity)
      throw new Error(
        `${name}@${version} is already published with other contents`,
      );
    console.log(`${name}@${version} is already published; nothing to do.`);
    continue;
  }
  const distTag = version.includes('-') ? 'next' : 'latest';
  const args = ['publish', tarball, '--provenance', '--access', 'public'];
  if (npm([...args, '--tag', distTag], 'inherit').status !== 0)
    throw new Error(`npm publish of ${name}@${version} failed`);
  console.log(`Published ${name}@${version} (${distTag}).`);
}
