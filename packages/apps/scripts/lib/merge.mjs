// Merges a repository's file with a template change: three-way merges of
// text, owner sections that stay verbatim, and template entries of manifests.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
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
const PLAIN = ['type', 'private', 'packageManager', 'workspaces'];
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
    // Package managers keep dependency lists sorted; scripts and the rest keep their order.
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
