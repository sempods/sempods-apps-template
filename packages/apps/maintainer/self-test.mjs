#!/usr/bin/env node
// Acceptance test of the packed packages, as an owner gets them: pack
// @sempods/apps and @sempods/create-apps, check what the tarball contains,
// create a repository with the creator, install the tooling from its tarball,
// then create an app, refuse a rerun, check it including a standalone
// install/build, check its theme in a browser (and a broken one), render its
// example screens with synthetic rows in a browser, regenerate,
// configure a site, build it and assert the profile each build mode selects. Finally an update: the owner customizes the
// repository, a later version changes the starter, and migrate applies it
// from the recorded baseline. Source-workspace tests alone can miss a
// file the package forgets to ship or a dependency only this repository
// provides. Needs the npm registry and Playwright's Chromium
// (pnpm --filter @sempods/apps exec playwright install chromium).
// Usage: pnpm run self-test
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { readJson, writeJson } from '../scripts/lib/json.mjs';
import { TOOLING } from '../scripts/lib/paths.mjs';
import { INSTALL, pnpm } from '../scripts/lib/pnpm.mjs';
import {
  baselineSnapshot,
  readBaseline,
  readSnapshot,
} from '../scripts/lib/shared.mjs';
import { checkLinks } from './lib/links.mjs';

// A source-pair check before the SDK is released. Overrides stay in the
// temporary owner repository (also copied by its standalone check).
const sdkTarballs = process.argv
  .find((arg) => arg.startsWith('--sdk-tarballs='))
  ?.slice('--sdk-tarballs='.length);
const FIXTURE = 'self-test';
const CREATOR = join(TOOLING, '..', 'create-apps');
// Files the CLI needs at run time, and sources that must stay out.
const REQUIRED = [
  'package.json',
  'bin/sempods-apps.mjs',
  'scripts/check.mjs',
  'scripts/check-theme.mjs',
  'scripts/lib/kit.mjs',
  'scripts/create.mjs',
  'scripts/lib/paths.mjs',
  'skeleton/app/package.json',
  'skeleton/app/.oxlintrc.json',
  'instructions/app-workflow.md',
  'instructions/setup.md',
  'skills/app-workflow/SKILL.md',
  'shared/snapshot.json',
  'update-policy.json',
  'LICENSE',
];
const EXCLUDED = ['test/', 'maintainer/', 'starter/'];

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}`);
  return result.stdout;
}
const pnpmRun = (repo, ...args) => run('pnpm', ['run', ...args], repo);

// Resolve the browser driver through the installed tarball, just as an owner
// does. Playwright 1.65 and later refuse a click on an element with an inert
// ancestor, also in a native modal dialog. Since SDK 0.9.0-dev.2 the SDK's
// questions sit in a `data-react-aria-top-layer` element beside the content
// that React Aria makes inert (SDK #264); a plain click must reach them there.
async function nativeModalCheck(repo) {
  const require = createRequire(
    realpathSync(join(repo, 'node_modules/@sempods/apps/package.json')),
  );
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main inert><p>Editor</p></main>
      <div data-react-aria-top-layer style="display: contents">
        <dialog aria-label="Unsaved changes">
          <form method="dialog"><button>Keep editing</button></form>
        </dialog>
      </div>
    `);
    await page.locator('dialog').evaluate((dialog) => dialog.showModal());
    await page
      .getByRole('button', { name: 'Keep editing', exact: true })
      .click({ timeout: 5000 });
    if (await page.locator('dialog').evaluate((dialog) => dialog.open))
      throw new Error('the native confirmation did not close');
    console.log(
      '✓ installed Playwright clicks a native modal beside inert content',
    );
  } finally {
    await browser.close();
  }
}

const OVERRIDES = '\n# Self-test: packages that are not on the registry.\noverrides:\n';

/** Replaces the self-test's overrides in the repository's workspace file. */
function writeOverrides(repo, overrides) {
  const workspace = join(repo, 'pnpm-workspace.yaml');
  const settings = readFileSync(workspace, 'utf8').split(OVERRIDES)[0];
  writeFileSync(
    workspace,
    settings +
      OVERRIDES +
      Object.entries(overrides)
        .map(([name, path]) => `  '${name}': ${JSON.stringify(path)}\n`)
        .join(''),
  );
}

function pack(dir, out) {
  const before = new Set(readdirSync(out));
  run('pnpm', ['pack', '--pack-destination', out], dir);
  return join(
    out,
    readdirSync(out).find((name) => !before.has(name) && name.endsWith('.tgz')),
  );
}

function unpack(tarball, dir) {
  mkdirSync(dir, { recursive: true });
  run('tar', ['-xzf', tarball, '-C', dir], dir);
  return join(dir, 'package');
}

/** The snapshot an unpacked package ships, resolved as a baseline would be. */
function checkSnapshot(dir, label) {
  const { version } = readJson(join(dir, 'package.json'));
  const { revision, files } = readSnapshot(join(dir, 'shared'));
  baselineSnapshot(
    { version, revision },
    {
      installed: dir,
      download: () => {
        throw new Error('the installed version needs no download');
      },
    },
  );
  console.log(`✓ ${label}: ${Object.keys(files).length} starter files`);
  return revision;
}

// The runtime options a mode selects, asserted inside the fixture's own test
// runner: the bundle holds every profile, so only the selection proves one.
const PROFILE_TEST = `import { expect, it } from 'vitest';
import { profile, runtimeOptions } from './sempods.generated.ts';

it('selects the profile of the build mode', () => {
  const expected = JSON.parse(process.env.SEMPODS_EXPECTED ?? 'null');
  expect(profile).toBe(expected.profile);
  expect(runtimeOptions.identity.kind).toBe(expected.kind);
  expect(runtimeOptions.development).toBe(expected.development);
  if (expected.clientId) {
    expect(runtimeOptions.identity).toEqual({
      kind: 'did-web',
      clientId: expected.clientId,
      redirectUri: expected.redirectUri,
    });
  }
});
`;

/**
 * Checks the app's theme in a browser, then a theme whose muted text is
 * unreadable: the command must fail and name the role.
 */
