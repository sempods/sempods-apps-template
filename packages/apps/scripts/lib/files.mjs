// File operations the migration relies on: reading a file that may be absent
// or a directory, writing in one step, removing with emptied directories.
import {
  existsSync,
  lstatSync,
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

// What is at a path, or undefined when nothing is, also below a file.
function entry(path, stat = statSync) {
  try {
    return stat(path, { throwIfNoEntry: false });
  } catch (error) {
    if (error.code === 'ENOTDIR') return undefined;
    throw error;
  }
}

export const isFile = (path) => entry(path)?.isFile() ?? false;

export const isDirectory = (path) => entry(path)?.isDirectory() ?? false;

export const isSymlink = (path) =>
  entry(path, lstatSync)?.isSymbolicLink() ?? false;

/** A file's text, or null when there is no file at the path. */
export const readText = (path) =>
  isFile(path) ? readFileSync(path, 'utf8') : null;

/** Writes a file in one step: the old or the complete new content remains. */
export function replaceFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  // Created anew, so a link left at the temporary name is never followed.
  rmSync(temporary, { force: true });
  writeFileSync(temporary, content, { flag: 'wx' });
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
