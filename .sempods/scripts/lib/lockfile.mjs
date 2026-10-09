// Reads dependency versions from pnpm-lock.yaml without a YAML parser, so a
// fresh CI checkout without node_modules can read it. pnpm writes the lockfile
// with two-space indentation and one key per line.

const unquote = (key) => key.replace(/^(['"])(.*)\1$/, '$2');

/**
 * Locked versions: `importers` maps an importer path ('.' or 'apps/<id>') to
 * its sections ('dependencies', 'devDependencies') of name → version, and
 * `packages` holds every resolved 'name@version'. Peer suffixes such as
 * '0.5.0(react@19.3.0)' are dropped.
 */
export function readLockfile(text) {
  const importers = {};
  const packages = new Set();
  let top, importer, section, name;
  for (const line of text.split(/\r?\n/)) {
    const match = /^( *)([^ #][^:]*|'[^']*'|"[^"]*"):(?: (.*))?$/.exec(line);
    if (!match) continue;
    const indent = match[1].length;
    const key = unquote(match[2].trim());
    const value = match[3]?.trim();
    if (indent === 0) top = key;
    else if (top === 'packages' && indent === 2) packages.add(key);
    else if (top !== 'importers') continue;
    else if (indent === 2) importers[(importer = key)] = {};
    else if (indent === 4) importers[importer][(section = key)] = {};
    else if (indent === 6) name = key;
    else if (indent === 8 && key === 'version' && value)
      importers[importer][section][name] = unquote(value).replace(/\(.*$/, '');
  }
  return { importers, packages };
}
