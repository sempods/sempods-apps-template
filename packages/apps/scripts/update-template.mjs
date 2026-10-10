#!/usr/bin/env node
// Updates this repository to a newer template release, following
// packages/apps/update-policy.json: the tooling package is replaced, shared
// files get a three-way merge, manifests change only template entries,
// generated app configuration is rewritten and the lockfile regenerated. Owner files (app code,
// apps.json, notes, the owner section of AGENTS.md) are never written.
//
//   pnpm run update-template [<version>]     fetch the release and apply it here
//   node <release>/packages/apps/scripts/update-template.mjs --instance <dir>
//                                            apply the release this script is in
//
// The release's own script does the work, so an instance always updates with the
// newer tooling. The result is a working-tree change to review, never a commit.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { formatJson, readJson } from './lib/json.mjs';
import { repositoryRoot } from './lib/paths.mjs';
import {
  decide,
  mergeManifest,
  mergeText,
  withSection,
} from './lib/merge.mjs';
import { INSTALL, pnpm, scriptArgs } from './lib/pnpm.mjs';
import { matches } from './lib/shared.mjs';
import { compareVersions, EXACT_VERSION, PENDING_UPDATE } from './lib/sdk.mjs';

export const SOURCE = 'https://github.com/sempods/sempods-apps-template.git';
// The tooling package inside a template repository and its copies; its
// manifest carries the template version.
const TOOLING = 'packages/apps';
const TOOLING_MANIFEST = `${TOOLING}/package.json`;
const here = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

function git(cwd, args, options = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}
function gitOk(cwd, args) {
  const result = git(cwd, args);
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

// Releases and their tags are plain semver. While the PRs of one release are
// merged, main carries its prerelease (for example 0.5.0-dev), which sorts
// before the release, so a copy made then still updates to it.
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const readText = (path) =>
  existsSync(path) ? readFileSync(path, 'utf8') : null;
const versionOf = (text) => {
  try {
    return JSON.parse(text).version;
  } catch {
    return undefined;
  }
};
const version = (root) => versionOf(readText(join(root, TOOLING_MANIFEST)));

/**
 * The template as the instance received it. A release tag gives the exact tree.
 * Without one (instances from before tagged releases), every template commit
 * that carried the instance's version is a candidate, and the origin is the one
 * whose tooling package matches the instance's best: that directory is
 * template-owned, so instances do not edit it.
 */
export class Bases {
  constructor(release, from, instance, recorded) {
    this.release = release;
    this.exact =
      git(release, ['rev-parse', '-q', '--verify', `refs/tags/v${from}`])
        .status === 0;
    // Commit IDs throughout, so a recorded origin compares with a tag's commit.
    this.commits = this.exact
      ? [gitOk(release, ['rev-parse', `v${from}^{commit}`]).trim()]
      : gitOk(release, ['rev-list', '--first-parent', 'HEAD'])
          .split('\n')
          .filter(Boolean)
          .filter((commit) => {
            const shown = git(release, [
              'show',
              `${commit}:${TOOLING_MANIFEST}`,
            ]);
            return shown.status === 0 && versionOf(shown.stdout) === from;
          });
    if (this.commits.length === 0)
      throw new Error(
        `The template history has no release or commit with version ${from}; update this repository by hand.`,
      );
    this.origin = this.commits[0];
    if (recorded) {
      // Resuming: the origin was inferred before the tooling was replaced.
      if (!this.commits.includes(recorded))
        throw new Error(
          `The recorded template origin ${recorded} is not a ${from} commit.`,
        );
      this.origin = recorded;
    } else if (!this.exact && instance) {
      const own = walk(join(instance, TOOLING)).map((f) => `${TOOLING}/${f}`);
      let best = -Infinity;
      for (const commit of this.commits) {
        const theirs = gitOk(release, [
          'ls-tree',
          '-r',
          '--name-only',
          commit,
          TOOLING,
        ])
          .split('\n')
          .filter(Boolean);
        let score = 0;
        for (const file of new Set([...own, ...theirs])) {
          const shown = git(release, ['show', `${commit}:${file}`]);
          const content = shown.status === 0 ? shown.stdout : null;
          score +=
            content !== null && content === readText(join(instance, file))
              ? 1
              : -1;
        }
        // Newest first, so a tie keeps the newer commit.
        if (score > best) [best, this.origin] = [score, commit];
      }
    }
  }
  /**
   * Distinct contents of a file: the origin's first, then the other candidates
   * newest first; null where the file is absent.
   */
  read(path) {
    const seen = [];
    for (const commit of [this.origin, ...this.commits]) {
      const shown = git(this.release, ['show', `${commit}:${path}`]);
      const content = shown.status === 0 ? shown.stdout : null;
      if (!seen.some((other) => other === content)) seen.push(content);
    }
    return seen;
  }
  files() {
    const names = new Set();
    for (const commit of this.commits)
      for (const name of gitOk(this.release, [
        'ls-tree',
        '-r',
        '--name-only',
        commit,
      ]).split('\n'))
        if (name) names.add(name);
    return [...names];
  }
}

function walk(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '.git') return [];
    return statSync(path).isDirectory()
      ? walk(path, base)
      : [relative(base, path).split(sep).join('/')];
  });
}

