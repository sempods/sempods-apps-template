#!/usr/bin/env node
// Creates a new apps repository from the starter this package ships, and
// records the starter snapshot it applied as the repository's baseline.
// Usage: sempods-apps create <directory>   (pnpm create @sempods/apps <dir>)
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
import { readSnapshot, writeBaseline } from './lib/shared.mjs';

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
  const shared = join(TOOLING, 'shared');
  if (!existsSync(join(shared, 'snapshot.json')))
    throw new Error(
      'this @sempods/apps has no packed starter; create repositories with a published version, for example pnpm create @sempods/apps <directory>',
    );
  return {
    snapshot: readSnapshot(shared),
    version: readJson(join(TOOLING, 'package.json')).version,
  };
}

export function main(args = scriptArgs()) {
  if (args.length !== 1 || args[0].startsWith('-'))
    throw new Error('Usage: pnpm create @sempods/apps <directory>');
  const dir = create(args[0], packagedStarter());
  console.log(`Created ${dir}.

Next:
  cd ${args[0]}
  git init
  pnpm install

Then open the folder in your coding assistant and paste:
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