function themeCheck(repo) {
  pnpmRun(repo, 'check:theme', FIXTURE);
  const theme = join(repo, 'apps', FIXTURE, 'src', 'themes', 'sage.css');
  const original = readFileSync(theme, 'utf8');
  // Exercise the recommended alternatives through the same installed checker.
  try {
    for (const name of ['fresh', 'warm']) {
      writeFileSync(theme, readFileSync(join(repo, 'apps', FIXTURE, 'src', 'themes', name + '.css')));
      pnpmRun(repo, 'check:theme', FIXTURE);
    }
  } finally { writeFileSync(theme, original); }
  const broken = original.replace(
    /--muted-foreground: light-dark\([^)]*\)/,
    '--muted-foreground: light-dark(#f4f4f5, #a1a7b0)',
  );
  if (broken === original) throw new Error('the sage theme sets no muted text');
  writeFileSync(theme, broken);
  try {
    const result = pnpm(['run', 'check:theme', FIXTURE], {
      cwd: repo,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (
      result.status !== 1 ||
      !/✗ apps\/self-test light:[\s\S]*Adjust muted-foreground/.test(
        result.stdout,
      ) ||
      !/✓ apps\/self-test dark/.test(result.stdout)
    )
      throw new Error(
        `check:theme did not fail on unreadable muted text:\n${result.stdout}${result.stderr}`,
      );
  } finally {
    writeFileSync(theme, original);
  }
  console.log('✓ theme check in light and dark, and a failing control');
}

const OWNER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#c2410c"/></svg>\n';

/**
 * Draws an owner's icon.svg in the tooling's browser and gives the app texts
 * the manifest carries: a translated name and a category.
 */
function ownerIcon(repo) {
  const dir = join(repo, 'apps', FIXTURE);
  writeFileSync(join(dir, 'icon.svg'), OWNER_SVG);
  const maskable = OWNER_SVG.replace('#c2410c', '#176354');
  writeFileSync(join(dir, 'icon-maskable.svg'), maskable);
  pnpmRun(repo, 'icon', FIXTURE);
  const pub = (file) => join(dir, 'public', file);
  if (readFileSync(pub('favicon.svg'), 'utf8') !== OWNER_SVG)
    throw new Error('icon did not take icon.svg as favicon.svg');
  for (const [file, size] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512],
    ['apple-touch-icon.png', 180],
  ]) {
    const png = readFileSync(pub(file));
    if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size)
      throw new Error(`icon drew ${file} in another size than ${size}`);
  }
  if (readFileSync(pub('icon-512.png')).equals(readFileSync(pub('icon-maskable-512.png'))))
    throw new Error('the maskable icon has no background of its own');
  const pictures = ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
  const before = pictures.map(file => readFileSync(pub(file)));
  // Regeneration is always from the immutable SVGs, not a previous PNG.
  for (let i = 0; i < 2; i++) {
    pnpmRun(repo, 'icon', FIXTURE);
    pictures.forEach((file, n) => assert.deepEqual(readFileSync(pub(file)), before[n]));
    assert.equal(readFileSync(join(dir, 'icon.svg'), 'utf8'), OWNER_SVG);
    assert.equal(readFileSync(join(dir, 'icon-maskable.svg'), 'utf8'), maskable);
  }
  const about = join(dir, 'app.json');
  writeJson(about, {
    ...readJson(about),
    name_localized: { de: 'Selbsttest' },
    categories: ['utilities'],
    description: 'A small test app.',
    description_localized: { de: 'Eine kleine Test-App.' },
  });
  pnpmRun(repo, 'regenerate');
  pnpmRun(repo, 'check', '--standalone', FIXTURE);
  console.log("✓ owner's icon drawn in the browser; texts and category in app.json");
}

// Exercise the shipped app, including CSS and JavaScript, without a real Pod.
async function appThemeCheck(repo) {
  const require = createRequire(
    realpathSync(join(repo, 'node_modules/@sempods/apps/package.json')),
  );
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const site = join(repo, 'site-dist');
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
  };
  try {
    for (const javascript of [false, true]) {
      const context = await browser.newContext({
        locale: 'de-DE',
        colorScheme: 'light',
        javaScriptEnabled: javascript,
        serviceWorkers: 'block',
      });
      await context.route('**/*', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const file = join(
          site,
          path.endsWith('/') ? path + 'index.html' : path,
        );
        if (!existsSync(file)) return route.abort();
        await route.fulfill({
          body: readFileSync(file),
          contentType: mime[extname(file)] ?? 'application/octet-stream',
        });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://localhost/${FIXTURE}/`);
      const meta = page.locator('meta[name="theme-color"][data-sempods-theme]');
      assert.equal(await meta.count(), 2);
      const splash = page.locator('#root > #splash');
      if (!javascript) {
        assert.equal(await meta.nth(0).getAttribute('content'), '#f7f9f7');
        assert.equal(await meta.nth(1).getAttribute('content'), '#131b18');
        // Before the bundle runs: the app's icon and name on its theme's
        // background, light or dark, without sign-in controls.
        assert.equal(await splash.locator('p').first().innerText(), 'Self test');
        assert.equal(await splash.getByRole('button').count(), 0);
        assert.equal(await splash.getByRole('status').count(), 1);
        const shown = () =>
          splash.evaluate((node) => ({
            background: getComputedStyle(node).backgroundColor,
            colour: getComputedStyle(node).color,
            icon: node.querySelector('img').naturalWidth > 0
              ? node.querySelector('img').getBoundingClientRect().width
              : 0,
          }));
        await splash.locator('img').evaluate((img) => img.decode());
        assert.deepEqual(await shown(), {
          background: 'rgb(247, 249, 247)',
          colour: 'rgb(38, 56, 47)',
          icon: 56,
        });
        await page.emulateMedia({ colorScheme: 'dark' });
        assert.deepEqual(await shown(), {
          background: 'rgb(19, 27, 24)',
          colour: 'rgb(229, 237, 232)',
          icon: 56,
        });
      } else {
        await page
          .getByRole('heading', { name: 'Selbsttest', exact: true })
          .waitFor();
        // React's first render replaced the splash.
        assert.equal(await page.locator('#splash').count(), 0);
        await page
          .getByText('Eine kleine Test-App.', { exact: true })
          .waitFor();
        assert.equal(await page.locator('html').getAttribute('lang'), 'de');
        const manifest = readJson(join(site, FIXTURE, 'manifest.webmanifest'));
        const touch = page.locator('link[rel="apple-touch-icon"]');
        assert.equal(await touch.count(), 1);
        const icons = [...manifest.icons, { src: await touch.getAttribute('href'), purpose: 'touch' }];
        for (const icon of icons) {
          assert.match(icon.src, /\/sempods-icons\/[^/]+-[a-f0-9]{16}\.png$/);
          const pixels = await page.evaluate(async (url) => {
            const image = new Image(); image.src = url; await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const size = canvas.width;
            const at = (x, y) => Array.from(data.slice(4 * (y * size + x), 4 * (y * size + x) + 4));
            let opaque = true, safe = true, left = size, right = 0;
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
              const i = 4 * (y * size + x);
              if (data[i + 3] !== 255) opaque = false;
              // The two fixture marks are orange and green; background is sage.
              const mark = data[i + 3] > 128 && data[i] < 220;
              if (mark) {
                left = Math.min(left, x); right = Math.max(right, x);
                if (Math.hypot(x + .5 - size / 2, y + .5 - size / 2) > size * .4) safe = false;
              }
            }
            return { size, corner: at(0, 0), centre: at(Math.floor(size / 2), Math.floor(size / 2)), opaque, safe, coverage: (right - left + 1) / size };
          }, icon.src);
          assert.equal(pixels.size, icon.purpose === 'touch' ? 180 : Number(icon.sizes.split('x')[0]));
          assert.ok(Math.abs(pixels.coverage - .6) < .02, JSON.stringify(pixels));
          assert.equal(pixels.safe, true);
          if (icon.purpose === 'any') {
            assert.equal(pixels.corner[3], 0);
            assert.deepEqual(pixels.centre, [194, 65, 12, 255]);
          } else {
            assert.equal(pixels.opaque, true);
            assert.deepEqual(pixels.corner, [247, 249, 247, 255]);
            assert.deepEqual(pixels.centre, [23, 99, 84, 255]);
          }
          // The worker precaches the hashed URL used by the installed app.
          assert.ok(readFileSync(join(site, FIXTURE, 'sw.js'), 'utf8').includes(icon.src.split('/').at(-1)));
        }

        const expectChrome = async (colour) => {
          await page
            .waitForFunction(
              (expected) =>
                [
                  ...document.querySelectorAll(
                    'meta[name="theme-color"][data-sempods-theme]',
                  ),
                ].every((meta) => meta.content === expected),
              colour,
            )
            .catch(async (cause) => {
              throw new Error(
                `Theme expected ${colour}, got ${await meta.evaluateAll((items) => items.map((item) => item.content))}; errors: ${errors.join('; ')}`,
                { cause },
              );
            });
        };
        const appearance = async (colorScheme) => {
          await page.evaluate(() => {
            window.themeChanged = new Promise((resolve) =>
              matchMedia('(prefers-color-scheme: dark)').addEventListener(
                'change',
                () => resolve(),
                { once: true },
              ),
            );
          });
          await page.emulateMedia({ colorScheme });
          await page.evaluate(() => window.themeChanged);
        };
        await expectChrome('rgb(247, 249, 247)');
        await appearance('dark');
        await expectChrome('rgb(19, 27, 24)');
        // An explicit app preference wins over the device. A custom palette
        // resolves through CSS, rather than a second list of colour constants.
        await page.evaluate(() => {
          document.documentElement.style.colorScheme = 'light';
        });
        await appearance('light');
        await expectChrome('rgb(247, 249, 247)');
        await appearance('dark');
        await expectChrome('rgb(247, 249, 247)');
        await page.evaluate(() => {
          document.documentElement.style.setProperty('--background', '#fef8ee');
          const owned = document.querySelector('meta[name="theme-color"]');
          owned.removeAttribute('data-sempods-theme');
          owned.content = '#123456';
        });
        await appearance('light');
        await expectChrome('rgb(254, 248, 238)');
        assert.equal(
          await page
            .locator('meta[name="theme-color"]')
            .first()
            .getAttribute('content'),
          '#123456',
        );
        assert.deepEqual(errors, []);
      }
      await context.close();
    }
    console.log(
      '✓ built app: startup splash, localized identity, static theme colours, system/explicit appearance and owner overrides',
    );
  } finally {
    await browser.close();
  }
}

