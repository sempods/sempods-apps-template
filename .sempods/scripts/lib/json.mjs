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
