#!/usr/bin/env node
// Updates this repository to a newer template release, following
// .sempods/update-policy.json: `.sempods/` is replaced, shared files get a
// three-way merge, manifests change only template entries, generated app
// configuration is rewritten and the lockfile regenerated. Owner files (app code,
// apps.json, notes, the owner section of AGENTS.md) are never written.
//
//   npm run update-template [-- <version>]   fetch the release and apply it here
//   node <release>/.sempods/scripts/update-template.mjs --instance <dir>
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
import {
  compareVersions as compareSdk,
  EXACT_VERSION,
  PENDING_UPDATE,
} from './sdk-update.mjs';

export const SOURCE = 'https://github.com/sempods/sempods-apps-template.git';
const here = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
export function compareVersions(a, b) {
  const [x, y] = [a, b].map((v) => {
    const match = SEMVER.exec(v ?? '');
    if (!match) throw new Error(`not a version: ${JSON.stringify(v)}`);
    return match.slice(1).map(Number);
  });
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

const readText = (path) =>
  existsSync(path) ? readFileSync(path, 'utf8') : null;
const version = (root) => readText(join(root, '.sempods', 'VERSION'))?.trim();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The template as the instance received it. A release tag gives the exact tree.
 * Without one (instances from before tagged releases), every template commit
 * that carried the instance's VERSION is a candidate, and the origin is the one
 * whose `.sempods/` matches the instance's best: that directory is
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
            const shown = git(release, ['show', `${commit}:.sempods/VERSION`]);
            return shown.status === 0 && shown.stdout.trim() === from;
          });
    if (this.commits.length === 0)
      throw new Error(
        `The template history has no release or commit with version ${from}; update this repository by hand.`,
      );
    this.origin = this.commits[0];
    if (recorded) {
      // Resuming: the origin was inferred before .sempods/ was replaced.
      if (!this.commits.includes(recorded))
        throw new Error(
          `The recorded template origin ${recorded} is not a ${from} commit.`,
        );
      this.origin = recorded;
    } else if (!this.exact && instance) {
      const own = walk(join(instance, '.sempods')).map((f) => `.sempods/${f}`);
      let best = -Infinity;
      for (const commit of this.commits) {
        const theirs = gitOk(release, [
          'ls-tree',
          '-r',
          '--name-only',
          commit,
          '.sempods',
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

function matches(pattern, path) {
  const p = pattern.split('/');
  const f = path.split('/');
  return (
    p.length === f.length && p.every((part, i) => part === '*' || part === f[i])
  );
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

/** Replaces one section between two marker lines with another text's section. */
export function withSection(text, markers, from) {
  const [begin, end] = markers;
  const span = (value) => {
    const start = value.indexOf(begin);
    const stop = value.indexOf(end, start);
    return start < 0 || stop < 0 ? null : [start, stop + end.length];
  };
  const target = span(text);
  const source = span(from);
  if (!target || !source) return null;
  return (
    text.slice(0, target[0]) + from.slice(...source) + text.slice(target[1])
  );
}

/** Three-way merge with git; returns the merged text and its conflict count. */
export function mergeText(ours, base, theirs, labels) {
  const dir = mkdtempSync(join(tmpdir(), 'sempods-merge-'));
  try {
    const files = ['ours', 'base', 'theirs'].map((name, i) => {
      const path = join(dir, name);
      writeFileSync(path, [ours, base, theirs][i]);
      return path;
    });
    const result = git(dir, [
      'merge-file',
      '-p',
      '-L',
      labels[0],
      '-L',
      labels[1],
      '-L',
      labels[2],
      ...files,
    ]);
    if (result.status < 0 || result.status > 127)
      throw new Error(`git merge-file failed: ${result.stderr}`);
    return { text: result.stdout, conflicts: result.status };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Decides one template-owned manifest value. A value equal to one the template
 * shipped is template-owned and follows the release; anything else is the
 * owner's and stays, with a note.
 */
export function decide(ours, bases, theirs) {
  if (same(ours, theirs)) return { value: ours };
  // Absence counts as the owner's removal only if the origin had the entry.
  if (ours === undefined)
    return bases[0] !== undefined
      ? { value: undefined, note: 'removed in this repository; left out' }
      : { value: theirs };
  if (bases.some((b) => same(b, ours))) return { value: theirs };
  return {
    value: ours,
    note: `changed in this repository; kept ${JSON.stringify(ours)}`,
  };
}

const KEYED = [
  'scripts',
  'dependencies',
  'devDependencies',
  'engines',
  'overrides',
];
const PLAIN = ['type', 'private', 'workspaces'];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies'];

/** Template entries of a manifest, merged; owner entries and names are untouched. */
export function mergeManifest(
  ours,
  bases,
  theirs,
  sdk,
  sdkVersion,
  notes,
  where,
) {
  const result = structuredClone(ours);
  const apply = (target, key, decision, label) => {
    if (decision.note) notes.push(`${where} ${label}: ${decision.note}`);
    if (decision.value === undefined) delete target[key];
    else target[key] = decision.value;
  };
  for (const field of PLAIN)
    apply(
      result,
      field,
      decide(
        ours[field],
        bases.map((b) => b?.[field]),
        theirs[field],
      ),
      field,
    );
  for (const field of KEYED) {
    const keys = new Set([
      ...Object.keys(theirs[field] ?? {}),
      ...bases.flatMap((b) => Object.keys(b?.[field] ?? {})),
    ]);
    const target = { ...(result[field] ?? {}) };
    for (const key of keys) {
      if (sdk.includes(key) && field.endsWith('ependencies')) continue;
      apply(
        target,
        key,
        decide(
          ours[field]?.[key],
          bases.map((b) => b?.[field]?.[key]),
          theirs[field]?.[key],
        ),
        `${field}.${key}`,
      );
    }
    // The SDK sits where the release puts it; elsewhere only if the release
    // declares it nowhere in this manifest.
    if (field.endsWith('ependencies'))
      for (const key of sdk) {
        const declared = DEPENDENCY_FIELDS.some(
          (f) => theirs[f]?.[key] !== undefined,
        );
        if (
          declared
            ? theirs[field]?.[key] !== undefined
            : target[key] !== undefined
        )
          target[key] = sdkVersion;
        else if (target[key] !== undefined) {
          delete target[key];
          notes.push(
            `${where} ${field}.${key}: moved to the section the release declares it in`,
          );
        }
      }
    // npm keeps dependency lists sorted; scripts and the rest keep their order.
    const ordered = field.endsWith('ependencies')
      ? Object.fromEntries(
          Object.entries(target).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : target;
    if (Object.keys(ordered).length) result[field] = ordered;
    else delete result[field];
  }
  return result;
}

/** Exact versions of every SDK package a manifest names. */
function sdkVersionsOf(manifest, sdk) {
  return ['dependencies', 'devDependencies'].flatMap((field) =>
    sdk
      .map((name) => manifest?.[field]?.[name])
      .filter((value) => value && EXACT_VERSION.test(value)),
  );
}
const highest = (versions) => [...versions].sort(compareSdk).at(-1);

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

// Present while an update is under way, outside the replaced .sempods/. It
// records where the update started; VERSION changes only once the update is
// complete, so an interrupted update is resumed instead of reported as done.
export const CHECKPOINT = '.template-update-pending';

/** Applies the release at `release` to the instance at `instance`. */
export async function applyRelease(
  release,
  instance,
  {
    install = true,
    afterReplace = () => {},
    npmInstall = () =>
      spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
        cwd: instance,
        // npm's output goes to stderr, so stdout carries only the report.
        stdio: ['ignore', 2, 2],
        shell: process.platform === 'win32',
      }).status === 0,
  } = {},
) {
  const pending = readText(join(instance, CHECKPOINT));
  const resumed = pending === null ? null : JSON.parse(pending);
  // An interrupted replacement can leave .sempods/ without VERSION.
  const from = resumed?.from ?? version(instance);
  const to = version(release);
  if (!from || !to) throw new Error('Both repositories need .sempods/VERSION.');
  if (resumed && resumed.to !== to)
    throw new Error(
      `An update from template ${resumed.from} to ${resumed.to} is unfinished; complete it with that release.`,
    );
  const order = compareVersions(to, from);
  if (order === 0) return { from, to, unchanged: true };
  if (order < 0)
    throw new Error(`This repository has template ${from}, newer than ${to}.`);

  const policy = JSON.parse(
    readFileSync(join(release, '.sempods', 'update-policy.json'), 'utf8'),
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
      'An SDK update is unfinished; complete it with npm run sdk-update first.',
    );
  write(CHECKPOINT, checkpoint);

  // Template-owned: replaced as a whole. VERSION follows at the very end.
  for (const dir of policy.replace) {
    rmSync(join(instance, dir), { recursive: true, force: true });
    for (const file of releaseFiles.filter(
      (f) => (f === dir || f.startsWith(`${dir}/`)) && f !== '.sempods/VERSION',
    )) {
      mkdirSync(dirname(join(instance, file)), { recursive: true });
      cpSync(join(release, file), join(instance, file));
    }
  }
  write('.sempods/VERSION', `${from}\n`);
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
  const releaseSkeleton = parse(
    readText(join(release, policy.skeletonManifest)),
  );
  const appManifests = walk(instance).filter((f) =>
    matches(policy.appManifests, f),
  );
  // One shared SDK version: never lower than any the copy already uses, for
  // either package.
  const sdkVersion = highest(
    [
      root,
      ...appManifests.map((file) => parse(readText(join(instance, file)))),
      releaseSkeleton,
    ]
      .flatMap((manifest) => sdkVersionsOf(manifest, policy.sdk))
      .concat(skeletonSdk ? [skeletonSdk] : []),
  );
  const rootBases = bases.read(rootPath).map(parse);
  const newRoot = mergeManifest(
    root,
    rootBases,
    parse(readText(join(release, rootPath))),
    policy.sdk,
    sdkVersion,
    report.notes,
    rootPath,
  );
  write(rootPath, `${JSON.stringify(newRoot, null, 2)}\n`);
  const skeletonBases = bases.read(policy.skeletonManifest).map(parse);
  for (const file of appManifests) {
    const manifest = parse(readText(join(instance, file)));
    write(
      file,
      `${JSON.stringify(mergeManifest(manifest, skeletonBases, releaseSkeleton, policy.sdk, sdkVersion, report.notes, file), null, 2)}\n`,
    );
  }
  if (
    compareSdk(
      sdkVersion,
      highest(sdkVersionsOf(releaseSkeleton, policy.sdk)),
    ) > 0
  ) {
    const skeleton = parse(readText(join(instance, policy.skeletonManifest)));
    for (const key of policy.sdk) skeleton.dependencies[key] = sdkVersion;
    write(policy.skeletonManifest, `${JSON.stringify(skeleton, null, 2)}\n`);
  }

  // Generated configuration, with the release's generator.
  const lib = (name) =>
    pathToFileURL(join(instance, '.sempods', 'scripts', 'lib', name)).href;
  const { readApps } = await import(lib('apps.mjs'));
  const { writeGenerated } = await import(lib('generate.mjs'));
  for (const app of readApps(instance).apps)
    if (existsSync(join(instance, 'apps', app.id)))
      writeGenerated(join(instance, 'apps', app.id), app);

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
    readText(join(release, '.sempods', 'CHANGELOG.md')),
    from,
  );
  report.resumed = Boolean(resumed);
  // Complete only once the dependencies are installed; until then a rerun resumes.
  if (install && !npmInstall()) {
    report.unfinished = true;
    report.review.push(
      'npm install failed; fix the cause, then run the update again to finish it',
    );
    return report;
  }
  write('.sempods/VERSION', readText(join(release, '.sempods', 'VERSION')));
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
      : `Base: no release tag for ${report.from}; template commit ${report.origin}, whose .sempods/ matches this repository's, served as base.`,
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
    const flags = ['--instance', here];
    if (values['allow-dirty']) flags.push('--allow-dirty');
    if (values['no-install']) flags.push('--no-install');
    const run = spawnSync(
      process.execPath,
      [join(work, '.sempods', 'scripts', 'update-template.mjs'), ...flags],
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
