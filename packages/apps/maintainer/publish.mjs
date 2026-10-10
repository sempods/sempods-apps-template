#!/usr/bin/env node
// Publishes the packed packages from the publish workflow, in the order given
// (@sempods/apps before @sempods/create-apps, which depends on it), through
// npm trusted publishing with provenance. Every tarball must carry the tag's
// version, and @sempods dependencies that same version, before anything is
// published; a prerelease goes to the `next` dist-tag. On a rerun, a version
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

// Check every tarball before the first publish: a published version can
// never be published again, so a mismatch must not leave half a release.
const releases = tarballs.map((tarball) => {
  const manifest = spawnSync(
    'tar',
    ['-xzOf', tarball, 'package/package.json'],
    { encoding: 'utf8' },
  );
  if (manifest.status !== 0) throw new Error(`cannot read ${tarball}`);
  const { name, version, dependencies = {} } = JSON.parse(manifest.stdout);
  if (version !== tag)
    throw new Error(`${name} is ${version}, but the tag names ${tag || 'none'}`);
  // The creator depends on the tooling of exactly its own version.
  for (const [dependency, range] of Object.entries(dependencies))
    if (dependency.startsWith('@sempods/') && range !== version)
      throw new Error(`${name} depends on ${dependency}@${range}, not ${version}`);
  const digest = createHash('sha512').update(readFileSync(tarball));
  const integrity = `sha512-${digest.digest('base64')}`;
  const published = npm(['view', `${name}@${version}`, 'dist.integrity']);
  const done = published.status === 0 && published.stdout.trim() !== '';
  if (done && published.stdout.trim() !== integrity)
    throw new Error(`${name}@${version} is already published with other contents`);
  return { tarball, name, version, done };
});

for (const { tarball, name, version, done } of releases) {
  if (done) {
    console.log(`${name}@${version} is already published; nothing to do.`);
    continue;
  }
  const distTag = version.includes('-') ? 'next' : 'latest';
  const args = ['publish', tarball, '--provenance', '--access', 'public'];
  if (npm([...args, '--tag', distTag], 'inherit').status !== 0)
    throw new Error(`npm publish of ${name}@${version} failed`);
  console.log(`Published ${name}@${version} (${distTag}).`);
}
