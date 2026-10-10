// The SDK packages every app uses, and how their exact versions compare.
export const SDK = ['@sempods/app-sdk', '@sempods/client-sdk'];

/** The app-author reference the installed SDK ships, relative to the root. */
export const REFERENCE = 'node_modules/@sempods/app-sdk/docs/ai-app-builder.md';

// A failed SDK update can leave manifests, lockfile and installed packages at
// the target already. sdk-update keeps this local checkpoint until the entire
// update passes; template updates refuse to start while it exists.
export const PENDING_UPDATE = '.sempods/.sdk-update-pending';

// SemVer 2.0: numeric identifiers cannot have leading zeroes.
export const EXACT_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function compareVersions(a, b) {
  const left = EXACT_VERSION.exec(a);
  const right = EXACT_VERSION.exec(b);
  for (const [match, v] of [
    [left, a],
    [right, b],
  ])
    if (!match) throw new Error(`not an exact version: ${JSON.stringify(v)}`);
  for (let i = 1; i <= 3; i++) {
    if (BigInt(left[i]) !== BigInt(right[i]))
      return BigInt(left[i]) > BigInt(right[i]) ? 1 : -1;
  }
  if (left[4] === right[4]) return 0;
  if (!left[4]) return 1;
  if (!right[4]) return -1;
  const l = left[4].split('.');
  const r = right[4].split('.');
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    if (l[i] === r[i]) continue;
    if (l[i] === undefined) return -1;
    if (r[i] === undefined) return 1;
    const ln = /^\d+$/.test(l[i]);
    const rn = /^\d+$/.test(r[i]);
    if (ln && rn) return BigInt(l[i]) > BigInt(r[i]) ? 1 : -1;
    if (ln !== rn) return ln ? -1 : 1;
    return l[i] > r[i] ? 1 : -1;
  }
  return 0;
}
