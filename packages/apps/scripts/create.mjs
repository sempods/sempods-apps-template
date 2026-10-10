#!/usr/bin/env node
// Creates a new apps repository from the starter this package ships, records
// the starter snapshot it applied as the repository's baseline and initializes
// Git on main, the branch the starter's workflows check.
// Usage: sempods-apps create <directory>   (pnpm create @sempods/apps <dir>)
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson } from './lib/json.mjs';
import { TOOLING } from './lib/paths.mjs';
import { scriptArgs } from './lib/pnpm.mjs';
import { starterAt, writeBaseline } from './lib/shared.mjs';

const NAME = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * Writes the starter of `snapshot` into `target`, which must be missing or
 * empty, with the tooling `version` in its manifest.
 */
export function create(target, { snapshot, version }) {
  const dir = resolve(target);
  if (existsSync(dir) && readdirSync(dir).length > 0)
    throw new Error(`${target} already exists and is not empty`);
  for (const file of Object.keys(snapshot.files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), readFileSync(snapshot.path(file)));
  }
  const manifest = readJson(join(dir, 'package.json'));
  const name = basename(dir).toLowerCase();
  if (NAME.test(name)) manifest.name = name;
  manifest.devDependencies['@sempods/apps'] = version;
  writeJson(join(dir, 'package.json'), manifest);
  writeBaseline(dir, { version, revision: snapshot.revision });
  return dir;
}

/** The starter this installed package ships; only a packed package has one. */
export function packagedStarter() {
  if (!existsSync(join(TOOLING, 'shared', 'snapshot.json')))
    throw new Error(
      'this @sempods/apps has no packed starter; create repositories with a published version, for example pnpm create @sempods/apps <directory>',
    );
  return starterAt(TOOLING);
}

export function main(args = scriptArgs()) {
  if (args.length !== 1 || args[0].startsWith('-'))
    throw new Error('Usage: pnpm create @sempods/apps <directory>');
  const dir = create(args[0], packagedStarter());
  const git = spawnSync('git', ['init', '--quiet', '-b', 'main'], {
    cwd: dir,
    stdio: 'ignore',
  });
  console.log(`Created ${dir}.`);
  if (git.status !== 0)
    console.log(
      'Git is missing or failed: initialize the repository on the main branch before the first commit.',
    );
  // No shell command to copy: open the folder; INIT.md has the setup steps.
  console.log(`
Open this folder in your coding assistant and paste:

  Read AGENTS.md and INIT.md. Help me build my first app.`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`create: ${error.message}`);
    process.exitCode = 1;
  }
}
