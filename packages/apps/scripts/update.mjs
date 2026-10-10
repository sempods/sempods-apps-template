#!/usr/bin/env node
// Updates the tooling: checks that this machine's Node and pnpm suit the
// target @sempods/apps, installs it and then runs its own migrate, so the new
// version applies its starter. Nothing changes when a prerequisite is
// missing. Usage: pnpm run update [<version>|latest]
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { refuseUnsafe } from './migrate.mjs';
import { repositoryRoot } from './lib/paths.mjs';
import { pnpm, pnpmJson, scriptArgs } from './lib/pnpm.mjs';
import { EXACT_VERSION } from './lib/sdk.mjs';
import { installedVersion, PACKAGE } from './lib/shared.mjs';

/** Problems that stop the update before anything is installed. */
export function preflight(target, { node, pnpmVersion }) {
  const problems = [];
  const { node: needsNode, pnpm: needsPnpm } = target.engines ?? {};
  if (needsNode && !semver.satisfies(node, needsNode))
    problems.push({ tool: 'Node', current: node, range: needsNode });
  if (needsPnpm && pnpmVersion && !semver.satisfies(pnpmVersion, needsPnpm))
    problems.push({ tool: 'pnpm', current: pnpmVersion, range: needsPnpm });
  return problems;
}

/** The order to follow when the target needs newer tools. */
export function prerequisiteOrder(target, problems) {
  const steps = [
    ...problems.map(({ tool, range }) =>
      tool === 'Node'
        ? `Install a Node version in ${range} and write it to .node-version.`
        : `Set packageManager in package.json to a pnpm version in ${range}; pnpm switches to it by itself.`,
    ),
    `Run pnpm run update ${target.version} again.`,
  ];
  return [
    `${PACKAGE} ${target.version} needs ${problems.map(({ tool, current, range }) => `${tool} ${range} (this machine has ${current})`).join(' and ')}. Nothing was changed.`,
    ...steps.map((step, i) => `${i + 1}. ${step}`),
  ].join('\n');
}

/**
 * Declares and installs exactly `version`, then checks that node_modules has
 * it: a version pull request may name it before anything is installed.
 */
export function installTarget(
  root,
  version,
  {
    run = (args) => pnpm(args, { cwd: root }).status === 0,
    installed = () => installedVersion(root),
  } = {},
) {
  if (!run(['add', '--save-dev', '--save-exact', `${PACKAGE}@${version}`]))
    throw new Error(
      `installing ${PACKAGE} ${version} failed; fix the cause and run the update again`,
    );
  const now = installed();
  if (now !== version)
    throw new Error(
      `${PACKAGE} ${now ?? '(none)'} is installed instead of ${version}; run pnpm install and the update again`,
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = scriptArgs();
    if (args.length > 1)
      throw new Error('Usage: pnpm run update [<version>|latest]');
    const spec = args[0] ?? 'latest';
    if (spec !== 'latest' && !EXACT_VERSION.test(spec))
      throw new Error('Use latest or an exact version, for example 0.7.0');
    const root = repositoryRoot();
    const target = pnpmJson(root, [
      'view',
      `${PACKAGE}@${spec}`,
      'version',
      'engines',
      '--json',
    ]);
    refuseUnsafe(root, target.version);
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
    } else {
      installTarget(root, target.version);
      // The installed version migrates with its own code.
      process.exitCode =
        pnpm(['exec', 'sempods-apps', 'migrate'], { cwd: root }).status ?? 1;
    }
  } catch (error) {
    console.error(`update: ${error.message}`);
    process.exitCode = 1;
  }
}