/**
 * Opens the built overview in Chromium, as a visitor with a German browser:
 * the list launches apps directly, Details opens the secondary view, and
 * language choice, narrow screens and no-script navigation keep working.
 */
async function overviewCheck(repo) {
  const require = createRequire(
    realpathSync(join(repo, 'node_modules/@sempods/apps/package.json')),
  );
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const url = pathToFileURL(join(repo, 'site-dist', 'index.html')).href;
    const page = await browser.newPage({ locale: 'de-DE' });
    await page.goto(url);
    const row = page.locator('.app-row').first();
    if ((await row.locator('h2').innerText()) !== 'Selbsttest')
      throw new Error('the overview does not show the German name');
    for (const selector of ['.launch', '.open']) {
      const link = row.locator(selector);
      if ((await link.getAttribute('href')) !== `/${FIXTURE}/` ||
          (await link.getAttribute('target')) !== '_blank')
        throw new Error('the overview does not launch the app in a new tab');
    }
    await row.locator('.details-link').click();
    const detail = page.locator(`#${FIXTURE}`);
    if (!(await detail.isVisible()) || await page.locator('.apps').isVisible())
      throw new Error('Details does not replace the list with the detail view');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    if ((await detail.locator('h1').innerText()) !== 'Self test')
      throw new Error('the switch does not change the language');
    const install = detail.locator('.install');
    if (await install.evaluate((el) => el.open))
      throw new Error('installation help should start collapsed');
    await install.locator('summary').click();
    if (!(await install.evaluate((el) => el.open)))
      throw new Error('installation help does not expand');
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error(`the detail view overflows at ${width}px`);
      await detail.locator('.back').click();
      if (!(await page.locator('.apps').isVisible()) ||
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error(`the app list does not fit at ${width}px`);
      await row.locator('.details-link').click();
    }
    await page.reload();
    if ((await page.locator('html').getAttribute('lang')) !== 'en')
      throw new Error('the language choice was not remembered');
    await page.close();
    const plain = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
    await plain.goto(`${url}#${FIXTURE}`);
    if (!(await plain.locator(`#${FIXTURE}`).isVisible()))
      throw new Error('a direct detail link fails without script');
    await plain.locator(`#${FIXTURE} .install summary`).click();
    if (!(await plain.locator(`#${FIXTURE} .install`).evaluate((el) => el.open)))
      throw new Error('installation help fails without script');
    await plain.locator(`#${FIXTURE} .back`).click();
    if (!(await plain.locator('.apps').isVisible()))
      throw new Error('returning to the list fails without script');
    await plain.close();
    console.log('✓ overview launches apps, opens details and works on mobile without script');
  } finally {
    await browser.close();
  }
}

