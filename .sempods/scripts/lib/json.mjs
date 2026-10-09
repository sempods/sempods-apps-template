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
 * Reads a JSON file, or returns undefined when there is none. It reads
 * directly rather than checking first, because the file could change between
 * the check and the read.
 */
export function readJsonIfPresent(path) {
  try {
    return readJson(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}
