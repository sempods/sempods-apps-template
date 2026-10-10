// Reads and writes JSON files the way the template formats them.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

/** Two-space indentation and a final newline. */
export const formatJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function writeJson(path, value) {
  writeFileSync(path, formatJson(value));
}

/**
 * Replaces a JSON file in one step: a reader sees the old or the new content,
 * never a partly written file.
 */
export function replaceJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, formatJson(value));
  renameSync(temporary, path);
}

/** Reads a JSON file and names it when its content is not JSON. */

export function readJson(path) {
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

/**
 * Runs a file operation and returns undefined when the file does not exist.
 * Callers act directly instead of checking first, because the file could
 * change between the check and the use.
 */
export function ifPresent(operation) {
  try {
    return operation();
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}
