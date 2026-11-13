// The default app icon: a monogram, the first letter of the app's title on a
// rounded square in the theme's accent. new-app and icon write it as
// public/favicon.svg and as the PNG icons of the web app manifest, all from
// the same strokes, so no font or image tool is needed. The maskable variant
// fills the whole square; the letter stays inside its safe zone, the circle
// of 80 % in the middle, so any mask shape keeps it whole.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { ifPresent } from './json.mjs';

// The icons of the web app manifest in public/, by size; the maskable one is
// the same picture for launchers that cut it into their own shape.
export const PNG_ICONS = ['icon-192.png', 'icon-512.png'];
export const MASKABLE_ICON = 'icon-maskable-512.png';

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

/**
 * The PNG icon of `size` pixels, antialiased, with transparent corners; the
 * maskable variant has none.
 */
export function monogramPng(
  letter,
  size,
  colours = CALM,
  { maskable = false } = {},
) {
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
      const alpha = maskable ? 1 : coverage(squareDistance(point));
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
 * Writes an app's monogram icons: public/favicon.svg and the manifest's PNG
 * icons. Returns them as paths inside the app.
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
  writeFileSync(
    join(pub, MASKABLE_ICON),
    monogramPng(letter, 512, colours, { maskable: true }),
  );
  return ['favicon.svg', ...PNG_ICONS, MASKABLE_ICON].map(
    (file) => `public/${file}`,
  );
}

// The owner's own icon, apps/<id>/icon.svg, replaces the monogram.
export const OWNER_ICON = 'icon.svg';
const OWNER_ICON_LIMIT = 64 * 1024;

/**
 * Why `svg` cannot be the app's icon, otherwise undefined: it must be an SVG
 * document with a square viewBox, at most 64 KB.
 */
export function ownerIconProblem(svg) {
  if (Buffer.byteLength(svg) > OWNER_ICON_LIMIT)
    return `${OWNER_ICON} is larger than ${OWNER_ICON_LIMIT / 1024} KB`;
  const tag = svg.match(/<svg\b[^>]*>/);
  if (!tag) return `${OWNER_ICON} holds no <svg> element`;
  const box = tag[0].match(/\bviewBox\s*=\s*["']([^"']*)["']/);
  const [, , width, height] = (box?.[1].trim().split(/[\s,]+/) ?? []).map(
    Number,
  );
  if (!(width > 0 && width === height))
    return `${OWNER_ICON} needs a square viewBox, such as viewBox="0 0 512 512"`;
  return undefined;
}

/**
 * Draws the owner's icon into public/ with a browser from Playwright: the SVG
 * itself as favicon.svg, the PNG sizes with its transparency, and the maskable
 * variant on `background`. The SVG is shown as an image, so it runs no script
 * and loads nothing. Returns the files as paths inside the app.
 */
export async function writeOwnerIcons(appDir, svg, background, browser) {
  const problem = ownerIconProblem(svg);
  if (problem) throw new Error(problem);
  const pub = join(appDir, 'public');
  mkdirSync(pub, { recursive: true });
  const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const page = await browser.newPage();
  try {
    const draw = async (size, fill) => {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<!doctype html><body style="margin:0;background:${fill ?? 'transparent'}"><img src="${source}" width="${size}" height="${size}" style="display:block" alt=""></body>`,
      );
      const drawn = await page
        .locator('img')
        .evaluate((img) => img.decode().then(() => true, () => false));
      if (!drawn) throw new Error(`${OWNER_ICON} cannot be drawn as an image`);
      return page.screenshot({ omitBackground: fill === undefined });
    };
    // Every picture is drawn before any file changes.
    const drawn = {
      'icon-192.png': await draw(192),
      'icon-512.png': await draw(512),
      [MASKABLE_ICON]: await draw(512, background),
    };
    writeFileSync(join(pub, 'favicon.svg'), svg);
    for (const [file, png] of Object.entries(drawn))
      writeFileSync(join(pub, file), png);
  } finally {
    await page.close();
  }
  return ['favicon.svg', ...PNG_ICONS, MASKABLE_ICON].map(
    (file) => `public/${file}`,
  );
}

/**
 * The problems `check` reports for an app's icons: an owner's icon.svg that
 * cannot be one or that was not drawn yet, and a PWA's missing PNG icons.
 */
export function iconProblems(appDir, app) {
  const where = `apps/${app.id}`;
  const draw = `run pnpm run icon ${app.id}`;
  const problems = [];
  const own = ifPresent(() => readFileSync(join(appDir, OWNER_ICON), 'utf8'));
  if (own !== undefined) {
    const problem = ownerIconProblem(own);
    if (problem) problems.push(`${where}/${problem}`);
    else if (
      ifPresent(() => readFileSync(join(appDir, 'public', 'favicon.svg'), 'utf8')) !==
      own
    )
      problems.push(
        `${where}/${OWNER_ICON} is not drawn into public/ yet; ${draw}`,
      );
  }
  if (app.pwa)
    for (const file of [...PNG_ICONS, MASKABLE_ICON])
      if (!existsSync(join(appDir, 'public', file)))
        problems.push(`${where}/public/${file} is missing; ${draw}`);
  return problems;
}
