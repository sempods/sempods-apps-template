// The UI kit and router the skeleton copied into apps in 0.8.0, until the
// package @sempods/app-ui replaced them. They are the owner's files: a
// migration never changes or removes them. It only tells which of them are
// still as shipped, so moving the app to the package needs no merge there,
// and which the owner changed, which stay the app's own until they replace
// them deliberately.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ifPresent } from './json.mjs';

// SHA-256 of each file as 0.8.0-dev.1 and 0.8.0 shipped it, with LF line
// endings.
const SHIPPED = {
  'src/routes.ts': [
    '50693779a9ec1a73ab6210445cae1ab9563be105e94d79417772fe78a64d43c9',
  ],
  'src/routes.test.ts': [
    'cb92fec8d23daea5587394960f535445d7da156c0ab4346286ddce1375cc42c9',
  ],
  'src/ui/Composer.tsx': [
    'dcf6d28da59802da17421d04ef120e29863520790ae8f51ffa58e6221a7da89e',
  ],
  'src/ui/ContextSwitch.tsx': [
    '07c584db1dc69f0d4c42ea77691a67687f8deab6d93833fec8b3d9f09878fc6a',
    '953d1f775d0575360251bb8d41e07736912de384d22c2d9fc7ff733959d7db51',
  ],
  'src/ui/Dialog.tsx': [
    'b9c01053804e13b6745299d8c7f79e9ec91bf2e75cd9541ac1a9f0c088e66061',
    'b30a55e4b808f7e1dc2998c2f0df5e1a9a6aa16d69be7bcf5a55f579fb7ec873',
  ],
  'src/ui/Menu.tsx': [
    '685b4f6ebe9c2ed447dd54e3b80c005a6cf7e7466df61a14f666d53988728fe6',
  ],
  'src/ui/Tabs.tsx': [
    'c2da6564da4a229802acf96b00d6c235d0fa0b0f53e407e63466cd347db10647',
  ],
  'src/ui/dismiss.ts': [
    'd5fa5a7589f9b7661c531471834e7facca784d466af5e81f2e5dfa70f388dda9',
  ],
  'src/ui/icons.tsx': [
    'bf2d7f15d0c6455e15d561515e7a594becdd9f5b364f5e3aaa477e4736bbb6ec',
  ],
  'src/ui/ui.css': [
    '43603c18c03dde5e731814989c76c5575e330da5f06d1db32c1cc5566c22cd3c',
    '10fd3f736ed82a96a9727d53ec27722b8d80682e42d9a5f8f66119a35d35bd34',
  ],
};

const sha256 = (text) =>
  createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');

/**
 * The copied kit files an app still has: `unchanged` as shipped, `changed`
 * by the owner. Undefined when the app has none of them.
 */
export function copiedKit(appDir) {
  const unchanged = [];
  const changed = [];
  for (const [file, hashes] of Object.entries(SHIPPED)) {
    const text = ifPresent(() => readFileSync(join(appDir, file), 'utf8'));
    if (text === undefined) continue;
    (hashes.includes(sha256(text)) ? unchanged : changed).push(file);
  }
  return unchanged.length + changed.length > 0
    ? { unchanged, changed }
    : undefined;
}

/** The migration's note for one app that still has the copied kit. */
export function kitNote(id, kit) {
  const list = (files) => files.map((file) => `apps/${id}/${file}`).join(', ');
  return [
    `apps/${id} still has the UI kit and router copied in 0.8.0; it keeps working, nothing was changed. Move it to @sempods/app-ui as the 0.9.0 upgrade notes in the tooling's CHANGELOG.md describe.`,
    kit.unchanged.length > 0 &&
      `As shipped, to replace with the package: ${list(kit.unchanged)}.`,
    kit.changed.length > 0 &&
      `Changed in this app, the app's own until the owner replaces them: ${list(kit.changed)}.`,
  ]
    .filter(Boolean)
    .join(' ');
}