/** Exact versions of every SDK package a manifest names. */
function sdkVersionsOf(manifest, sdk) {
  return ['dependencies', 'devDependencies'].flatMap((field) =>
    sdk
      .map((name) => manifest?.[field]?.[name])
      .filter((value) => value && EXACT_VERSION.test(value)),
  );
}
const highest = (versions) => [...versions].sort(compareVersions).at(-1);

/** Upgrade notes of every release after `from`, newest first. */
export function upgradeNotes(changelog, from) {
  if (!changelog) return '';
  const sections = changelog
    .split(/^(?=## )/m)
    .filter((s) => s.startsWith('## '));
  return sections
    .filter((s) => {
      const v = s.slice(3).split(/\s/)[0];
      return SEMVER.test(v) && compareVersions(v, from) > 0;
    })
    .join('\n')
    .trim();
}

// Present while an update is under way, outside the replaced tooling. It
// records where the update started; the version changes only once the update is
// complete, so an interrupted update is resumed instead of reported as done.
export const CHECKPOINT = '.template-update-pending';
const NPM_LOCKFILE = 'package-lock.json';

/** Applies the release at `release` to the instance at `instance`. */
export async function applyRelease(
  release,
  instance,
  {
    install = true,
    afterReplace = () => {},
    // pnpm's output goes to stderr, so stdout carries only the report.
    pnpmRun = (args) =>
      pnpm(args, { cwd: instance, stdio: ['ignore', 2, 2] }).status === 0,
  } = {},
) {
  const pending = readText(join(instance, CHECKPOINT));
  const resumed = pending === null ? null : JSON.parse(pending);
  // An interrupted replacement can leave the tooling without its manifest.
  const from = resumed?.from ?? version(instance);
  const to = version(release);
  if (!from || !to)
    throw new Error(
      `Both repositories need ${TOOLING_MANIFEST} with a version.`,
    );
  if (resumed && resumed.to !== to)
    throw new Error(
      `An update from template ${resumed.from} to ${resumed.to} is unfinished; complete it with that release.`,
    );
  const order = compareVersions(to, from);
  if (order === 0) return { from, to, unchanged: true };
  if (order < 0)
    throw new Error(`This repository has template ${from}, newer than ${to}.`);

  const policy = readJson(join(release, TOOLING, 'update-policy.json'));
  // From 0.7.0 on, a release describes the starter of new repositories
  // instead of a copy of the template; this command cannot apply it.
  if (!Array.isArray(policy.replace))
    throw new Error(
      `Template ${to} creates repositories from a starter and cannot be applied to this copy with update-template. Create a new repository with pnpm create @sempods/apps and move your apps, apps.json, the owner section of AGENTS.md and the setup record of INIT.md into it, as the ${to} upgrade notes describe. Nothing was changed.`,
    );
  const bases = new Bases(release, from, instance, resumed?.origin);
  const parse = (text) => (text === null ? undefined : JSON.parse(text));
  // The copy's skeleton is replaced early; its SDK version, which may be ahead
  // of the release, is kept in the checkpoint for a resumed run.
  const skeletonSdk = resumed
    ? resumed.skeletonSdk
    : highest(
        sdkVersionsOf(
          parse(readText(join(instance, policy.skeletonManifest))),
          policy.sdk,
        ),
      );
  const checkpoint = `${JSON.stringify({ from, to, origin: bases.origin, skeletonSdk })}\n`;
  const labels = ['this repository', `template ${from}`, `template ${to}`];
  const report = {
    from,
    to,
    exact: bases.exact,
    origin: gitOk(release, ['rev-parse', '--short', bases.origin]).trim(),
    merged: [],
    added: [],
    removed: [],
    conflicts: [],
    review: [],
    notes: [],
  };
  const releaseFiles = gitOk(release, ['ls-files']).split('\n').filter(Boolean);
  const baseFiles = bases.files();
  const instanceFiles = walk(instance);
  const write = (path, content) => {
    const target = join(instance, path);
    if (content === null) rmSync(target, { force: true });
    else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  };

  if (existsSync(join(instance, PENDING_UPDATE)))
    throw new Error(
      'An SDK update is unfinished; complete it with the sdk-update script first.',
    );
  write(CHECKPOINT, checkpoint);

  // Template-owned: replaced as a whole. The version follows at the very end.
  const releaseManifest = readText(join(release, TOOLING_MANIFEST));
  for (const dir of policy.replace) {
    rmSync(join(instance, dir), { recursive: true, force: true });
    for (const file of releaseFiles.filter(
      (f) => (f === dir || f.startsWith(`${dir}/`)) && f !== TOOLING_MANIFEST,
    )) {
      mkdirSync(dirname(join(instance, file)), { recursive: true });
      cpSync(join(release, file), join(instance, file));
    }
  }
  write(
    TOOLING_MANIFEST,
    formatJson({ ...JSON.parse(releaseManifest), version: from }),
  );
  afterReplace();
  for (const file of policy.replaceIfPresent)
    if (existsSync(join(instance, file)))
      write(file, readText(join(release, file)));
  // Template-owned paths that later releases no longer ship.
  for (const path of policy.retired ?? [])
    if (existsSync(join(instance, path))) {
      rmSync(join(instance, path), { recursive: true, force: true });
      report.removed.push(path);
    }

  // Shared files: three-way merge.
  const sharedFiles = [
    ...new Set([...releaseFiles, ...baseFiles, ...instanceFiles]),
  ]
    .filter((file) => policy.shared.some((pattern) => matches(pattern, file)))
    .sort();
  for (const file of sharedFiles) {
    const ours = readText(join(instance, file));
    const candidates = bases.read(file);
    const theirs = readText(join(release, file));
    if (ours === theirs) continue;
    if (ours === null) {
      if (candidates[0] !== null)
        report.review.push(
          `${file}: removed in this repository; the template ${theirs === null ? 'removed it too' : 'still ships it'}`,
        );
      else {
        write(file, theirs);
        report.added.push(file);
      }
      continue;
    }
    if (candidates.includes(ours)) {
      write(file, theirs);
      (theirs === null ? report.removed : report.merged).push(file);
      continue;
    }
    if (theirs === null) {
      report.review.push(
        `${file}: the template removed it; changed here, so it stays`,
      );
      continue;
    }
    // Owner sections are not merged: set aside, then restored verbatim.
    const sections = policy.sections?.[file] ?? [];
    // The origin's version is the base; an empty base if the origin lacked the file.
    let base = candidates[0] ?? '';
    let mine = ours;
    let missing = false;
    for (const markers of sections) {
      const neutral = withSection(mine, markers, theirs);
      if (neutral === null) missing = true;
      else mine = neutral;
      base = withSection(base, markers, theirs) ?? base;
    }
    if (missing) {
      report.review.push(`${file}: owner section markers missing; not merged`);
      continue;
    }
    const merged = mergeText(mine, base, theirs, labels);
    let text = merged.text;
    for (const markers of sections)
      text = withSection(text, markers, ours) ?? text;
    if (
      sections.length &&
      sections.some((markers) => withSection(text, markers, ours) === null)
    )
      report.review.push(
        `${file}: an owner section could not be restored; compare it with the previous version`,
      );
    write(file, text);
    if (merged.conflicts > 0)
      report.conflicts.push(
        `${file}: ${merged.conflicts} conflict(s)${bases.exact ? '' : ' (base inferred from the template history)'}`,
      );
    else report.merged.push(file);
  }

  // Files the owner adapts after setup: never written, changes reported.
  for (const file of policy.ownerAfterSetup) {
    const theirs = readText(join(release, file));
    if (bases.read(file)[0] !== theirs)
      report.review.push(
        `${file}: changed in template ${to}; this repository's copy is yours, compare it by hand`,
      );
  }

  // Manifests: template entries only, one shared SDK version.
  const rootPath = policy.rootManifest;
  const root = parse(readText(join(instance, rootPath)));
  const releaseRoot = parse(readText(join(release, rootPath)));
  const releaseSkeleton = parse(
    readText(join(release, policy.skeletonManifest)),
  );
  const appManifests = walk(instance).filter((f) =>
    matches(policy.appManifests, f),
  );
  // One shared SDK version: never lower than the release's or any the copy
  // already uses, for either package, including its replaced skeleton's.
  const sdkVersion = highest(
    [
      root,
      ...appManifests.map((file) => parse(readText(join(instance, file)))),
      releaseRoot,
    ]
      .flatMap((manifest) => sdkVersionsOf(manifest, policy.sdk))
      .concat(skeletonSdk ? [skeletonSdk] : []),
  );
  const rootBases = bases.read(rootPath).map(parse);
  const newRoot = mergeManifest(
    root,
    rootBases,
    releaseRoot,
    policy.sdk,
    sdkVersion,
    report.notes,
    rootPath,
  );
  write(rootPath, formatJson(newRoot));
  // pnpm refuses to work in a project that declares another package manager.
  if (newRoot.packageManager && !newRoot.packageManager.startsWith('pnpm@'))
    report.review.push(
      `${rootPath} packageManager: ${newRoot.packageManager} was kept; pnpm installs only once it names pnpm (the template pins ${releaseRoot.packageManager})`,
    );
  const skeletonBases = bases.read(policy.skeletonManifest).map(parse);
  for (const file of appManifests) {
    const manifest = parse(readText(join(instance, file)));
    write(
      file,
      formatJson(
        mergeManifest(
          manifest,
          skeletonBases,
          releaseSkeleton,
          policy.sdk,
          sdkVersion,
          report.notes,
          file,
        ),
      ),
    );
  }

  // Generated configuration, with the release's generator.
  const lib = (name) =>
    pathToFileURL(join(instance, TOOLING, 'scripts', 'lib', name)).href;
  const { readApps } = await import(lib('apps.mjs'));
  const { writeGenerated } = await import(lib('generate.mjs'));
  const { apps, site } = readApps(instance);
  for (const app of apps)
    if (existsSync(join(instance, 'apps', app.id)))
      writeGenerated(join(instance, 'apps', app.id), app, site);

  // Owner files are never rewritten; mentions of retired template paths are listed.
  for (const file of walk(join(instance, 'apps')).map((f) => `apps/${f}`))
    for (const [mention, advice] of Object.entries(
      policy.ownerReferences ?? {},
    ))
      if (
        /\.(md|json|html|css|[cm]?[jt]sx?)$/.test(file) &&
        readText(join(instance, file)).includes(mention)
      )
        report.review.push(`${file}: mentions ${mention}. ${advice}`);

  report.upgradeNotes = upgradeNotes(
    readText(join(release, TOOLING, 'CHANGELOG.md')),
    from,
  );
  report.resumed = Boolean(resumed);
  // Complete only once the dependencies are installed; until then a rerun resumes.
  const npmLock = existsSync(join(instance, NPM_LOCKFILE));
  if (install) {
    const failed = (step) => {
      report.unfinished = true;
      report.review.push(
        `${step} failed; install pnpm if it is missing (docs/start.md) or fix the cause, then run the update again to finish it`,
      );
      return report;
    };
    // A copy from before pnpm keeps its resolved versions: pnpm converts the
    // npm lockfile, which then goes. While it exists it is authoritative, so
    // the import replaces any pnpm-lock.yaml already there.
    if (npmLock) {
      if (!pnpmRun(['import'])) return failed('pnpm import');
      rmSync(join(instance, NPM_LOCKFILE));
      report.removed.push(NPM_LOCKFILE);
    }
    if (!pnpmRun(INSTALL)) return failed('pnpm install');
  } else if (npmLock) {
    // Without the conversion the copy still has npm's dependency state, so the
    // update stays unfinished and a rerun with installation converts it.
    report.unfinished = true;
    report.review.push(
      `${NPM_LOCKFILE}: run the update again without --no-install, so pnpm import converts it`,
    );
    return report;
  }
  write(TOOLING_MANIFEST, releaseManifest);
  write(CHECKPOINT, null);
  return report;
}

export function formatReport(report) {
  if (report.unchanged)
    return `Already at template ${report.to}; nothing to do.`;
  const list = (title, items) =>
    items.length ? [`### ${title}`, '', ...items.map((i) => `- ${i}`), ''] : [];
  return [
    `## Template ${report.from} → ${report.to}`,
    '',
    report.resumed ? 'Resumed an interrupted update.\n' : '',
    report.unfinished
      ? `Not finished: this repository stays at template ${report.from} until the update completes.\n`
      : '',
    report.exact
      ? `Base: release v${report.from}.`
      : `Base: no release tag for ${report.from}; template commit ${report.origin}, whose tooling matches this repository's, served as base.`,
    '',
    ...list('Conflicts to resolve (marked in the files)', report.conflicts),
    ...list('Review by hand', report.review),
    ...list('Manifest entries kept', report.notes),
    ...list('Merged', report.merged),
    ...list('Added', report.added),
    ...list('Removed', report.removed),
    report.upgradeNotes
      ? "### Changelog since this repository's version\n"
      : '',
    report.upgradeNotes,
  ].join('\n');
}

async function main() {
  const { values, positionals } = parseArgs({
    args: scriptArgs(),
    allowPositionals: true,
    options: {
      instance: { type: 'string' },
      source: { type: 'string', default: SOURCE },
      'allow-dirty': { type: 'boolean', default: false },
      'no-install': { type: 'boolean', default: false },
    },
  });
  if (values.instance) {
    const instance = realpathSync(resolve(values.instance));
    if (instance === realpathSync(here))
      throw new Error(
        'Run the release copy of this script, not the instance copy.',
      );
    if (
      !values['allow-dirty'] &&
      !existsSync(join(instance, CHECKPOINT)) &&
      git(instance, ['status', '--porcelain']).stdout.trim()
    )
      throw new Error(
        'Commit or stash your changes first, so the update is a reviewable diff.',
      );
    const report = await applyRelease(here, instance, {
      install: !values['no-install'],
    });
    console.log(formatReport(report));
    if (report.conflicts?.length || report.review?.length) process.exitCode = 3;
    return;
  }
  // The repository the command runs in. Only a template copy, which holds
  // the tooling in packages/apps, can take a release this way.
  const instance = repositoryRoot();
  if (!existsSync(join(instance, TOOLING_MANIFEST)))
    throw new Error(
      `update-template updates a repository that contains the template tooling in ${TOOLING}. This repository uses the installed @sempods/apps package; updating such a repository is not supported yet (https://github.com/sempods/sempods-apps-template/issues/61). Nothing was changed.`,
    );
  // Fetch the release, then let its own script apply it here.
  const work = mkdtempSync(join(tmpdir(), 'sempods-template-'));
  try {
    gitOk(tmpdir(), ['clone', '--quiet', '--no-checkout', values.source, work]);
    const tags = gitOk(work, ['tag', '--list', 'v*'])
      .split('\n')
      .map((t) => t.slice(1))
      .filter((t) => SEMVER.test(t))
      .sort(compareVersions);
    const target = positionals[0] ?? tags.at(-1);
    if (!target || !tags.includes(target))
      throw new Error(
        `No template release ${target ?? '(none tagged)'}; available: ${tags.join(', ') || 'none'}`,
      );
    gitOk(work, ['checkout', '--quiet', `v${target}`]);
    const flags = ['--instance', instance];
    if (values['allow-dirty']) flags.push('--allow-dirty');
    if (values['no-install']) flags.push('--no-install');
    const run = spawnSync(
      process.execPath,
      [join(work, TOOLING, 'scripts', 'update-template.mjs'), ...flags],
      { stdio: 'inherit' },
    );
    process.exitCode = run.status ?? 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Real paths: the release copy runs from a temporary directory, which can sit
// behind a symlink (/var and /private/var on macOS).
if (
  process.argv[1] &&
  realpathSync(resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
)
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
