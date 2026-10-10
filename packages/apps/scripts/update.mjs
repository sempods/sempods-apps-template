#!/usr/bin/env node
// Updates the tooling: checks that this machine's Node and pnpm suit the
// target @sempods/apps, installs it and then runs its own migrate, so the new
// version applies its starter. Nothing changes when a prerequisite is
// missing. Usage: pnpm run update [<version>|latest]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { MIGRATION_FILE } from './migrate.mjs';
import { readJson } from './lib/json.mjs';
import { repositoryRoot } from './lib/paths.mjs';
import { pnpm, scriptArgs } from './lib/pnpm.mjs';
import { EXACT_VERSION } from './lib/sdk.mjs';
import { PACKAGE } from './lib/shared.mjs';

/** The registry's version and engines of a package version or dist-tag. */
export function lookupTarget(root, spec) {
  const result = pnpm(
    ['view', `${PACKAGE}@${spec}`, 'version', 'engines', '--json'],
    { cwd: root, stdio: 'pipe', encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(
      `cannot resolve ${PACKAGE}@${spec} from the npm registry: ${result.stderr.trim()}`,
    );
  const found = JSON.parse(result.stdout);
  return { version: found.version, engines: found.engines ?? {} };
}

/** Problems that stop the update before anything is installed. */
export function preflight(target, { node, pnpmVersion }) {
  const problems = [];
  const { node: needsNode, pnpm: needsPnpm } = target.engines;
  if (needsNode && !semver.satisfies(node, needsNode))
    problems.push({ tool: 'Node', current: node, range: needsNode });
  if (needsPnpm && pnpmVersion && !semver.satisfies(pnpmVersion, needsPnpm))
    problems.push({ tool: 'pnpm', current: pnpmVersion, range: needsPnpm });
  return problems;
}

/** The order to follow when the target needs newer tools. */
export function prerequisiteOrder(target, problems) {
  const steps = [];
  for (const { tool, range } of problems)
    steps.push(
      tool === 'Node'
        ? `Install a Node version in ${range} and write it to .node-version.`
        : `Set packageManager in package.json to a pnpm version in ${range}; pnpm switches to it by itself.`,
    );
  steps.push(`Run pnpm run update ${target.version} again.`);
  return [
    `${PACKAGE} ${target.version} needs ${problems.map(({ tool, current, range }) => `${tool} ${range} (this machine has ${current})`).join(' and ')}. Nothing was changed.`,
    ...steps.map((step, i) => `${i + 1}. ${step}`),
  ].join('\n');
}

export function main(args = scriptArgs(), { lookup = lookupTarget } = {}) {
  if (args.length > 1)
    throw new Error('Usage: pnpm run update [<version>|latest]');
  const spec = args[0] ?? 'latest';
  if (spec !== 'latest' && !EXACT_VERSION.test(spec))
    throw new Error('Use latest or an exact version, for example 0.7.0');
  const root = repositoryRoot();
  if (existsSync(join(root, MIGRATION_FILE)))
    throw new Error(
      'a migration is unfinished; finish it with pnpm run migrate first',
    );
  const target = lookup(root, spec);
  const version = pnpm(['--version'], {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  const problems = preflight(target, {
    node: process.versions.node,
    pnpmVersion: version.status === 0 ? version.stdout.trim() : undefined,
  });
  if (problems.length > 0) {
    console.error(prerequisiteOrder(target, problems));
    process.exitCode = 2;
    return;
  }
  const current = readJson(join(root, 'package.json')).devDependencies?.[
    PACKAGE
  ];
  if (current !== target.version) {
    const add = pnpm(
      ['add', '--save-dev', '--save-exact', `${PACKAGE}@${target.version}`],
      { cwd: root },
    );
    if (add.status !== 0)
      throw new Error(
        `installing ${PACKAGE} ${target.version} failed; fix the cause and run the update again`,
      );
  }
  // The installed version migrates with its own code.
  const run = spawnSync('pnpm', ['exec', 'sempods-apps', 'migrate'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exitCode = run.status ?? 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`update: ${error.message}`);
    process.exitCode = 1;
  }
}
