// File operations the migration relies on: reading a file that may be absent
// or a directory, writing in one step, removing with emptied directories.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

export const isFile = (path) =>
  statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;

export const isDirectory = (path) =>
  statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;

/** A file's text, or null when there is no file at the path. */
export const readText = (path) =>
  isFile(path) ? readFileSync(path, 'utf8') : null;

/** Writes a file in one step: the old or the complete new content remains. */
export function replaceFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

/** Removes a file and the directories it leaves empty, up to `root`. */
export function removeFile(root, path) {
  rmSync(path, { force: true });
  for (
    let dir = dirname(path);
    dir !== root && existsSync(dir) && readdirSync(dir).length === 0;
    dir = dirname(dir)
  )
    rmdirSync(dir);
}