// A page that renders the skeleton's example screens with the SDK's own
// components and synthetic hooks (no Pod): three short rows, the issue's
// name with an unconfirmed deletion and an unbroken long name.
const EXAMPLES_PAGE = {
  'index.html': `<!doctype html>
<html lang="en" data-actions="inverted" data-secondary="text">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
  </head>
  <body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
`,
  'main.tsx': `import '../src/index.css';
import { createRoot } from 'react-dom/client';
import { createBrowserRuntime } from '@sempods/app-sdk';
import { SempodsProvider, useMounted } from '@sempods/app-sdk/react';
import { useNav } from '@sempods/app-ui';
import { places } from '../src/places.ts';
import { runtimeOptions } from '../src/sempods.generated.ts';
import { CollectionScreen } from '../src/examples/CollectionScreen.tsx';
import { ListScreen } from '../src/examples/ListScreen.tsx';
import { LogScreen } from '../src/examples/LogScreen.tsx';

const runtime = createBrowserRuntime(runtimeOptions);
const screens = { list: ListScreen, log: LogScreen, collection: CollectionScreen };
const Screen = screens[new URLSearchParams(location.search).get('screen') as keyof typeof screens];
function Check() {
  const nav = useNav(places);
  const mounted = useMounted();
  return <main className="mx-auto max-w-3xl p-4">{mounted && <Screen nav={nav} />}</main>;
}
createRoot(document.getElementById('root')!).render(
  <SempodsProvider runtime={runtime} language="en"><Check /></SempodsProvider>,
);
`,
  // The rows live in a small store the check drives through `sdkCheck`:
  // a row update stays pending until the check answers it.
  'sdk.ts': `import { useSyncExternalStore } from 'react';
export * from 'sempods-sdk-react';
const context = 'https://pod.example/lists/1/';
const names = ['Milk', 'Geschirrspülmaschinentabs', '${'Vorratspackung'.repeat(4)}', 'Bread'];
type Data = { name: string; done: boolean; day: string; text: string };
type Row = { snapshot: { iri: string; data: Data }; shown?: Data; asked?: Partial<Data>; canMutate: boolean; outcome: { kind: string } | null };
const idle = { outcome: null, checked: false, current: undefined, unreadable: false, onCheck: async () => false, onAcknowledge: () => {} };
const unconfirmed = { kind: 'unconfirmed', current: undefined, desiredObserved: false };
const notSent = async () => ({ kind: 'not-sent' });
let rows: Row[] = names.map((name, n) => ({
  snapshot: { iri: context + 'item-' + n, data: { name, done: n === 0, day: '2026-11-16', text: 'A short text.' } },
  canMutate: n !== 1,
  outcome: n === 1 ? unconfirmed : null,
}));
let key = 'target-1';
let mounted = true;
let version = 0;
const listeners = new Set<() => void>();
const change = (apply: () => void) => {
  apply();
  version++;
  listeners.forEach((listener) => listener());
};
const useVersion = () =>
  useSyncExternalStore((listener) => (listeners.add(listener), () => listeners.delete(listener)), () => version);
const set = (iri: string, patch: Partial<Row>) => {
  rows = rows.map((row) => (row.snapshot.iri === iri ? { ...row, ...patch } : row));
};
const answers = new Map<string, (outcome: unknown) => void>();
const calls: string[] = [];
Object.assign(window, {
  sdkCheck: {
    calls,
    // A confirmed update shows its values at once and spends the snapshot
    // until the list reads again; any other outcome shows in the notice.
    answer(iri: string, outcome: { kind: string }) {
      const row = rows.find((row) => row.snapshot.iri === iri)!;
      change(() =>
        outcome.kind === 'saved'
          ? set(iri, { shown: { ...(row.shown ?? row.snapshot.data), ...row.asked }, outcome })
          : set(iri, { canMutate: outcome.kind === 'not-saved', outcome }),
      );
      answers.get(iri)!(outcome);
      answers.delete(iri);
    },
    // The list reads again: fresh snapshots, spent rows usable again.
    refresh() {
      change(() => {
        rows = rows.map((row) => ({
          ...row,
          snapshot: { iri: row.snapshot.iri, data: row.shown ?? row.snapshot.data },
          shown: undefined,
          canMutate: row.canMutate || (row.outcome?.kind === 'saved' && !answers.has(row.snapshot.iri)),
        }));
      });
    },
    target: (next: string) => change(() => (key = next)),
    mount: (next: boolean) => change(() => (mounted = next)),
  },
});
export const useMounted = () => (useVersion(), mounted);
export const useAppState = () => (useVersion(), { view: { contextIri: context, key }, changing: false });
export const useWorkflowAccess = () => ({ write: true });
export const useList = () => {
  useVersion();
  return { state: { kind: 'ready' }, data: { items: rows.map((row) => row.snapshot), skipped: 0 }, reload: async () => {} };
};
export const useFieldUpdate = () => {
  useVersion();
  return {
    unresolved: [],
    for: (entry: Row['snapshot']) => {
      const row = rows.find((row) => row.snapshot.iri === entry.iri)!;
      return {
        data: row.shown ?? entry.data,
        canMutate: row.canMutate && !row.shown,
        notice: { ...idle, outcome: row.outcome },
        update: (asked: Partial<Data>) => {
          calls.push(entry.iri);
          change(() => set(entry.iri, { canMutate: false, asked, outcome: null }));
          return new Promise((resolve) => answers.set(entry.iri, resolve));
        },
        remove: notSent,
      };
    },
  };
};
export const useCreation = () => ({ draft: rows[0].snapshot.data, canCreate: false, canEdit: true, busy: false, change: () => {}, create: notSent, notice: idle });
export const useContextEditor = () => ({ open: async () => {}, close: async () => true, target: null, editor: null, phase: 'idle' });
`,
  'vite.config.ts': `import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
// The app's directory is the root, so Tailwind finds the classes in src/.
export default defineConfig({
  root: here('..'),
  base: './',
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: here('./dist'),
    cssTarget: 'esnext',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: here('./index.html') },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@sempods\\/app-sdk\\/react$/, replacement: here('./sdk.ts') },
      { find: 'sempods-sdk-react', replacement: fileURLToPath(import.meta.resolve('@sempods/app-sdk/react')) },
    ],
  },
});
`,
};

/**
 * The example screens keep a row's recovery notice readable (#180): with a
 * long name and an unconfirmed deletion, the notice takes the row's or
 * card's full width at 375px and on desktop, light and dark; its actions
 * and the row's controls keep 44px targets, and rows without a notice keep
 * their height.
 */
