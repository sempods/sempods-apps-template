// Reads a JSON file and names it when its content is not JSON.
import { readFileSync } from 'node:fs';

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

/** Reads a JSON file, or returns undefined when there is none. */
export const readJsonIfPresent = (path) => ifPresent(() => readJson(path));
