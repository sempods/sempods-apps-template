// The default app icon: a monogram, the first letter of the app's title on a
// rounded square in the theme's accent. new-app and icon write it as
// public/favicon.svg and as the PNG icons of the web app manifest, all from
// the same strokes, so no font or image tool is needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const VIEW = 64;
const RADIUS = 14;
const STROKE = 5;
// Letters are drawn in a box 28 units high from y = 18, centred horizontally.
const TOP = 18;
// The calm theme's accent and the text on it, in light and dark mode; only
// the SVG can follow the page's mode.
export const CALM = {
  light: { background: '#1f2933', letter: '#ffffff' },
  dark: { background: '#e5e7eb', letter: '#111315' },
};

/** Points along an elliptical arc; angles in degrees, 0 = right, 90 = down. */
function arc(cx, cy, rx, ry, from, to) {
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 6));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
  });
}

// One entry per letter: strokes as lists of points in the letter's box.
const GLYPHS = {
  A: [[[0, 28], [11, 0], [22, 28]], [[4.5, 18], [17.5, 18]]],
  B: [
    [[0, 28], [0, 0], [10, 0], ...arc(10, 6.5, 6.5, 6.5, -90, 90), [0, 13]],
    [[0, 13], [11, 13], ...arc(11, 20.5, 7.5, 7.5, -90, 90), [0, 28]],
  ],
  C: [arc(12, 14, 12, 14, -40, -320)],
  D: [[[0, 0], [0, 28], [7, 28], ...arc(7, 14, 12, 14, 90, -90), [0, 0]]],
  E: [[[17, 0], [0, 0], [0, 28], [17, 28]], [[0, 14], [13, 14]]],
  F: [[[17, 0], [0, 0], [0, 28]], [[0, 14], [13, 14]]],
  G: [[...arc(12, 14, 12, 14, -40, -360), [14, 14]]],
  H: [[[0, 0], [0, 28]], [[18, 0], [18, 28]], [[0, 14], [18, 14]]],
  I: [[[0, 0], [0, 28]]],
  J: [[[14, 0], [14, 20], ...arc(7, 20, 7, 8, 0, 180)]],
  K: [[[0, 0], [0, 28]], [[20, 0], [3, 15], [20, 28]]],
  L: [[[0, 0], [0, 28], [16, 28]]],
  M: [[[0, 28], [0, 0], [11, 18], [22, 0], [22, 28]]],
  N: [[[0, 28], [0, 0], [18, 28], [18, 0]]],
  O: [arc(12, 14, 12, 14, 0, 360)],
  P: [[[0, 28], [0, 0], [10, 0], ...arc(10, 7.5, 7.5, 7.5, -90, 90), [0, 15]]],
  Q: [arc(12, 14, 12, 14, 0, 360), [[14, 20], [23, 28]]],
  R: [
    [[0, 28], [0, 0], [10, 0], ...arc(10, 7.5, 7.5, 7.5, -90, 90), [0, 15]],
    [[9, 15], [18, 28]],
  ],
  S: [[...arc(9, 7, 8.5, 7, -20, -270), ...arc(9, 21, 9, 7, -90, 160)]],
  T: [[[0, 0], [20, 0]], [[10, 0], [10, 28]]],
  U: [[[0, 0], [0, 19], ...arc(9, 19, 9, 9, 180, 0), [18, 0]]],
  V: [[[0, 0], [10, 28], [20, 0]]],
  W: [[[0, 0], [6, 28], [13, 8], [20, 28], [26, 0]]],
  X: [[[0, 0], [19, 28]], [[19, 0], [0, 28]]],
  Y: [[[0, 0], [10, 13], [20, 0]], [[10, 13], [10, 28]]],
  Z: [[[0, 0], [18, 0], [0, 28], [18, 28]]],
};

/** The monogram letter of a title: its first letter A–Z, accents removed. */
export function monogramLetter(title) {
  const first = String(title).trim().normalize('NFD').charAt(0).toUpperCase();
  return Object.hasOwn(GLYPHS, first) ? first : undefined;
}

/** The letter's strokes in icon coordinates, centred; none for no letter. */
function strokes(letter) {
  const glyph = GLYPHS[letter] ?? [];
  const xs = glyph.flat().map(([x]) => x);
  const shift = VIEW / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
  return glyph.map((stroke) =>
    stroke.map(([x, y]) => [x + shift, y + TOP]),
  );
}

const round = (n) => Math.round(n * 100) / 100;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * The SVG icon. In dark mode it takes the theme's dark accent, so it keeps its
 * contrast on a dark page.
 */
export function monogramSvg(letter, colours = CALM) {
  const d = strokes(letter)
    .map((stroke) =>
      stroke
        .map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`)
        .join(''),
    )
    .join('');
  const path = d
    ? `<path d="${d}" fill="none" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  const style = ({ background, letter }) =>
    `rect{fill:${background}}path{stroke:${letter}}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}"><style>${style(colours.light)}@media (prefers-color-scheme:dark){${style(colours.dark)}}</style><rect width="${VIEW}" height="${VIEW}" rx="${RADIUS}"/>${path}</svg>\n`;
}

function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Signed distance to the rounded square; negative inside. */
function squareDistance([x, y]) {
  const qx = Math.abs(x - VIEW / 2) - (VIEW / 2 - RADIUS);
  const qy = Math.abs(y - VIEW / 2) - (VIEW / 2 - RADIUS);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    RADIUS
  );
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** The PNG icon of `size` pixels, antialiased, with transparent corners. */
export function monogramPng(letter, size, colours = CALM) {
  const segments = strokes(letter).flatMap((stroke) =>
    stroke.slice(1).map((point, i) => [stroke[i], point]),
  );
  const square = rgb(colours.light.background);
  const mark = rgb(colours.light.letter);
  const scale = size / VIEW;
  const coverage = (distance) =>
    Math.max(0, Math.min(1, 0.5 - distance * scale));
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    rows[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const point = [(x + 0.5) / scale, (y + 0.5) / scale];
      const alpha = coverage(squareDistance(point));
      let near = Infinity;
      for (const [a, b] of segments)
        near = Math.min(near, segmentDistance(point, a, b));
      const ink = coverage(near - STROKE / 2);
      const offset = row + 1 + x * 4;
      for (let c = 0; c < 3; c++)
        rows[offset + c] = Math.round(square[c] * (1 - ink) + mark[c] * ink);
      rows[offset + 3] = Math.round(alpha * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Writes an app's icons: public/favicon.svg and the manifest's icon-192.png
 * and icon-512.png. Returns them as paths inside the app.
 */
export function writeAppIcons(appDir, title, colours = CALM) {
  const letter = monogramLetter(title);
  const pub = join(appDir, 'public');
  mkdirSync(pub, { recursive: true });
  writeFileSync(join(pub, 'favicon.svg'), monogramSvg(letter, colours));
  for (const size of [192, 512])
    writeFileSync(
      join(pub, `icon-${size}.png`),
      monogramPng(letter, size, colours),
    );
  return ['favicon.svg', 'icon-192.png', 'icon-512.png'].map(
    (file) => `public/${file}`,
  );
}