async function examplesCheck(repo) {
  const app = join(repo, 'apps', FIXTURE);
  const dir = join(app, 'examples-check');
  mkdirSync(dir);
  for (const [file, source] of Object.entries(EXAMPLES_PAGE))
    writeFileSync(join(dir, file), source);
  const require = createRequire(
    realpathSync(join(repo, 'node_modules/@sempods/apps/package.json')),
  );
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    run('pnpm', ['exec', 'vite', 'build', '--config', 'examples-check/vite.config.ts'], app);
    const dist = join(dir, 'dist');
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    const open = async (screen, options) => {
      const context = await browser.newContext(options);
      await context.route('**/*', async (route) => {
        const file = join(dist, new URL(route.request().url()).pathname);
        if (!existsSync(file)) return route.abort();
        await route.fulfill({ body: readFileSync(file), contentType: mime[extname(file)] });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://localhost/examples-check/index.html?screen=${screen}`);
      return { context, page, errors };
    };
    const backgrounds = new Set();
    for (const screen of ['list', 'log', 'collection'])
      for (const [width, height] of [[375, 812], [1280, 800]])
        for (const colorScheme of ['light', 'dark']) {
          const where = `${screen} at ${width}px, ${colorScheme}`;
          const { context, page, errors } = await open(screen, { viewport: { width, height }, colorScheme });
          const check = page.getByRole('button', { name: 'Check current version' });
          await check.waitFor();
          const shown = await page.evaluate(() => {
            const box = (el) => el.getBoundingClientRect().toJSON();
            const row = (name) => [...document.querySelectorAll('li')].find((li) => li.querySelector('a')?.textContent.startsWith(name));
            const uncertain = row('Geschirrspülmaschinentabs');
            const long = row([...document.querySelectorAll('li a')].map((a) => a.textContent).find((name) => name.length > 40));
            const notice = uncertain.querySelector('section');
            // Colours as sRGB bytes, whatever notation the style resolves to.
            const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
            const rgb = (colour) => {
              canvas.clearRect(0, 0, 1, 1);
              canvas.fillStyle = colour;
              canvas.fillRect(0, 0, 1, 1);
              return [...canvas.getImageData(0, 0, 1, 1).data.slice(0, 3)];
            };
            return {
              overflow: document.documentElement.scrollWidth - innerWidth,
              row: box(uncertain),
              notice: box(notice),
              buttons: [...uncertain.querySelectorAll('button')].map(box),
              link: box(uncertain.querySelector('a')),
              longLink: box(long.querySelector('a')),
              longRemove: box(long.querySelector('button')),
              plain: box(row('Bread')),
              checkbox: document.querySelector('[data-slot="checkbox"]') && (() => {
                const target = box(document.querySelector('[data-slot="checkbox"]'));
                const x = target.x + target.width / 2, y = target.y + target.height / 2;
                const hit = (dx, dy) => !!document.elementFromPoint(x + dx, y + dy)?.closest('[data-slot="checkbox"]');
                return hit(-21, 0) && hit(21, 0) && hit(0, -21) && hit(0, 21);
              })(),
              text: rgb(getComputedStyle(notice).color),
              background: rgb(getComputedStyle(document.body).backgroundColor),
            };
          });
          if (errors.length) throw new Error(`${where}: ${errors.join('; ')}`);
          if (shown.overflow > 0) throw new Error(`${where}: the page scrolls sideways`);
          // The card keeps its padding; a row's notice spans the row.
          if (shown.notice.width < shown.row.width - 40)
            throw new Error(`${where}: the notice is ${Math.round(shown.notice.width)}px wide in a ${Math.round(shown.row.width)}px row`);
          for (const button of shown.buttons)
            if (button.width < 44 || button.height < 44 || button.right > width)
              throw new Error(`${where}: a control of the row is smaller than 44px or off screen`);
          if (screen !== 'collection') {
            const middle = (box) => box.y + box.height / 2;
            if (Math.abs(middle(shown.longLink) - middle(shown.longRemove)) > 1 || shown.longLink.right > shown.longRemove.x)
              throw new Error(`${where}: a long name pushes Delete off its line`);
            if (shown.plain.height > 56)
              throw new Error(`${where}: a row without a notice grew to ${shown.plain.height}px`);
          }
          if (screen === 'list' && !shown.checkbox)
            throw new Error(`${where}: the checkbox has no 44px target`);
          const luminance = (rgb) => {
            const [r, g, b] = rgb.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const [light, dark] = [luminance(shown.text), luminance(shown.background)].sort((a, b) => b - a);
          if ((light + 0.05) / (dark + 0.05) < 4.5)
            throw new Error(`${where}: the notice's text lacks contrast`);
          backgrounds.add(shown.background.join());
          await check.scrollIntoViewIfNeeded();
          if (!(await check.isVisible())) throw new Error(`${where}: Check current version is not reachable`);
          await context.close();
        }
    if (backgrounds.size !== 2) throw new Error('the examples do not follow light and dark');
    console.log('✓ example screens: full-width row notices with long names at 375px and on desktop, light and dark');
    for (const options of [{ colorScheme: 'light' }, { colorScheme: 'dark' }, { colorScheme: 'light', reducedMotion: 'reduce' }]) {
      const where = `list ticks at 375px, ${options.colorScheme}${options.reducedMotion ? ', reduced motion' : ''}`;
      const { context, page, errors } = await open('list', { viewport: { width: 375, height: 812 }, ...options });
      await tickCheck(page, where, Boolean(options.reducedMotion));
      if (errors.length) throw new Error(`${where}: ${errors.join('; ')}`);
      await context.close();
    }
    console.log('✓ list example: immediate ticks, a confirmed exit, other outcomes and unmounting at 375px, light and dark, also with reduced motion');
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The list example's ticks (#188) against the synthetic hooks of
 * EXAMPLES_PAGE: a tick shows at once and is sent once; only a confirmed
 * write moves the row to Done, after a short exit that a list read does not
 * end early (at once with reduced motion); a refused or unconfirmed write
 * drops the tick and shows its notice; rows tick side by side, back and
 * forth; focus moves on from a leaving row; and a tick of an earlier target
 * or an unmounted screen ends without effect.
 */
async function tickCheck(page, where, reduced) {
  const long = 'Vorratspackung'.repeat(4);
  const row = (name) => page.locator('li', { has: page.getByRole('link', { name, exact: true }) });
  const press = (name) => row(name).locator('[data-slot="checkbox"]').click();
  // Items by name, as the rows show them before the screen unmounts.
  const iris = {};
  for (const name of ['Bread', long]) iris[name] = await row(name).getAttribute('data-item');
  const answer = (name, outcome) =>
    page.evaluate(([iri, outcome]) => window.sdkCheck.answer(iri, outcome), [iris[name], outcome]);
  const refresh = () => page.evaluate(() => window.sdkCheck.refresh());
  const calls = () => page.evaluate(() => window.sdkCheck.calls.length);
  // Where a row is: its group (0 open, 1 done), whether it is leaving,
  // ticked and saving, and its buttons.
  const state = (name) =>
    page.evaluate((name) => {
      const li = [...document.querySelectorAll('li')].find((li) => li.querySelector('a')?.textContent === name);
      return {
        group: [...document.querySelectorAll('ul')].indexOf(li.parentElement),
        leaving: li.inert,
        ticked: li.querySelector('input[type="checkbox"]').checked,
        saving: li.querySelector('[role="status"]').textContent,
        buttons: [...li.querySelectorAll('button')].map((button) => button.textContent || button.getAttribute('aria-label')),
      };
    }, name);
  // Waits up to 150 ms (less than the exit) for a row to show `expected`.
  const expect = async (name, expected, step) => {
    for (let tries = 0; ; tries++) {
      const shown = await state(name);
      const wrong = Object.keys(expected).find((key) => JSON.stringify(shown[key]) !== JSON.stringify(expected[key]));
      if (!wrong) return;
      if (tries === 15)
        throw new Error(`${where}, ${step}: ${name} has ${wrong} ${JSON.stringify(shown[wrong])}, expected ${JSON.stringify(expected[wrong])}`);
      await page.waitForTimeout(10);
    }
  };
  // Waits out the exit, then a frame.
  const settled = () => page.waitForTimeout(400);

  // A press ticks at once, saves once and leaves the other rows usable.
  await press('Bread');
  await expect('Bread', { group: 0, leaving: false, ticked: true, saving: 'Saving: Bread', buttons: [] }, 'pending');
  await press('Bread');
  await expect('Bread', { ticked: true, saving: 'Saving: Bread' }, 'pressed again');
  await press(long);
  if ((await calls()) !== 2) throw new Error(`${where}: a pending tick was sent again`);
  await expect(long, { ticked: true, saving: `Saving: ${long}` }, 'a second row');
  // A refusal drops the tick and shows the row's notice.
  await answer(long, { kind: 'not-saved', reason: 'refused', problem: { kind: 'refused', status: 403 } });
  await expect(long, { group: 0, leaving: false, ticked: false, saving: '' }, 'refused');
  if (!(await row(long).locator('section').count())) throw new Error(`${where}: a refused tick shows no notice`);
  await expect('Bread', { ticked: true, saving: 'Saving: Bread' }, 'beside a refusal');
  // A confirmed tick leaves, also while the list reads again.
  await answer('Bread', { kind: 'saved' });
  await refresh();
  if (!reduced) await expect('Bread', { group: 0, leaving: true, ticked: true, saving: '' }, 'leaving');
  else await expect('Bread', { group: 1, leaving: false, ticked: true }, 'saved without motion');
  await settled();
  await expect('Bread', { group: 1, leaving: false, ticked: true, saving: '' }, 'saved');
  // Back again from Done, by keyboard: the focus stays while it saves and
  // moves on to the next usable checkbox when the row leaves.
  await row('Bread').getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  await expect('Bread', { group: 1, ticked: false, saving: 'Saving: Bread' }, 'unticked');
  if (!(await row('Bread').getByRole('checkbox').evaluate((input) => input === document.activeElement)))
    throw new Error(`${where}: a pending tick lost the focus`);
  await answer('Bread', { kind: 'saved' });
  await settled();
  await expect('Bread', { group: 0, leaving: false, ticked: false }, 'unticked and saved');
  if (!(await row('Milk').getByRole('checkbox').evaluate((input) => input === document.activeElement)))
    throw new Error(`${where}: the focus did not move on from a leaving row`);
  await refresh();
  // An unconfirmed write drops the tick and keeps its recovery.
  await press(long);
  await answer(long, { kind: 'unconfirmed', current: undefined, desiredObserved: false });
  await expect(long, { group: 0, leaving: false, ticked: false, saving: '' }, 'unconfirmed');
  if (!(await row(long).getByRole('button', { name: 'Check current version' }).count()))
    throw new Error(`${where}: an unconfirmed tick hides its recovery`);
  // A tick of an unmounted screen or an earlier target ends without effect.
  await press('Bread');
  await page.evaluate(() => window.sdkCheck.mount(false));
  await answer('Bread', { kind: 'saved' });
  await page.evaluate(() => window.sdkCheck.mount(true));
  await expect('Bread', { group: 1, leaving: false, ticked: true, saving: '' }, 'saved while unmounted');
  await refresh();
  await press('Bread');
  await page.evaluate(() => window.sdkCheck.target('target-2'));
  await expect('Bread', { group: 1, ticked: true, saving: '' }, 'another target');
  await answer('Bread', { kind: 'saved' });
  await expect('Bread', { group: 0, leaving: false, ticked: false }, 'saved for an earlier target');
  await settled();
  // The only usable open row passes the focus on to the Done group.
  await refresh();
  await row('Bread').getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  await answer('Bread', { kind: 'saved' });
  await settled();
  await expect('Bread', { group: 1, leaving: false, ticked: true }, 'the last open row');
  if (!(await row('Milk').getByRole('checkbox').evaluate((input) => input === document.activeElement)))
    throw new Error(`${where}: the focus did not move on from the last open row`);
}

/**
 * The built app takes only browser code from the tooling: its theme helper,
 * none of the Vite plugin's Node modules.
 */
function bundleCheck(repo) {
  const assets = join(repo, 'site-dist', FIXTURE, 'assets');
  const scripts = readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => [name, readFileSync(join(assets, name), 'utf8')]);
  if (!scripts.length) throw new Error('the built app has no script');
  for (const [name, code] of scripts)
    for (const node of [/["'`]node:/, /\breadFileSync\b/, /\bcreateHash\b/])
      if (node.test(code))
        throw new Error(`assets/${name} contains Node code (${node})`);
  if (!scripts.some(([, code]) => code.includes('data-sempods-theme')))
    throw new Error('the built app does not contain the shared theme helper');
  console.log('✓ built app bundles the theme helper and no Node modules');
}

/** Configures a site, builds it for real and checks the profiles. */
function publish(repo) {
  const dir = join(repo, 'apps', FIXTURE);
  const production = 'https://apps.example.org';
  const preview = 'https://preview--apps.example.org';
  // check built the local profile into dist/; build-site must leave it there.
  const assets = (path) => readdirSync(join(path, 'assets')).sort();
  const localBuild = assets(join(dir, 'dist')).join();
  // One real build; the layout is covered by build-site's tests.
  pnpmRun(
    repo,
    'configure-site',
    '--production',
    production,
    '--preview',
    preview,
  );
  pnpmRun(repo, 'build-site');
  const site = join(repo, 'site-dist');
  for (const file of [
    'index.html',
    '404.html',
    `${FIXTURE}/index.html`,
    `${FIXTURE}/callback.html`,
    `${FIXTURE}/sw.js`,
    `${FIXTURE}/manifest.webmanifest`,
    `${FIXTURE}/app.jsonld`,
    `${FIXTURE}/client.json`,
    `${FIXTURE}/build.json`,
    'apps.jsonld',
    '_headers',
    `${FIXTURE}/licenses/app-sdk/NOTICE`,
    `${FIXTURE}/licenses/app-ui/NOTICE`,
  ])
    if (!existsSync(join(site, file)))
      throw new Error(`build-site wrote no ${file}`);
  // The plugin keeps the members its types do not know yet, and the
  // manifest names the language of its texts.
  const manifest = readJson(join(site, FIXTURE, 'manifest.webmanifest'));
  const expected = {
    lang: 'en',
    name: 'Self test',
    name_localized: { de: 'Selbsttest' },
    categories: ['utilities'],
    theme_color: '#3e6b56',
  };
  for (const [key, value] of Object.entries(expected))
    if (JSON.stringify(manifest[key]) !== JSON.stringify(value))
      throw new Error(
        `the built manifest has ${key} ${JSON.stringify(manifest[key])}, not ${JSON.stringify(value)}`,
      );
  if (!manifest.icons?.some((icon) => icon.purpose === 'maskable'))
    throw new Error('the built manifest names no maskable icon');
  if (!existsSync(join(site, FIXTURE, 'icon-maskable-512.png')))
    throw new Error('build-site wrote no maskable icon');
  const did = readJson(join(site, FIXTURE, 'did.json'));
  if (did.id !== `did:web:apps.example.org:${FIXTURE}`)
    throw new Error(`unexpected did.json id ${did.id}`);
  // The published descriptions name the app by its IRI, and build.json lists
  // every file the real build wrote, with its digest.
  const iri = `${production}/${FIXTURE}/`;
  const description = readJson(join(site, FIXTURE, 'app.jsonld'));
  if (
    description['@id'] !== iri ||
    description.name?.de !== 'Selbsttest' ||
    !description.identifier?.includes(did.id)
  )
    throw new Error(`unexpected app.jsonld ${JSON.stringify(description)}`);
  if (readJson(join(site, FIXTURE, 'client.json')).client_uri !== iri)
    throw new Error('client.json names another app');
  if (!readFileSync(join(site, FIXTURE, 'index.html'), 'utf8').includes(`href="/${FIXTURE}/app.jsonld"`))
    throw new Error('the app page does not link its description');
  // The overview shows the app as its description has it.
  const overview = readFileSync(join(site, 'index.html'), 'utf8');
  for (const part of [
    '<html lang="en" data-languages="en de">',
    `<a class="details-link" href="#${FIXTURE}">`,
    `<a class="open" href="/${FIXTURE}/" target="_blank" rel="noopener noreferrer">`,
    `<article class="detail" id="${FIXTURE}">`,
    '<details class="install">',
  ])
    if (!overview.includes(part)) throw new Error(`the overview has no ${part}`);
  const listed = readJson(join(site, FIXTURE, 'build.json')).files;
  const built = readdirSync(join(site, FIXTURE), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== 'build.json')
    .map((entry) => `/${FIXTURE}/${relative(join(site, FIXTURE), join(entry.parentPath, entry.name)).split(sep).join('/')}`)
    .sort();
  if (JSON.stringify(listed.map((entry) => entry.path).sort()) !== JSON.stringify(built))
    throw new Error('build.json does not list exactly the built files');
  for (const { path, sha256 } of listed)
    if (createHash('sha256').update(readFileSync(join(site, path))).digest('hex') !== sha256)
      throw new Error(`build.json has another digest for ${path}`);
  if (assets(join(dir, 'dist')).join() !== localBuild)
    throw new Error('build-site changed the local build in dist/');
  // The shipped bundle itself must select the profile: Vite inlines the build
  // mode as the key that picks it (`production` in a plain build).
  const SELECTS_PRODUCTION = /\[\s*[`'"]sempods-production[`'"]\s*\]/;
  const selects = (path) =>
    assets(path)
      .filter((file) => file.endsWith('.js'))
      .some((file) =>
        SELECTS_PRODUCTION.test(
          readFileSync(join(path, 'assets', file), 'utf8'),
        ),
      );
  if (!selects(join(site, FIXTURE)))
    throw new Error('the site bundle does not select the production profile');
  if (selects(join(dir, 'dist')))
    throw new Error('the local bundle selects a published profile');

  const test = join(dir, 'src', 'site-profile.test.ts');
  writeFileSync(test, PROFILE_TEST);
  const callback = (origin) => `${origin}/${FIXTURE}/callback`;
  const cases = [
    [[], { profile: 'local', kind: 'dynamic', development: 'loopback-http' }],
    [
      ['--mode', 'sempods-production'],
      {
        profile: 'production',
        kind: 'did-web',
        clientId: `did:web:apps.example.org:${FIXTURE}`,
        redirectUri: callback(production),
      },
    ],
    [
      ['--mode', 'sempods-preview'],
      {
        profile: 'preview',
        kind: 'did-web',
        clientId: `did:web:preview--apps.example.org:${FIXTURE}`,
        redirectUri: callback(preview),
      },
    ],
  ];
  try {
    for (const [args, expected] of cases) {
      const result = pnpm(
        ['exec', 'vitest', 'run', 'src/site-profile.test.ts', ...args],
        {
          cwd: dir,
          env: { ...process.env, SEMPODS_EXPECTED: JSON.stringify(expected) },
        },
      );
      if (result.status !== 0)
        throw new Error(`the ${expected.profile} profile was not selected`);
    }
  } finally {
    rmSync(test);
  }
  console.log('✓ site build and profile selection');
}

/** Customizes the repository, then migrates it to a later starter. */
function migrateExercise(repo, work, tooling) {
  const { sections } = readJson(join(TOOLING, 'update-policy.json'));
  const [OWNER] = sections['AGENTS.md'];
  const [RECORD] = sections['INIT.md'];
  const text = (root, file) => readFileSync(join(root, file), 'utf8');
  const edit = (root, file, change) =>
    writeFileSync(join(root, file), change(text(root, file)));
  const span = (file, [begin, end]) => {
    const value = text(repo, file);
    return value.slice(value.indexOf(begin), value.indexOf(end) + end.length);
  };
  edit(repo, 'AGENTS.md', (value) =>
    value.replace(
      'No instance-specific instructions recorded yet.',
      'Answer in German.',
    ),
  );
  edit(repo, 'INIT.md', (value) =>
    value.replace('- Status: not started', '- Status: done'),
  );
  edit(repo, 'docs/start.md', (value) => `${value}\nOwner addition.\n`);
  const owner = span('AGENTS.md', OWNER);
  const record = span('INIT.md', RECORD);

  // A later version whose starter changes the template part of AGENTS.md.
  const { version } = readJson(join(TOOLING, 'package.json'));
  // Newer than the current version, also when that is a final release.
  const next = semver.inc(version, 'patch');
  const later = join(work, 'later');
  cpSync(TOOLING, later, {
    recursive: true,
    filter: (src) =>
      !/[\\/](node_modules|shared)([\\/]|$)/.test(src.slice(TOOLING.length)),
  });
  writeJson(join(later, 'package.json'), {
    ...readJson(join(later, 'package.json')),
    version: next,
  });
  edit(later, 'starter/AGENTS.md', (value) =>
    value.replace(
      'Scope: the whole repository.',
      'Scope: the whole repository and every app in it.',
    ),
  );
  // The owner appended to docs/start.md too: a manual case.
  edit(later, 'starter/docs/start.md', (value) => `${value}\nStarter addition.\n`);
  const laterTarball = pack(later, work);

  // What `pnpm run update` installs: the later version for the root only;
  // the apps still declare the earlier one until migrate moves them.
  const manifest = readJson(join(repo, 'package.json'));
  manifest.devDependencies['@sempods/apps'] = next;
  writeJson(join(repo, 'package.json'), manifest);
  const workspace = readFileSync(join(repo, 'pnpm-workspace.yaml'), 'utf8');
  writeFileSync(
    join(repo, 'pnpm-workspace.yaml'),
    workspace.replace(
      `'@sempods/apps': ${JSON.stringify(`file:${tooling}`)}`,
      `'@sempods/apps': ${JSON.stringify(`file:${laterTarball}`)}`,
    ),
  );
  run('pnpm', [...INSTALL], repo);
  // The baseline's version is not on the registry: take its tarball.
  process.env.SEMPODS_APPS_PACKAGES = dirname(tooling);
  const open = pnpm(['run', 'migrate'], {
    cwd: repo,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  if (
    open.status !== 3 ||
    !/docs\/start\.md: changed here and by the starter/.test(open.stdout)
  )
    throw new Error(
      `migrate did not leave docs/start.md as a manual case:\n${open.stdout}${open.stderr}`,
    );
  // The assistant's decision: both additions.
  edit(repo, 'docs/start.md', (value) => `${value}Starter addition.\n`);
  run('pnpm', ['run', 'migrate', '--done'], repo);
  const installed = join(repo, 'node_modules', '@sempods', 'apps');
  const { revision } = readSnapshot(join(installed, 'shared'));
  const baseline = readBaseline(repo);
  if (baseline.version !== next || baseline.revision !== revision)
    throw new Error('migrate did not advance the baseline to the later starter');
  if (!text(repo, 'AGENTS.md').includes('and every app in it.'))
    throw new Error('migrate did not apply the starter change');
  if (span('AGENTS.md', OWNER) !== owner || span('INIT.md', RECORD) !== record)
    throw new Error('migrate changed the owner section or the setup record');
  if (!/Owner addition\.\nStarter addition\./.test(text(repo, 'docs/start.md')))
    throw new Error('migrate --done did not keep the decided docs/start.md');
  if (existsSync(join(repo, '.sempods-migration')))
    throw new Error('migrate --done left .sempods-migration/ behind');
  const app = readJson(join(repo, 'apps', FIXTURE, 'package.json'));
  if (app.devDependencies['@sempods/apps'] !== next)
    throw new Error('migrate did not move the app to the later tooling');
  pnpmRun(repo, 'check');
  console.log('✓ migrate applies a later starter and keeps owner content');
}

const work = mkdtempSync(join(tmpdir(), 'sempods-self-test-'));
let failed = false;
try {
  const tooling = pack(TOOLING, work);
  const creator = pack(CREATOR, work);
  const listed = run('tar', ['-tzf', tooling], work, true)
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(/^package\//, ''));
  const missing = REQUIRED.filter((file) => !listed.includes(file));
  const leaked = listed.filter((file) =>
    EXCLUDED.some((prefix) => file.startsWith(prefix)),
  );
  if (missing.length || leaked.length)
    throw new Error(
      `tarball: missing ${missing.join(', ') || 'nothing'}; must not contain ${leaked.join(', ') || 'nothing'}`,
    );
  console.log(`✓ tarball contents (${listed.length} files)`);
  const unpacked = unpack(tooling, join(work, 'unpacked'));
  const revision = checkSnapshot(unpacked, 'tarball snapshot');
  // Packaged instructions and skills link only within the package.
  if (!(await checkLinks(unpacked)))
    throw new Error('links in the packed package do not resolve');
  console.log('✓ links inside the package');

  // pnpm create @sempods/apps runs the creator with its exact @sempods/apps.
  const runner = join(work, 'runner', 'node_modules', '@sempods');
  cpSync(unpack(tooling, join(work, 'u-apps')), join(runner, 'apps'), {
    recursive: true,
  });
  cpSync(unpack(creator, join(work, 'u-create')), join(runner, 'create-apps'), {
    recursive: true,
  });
  const repo = join(work, 'my-apps');
  run(process.execPath, [join(runner, 'create-apps', 'index.mjs'), repo], work);
  const { version } = readJson(join(TOOLING, 'package.json'));
  const baseline = readBaseline(repo);
  if (baseline?.version !== version || baseline.revision !== revision)
    throw new Error('the new repository records another baseline');
  const branch = run('git', ['symbolic-ref', '--short', 'HEAD'], repo, true);
  if (branch.trim() !== 'main')
    throw new Error(`the new repository starts on ${branch.trim()}, not main`);
  for (const path of ['LICENSE', 'CONTRIBUTING.md', 'packages', '.sempods'])
    if (existsSync(join(repo, path)))
      throw new Error(`the new repository must not contain ${path}`);
  if (!(await checkLinks(repo)))
    throw new Error('links in the new repository do not resolve');
  console.log('✓ creator writes the starter and its baseline');

  // The version is not on the registry yet: install it from its tarball,
  // for the root and for each app that declares it (also in the standalone
  // copy, which takes the workspace settings), through an override.
  const manifest = readJson(join(repo, 'package.json'));
  if (manifest.devDependencies['@sempods/apps'] !== version)
    throw new Error('the new repository declares another @sempods/apps');
  const overrides = { '@sempods/apps': `file:${tooling}` };
  if (sdkTarballs) {
    const directory = resolve(sdkTarballs);
    const sdk = {};
    for (const file of readdirSync(directory).filter((name) =>
      name.endsWith('.tgz'),
    )) {
      const tarball = join(directory, file);
      const pkg = JSON.parse(
        run('tar', ['-xOf', tarball, 'package/package.json'], repo, true),
      );
      if (
        ['@sempods/client-sdk', '@sempods/app-sdk', '@sempods/app-ui'].includes(
          pkg.name,
        )
      ) {
        if (pkg.version !== manifest.devDependencies[pkg.name])
          throw new Error(
            `SDK tarball version differs from starter: ${pkg.name}`,
          );
        sdk[pkg.name] = `file:${tarball}`;
      }
    }
    if (Object.keys(sdk).length !== 3)
      throw new Error('Provide one tarball for each SDK package.');
    Object.assign(overrides, sdk);
  }
  writeOverrides(repo, overrides);
  run('pnpm', ['install', '--no-frozen-lockfile'], repo);
  // The tooling's peers for the apps' Vite configuration are optional: the
  // root, which has no Vite of its own, does not get them installed.
  for (const name of ['vite', 'vite-plugin-pwa'])
    if (existsSync(join(repo, 'node_modules', name)))
      throw new Error(`the root installed the optional peer ${name}`);
  await nativeModalCheck(repo);
  checkSnapshot(
    join(repo, 'node_modules', '@sempods', 'apps'),
    'installed snapshot',
  );

  pnpmRun(repo, 'new-app', FIXTURE, '--title', 'Self test');
  // Verify the executable pnpm selects, not just the installed package
  // version: the tooling's TypeScript 6 must not shadow the app's compiler.
  const app = join(repo, 'apps', FIXTURE);
  const appSource = join(app, 'src/App.tsx');
  writeFileSync(
    appSource,
    "import { ContextSwitch } from './examples/ContextSwitch.tsx';\n" +
      readFileSync(appSource, 'utf8').replace(
        /<h1 className="flex items-center gap-2 text-2xl font-semibold">[\s\S]*?<\/h1>/,
        '<ContextSwitch title={app.title} icon={icon} label="List" />',
      ),
  );
  const expected = readJson(join(app, 'package.json')).devDependencies
    .typescript;
  const compiler = pnpm(['exec', 'tsc', '--version'], {
    cwd: app,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (compiler.status !== 0 || compiler.stdout.trim() !== `Version ${expected}`)
    throw new Error(
      `app compiler: expected ${expected}, got ${compiler.stdout.trim() || compiler.stderr.trim()}`,
    );
  const before = readFileSync(join(repo, 'apps.json'), 'utf8');
  const rerun = spawnSync(
    'pnpm',
    ['run', 'new-app', FIXTURE, '--skip-install'],
    { cwd: repo, stdio: 'ignore', shell: process.platform === 'win32' },
  );
  if (rerun.status === 0) throw new Error('a rerun of new-app must be refused');
  if (readFileSync(join(repo, 'apps.json'), 'utf8') !== before)
    throw new Error('a refused rerun changed apps.json');
  pnpmRun(repo, 'check', '--standalone', FIXTURE);
  themeCheck(repo);
  ownerIcon(repo);
  pnpmRun(repo, 'regenerate');
  console.log('✓ installed package creates and checks an app');
  publish(repo);
  bundleCheck(repo);
  await overviewCheck(repo);
  await appThemeCheck(repo);
  await examplesCheck(repo);
  // Without an ID, dev lists the apps instead of starting one.
  if (!run('pnpm', ['run', '--silent', 'dev'], repo, true).includes(`${FIXTURE}  Self test  http://127.0.0.1:`))
    throw new Error('pnpm run dev without an ID does not list the app');
  console.log('✓ dev without an ID lists the apps');
  migrateExercise(repo, work, tooling);
} catch (error) {
  console.error(`self-test: ${error.message}`);
  failed = true;
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(failed ? 'self-test failed.' : 'self-test passed.');
process.exit(failed ? 1 : 0);
