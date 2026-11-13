#!/usr/bin/env node
// Acceptance test of the packed packages, as an owner gets them: pack
// @sempods/apps and @sempods/create-apps, check what the tarball contains,
// create a repository with the creator, install the tooling from its tarball,
// then create an app, refuse a rerun, check it including a standalone
// install/build, check its theme in a browser (and a broken one), regenerate,
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
import { dirname, extname, join, relative, sep } from 'node:path';
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
// does. Native top-layer dialogs escape an inert ancestor; Playwright 1.65
// incorrectly rejected ordinary clicks there (template #153 / SDK #264).
async function nativeModalCheck(repo) {
  const require = createRequire(
    realpathSync(join(repo, 'node_modules/@sempods/apps/package.json')),
  );
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main inert>
        <dialog aria-label="Unsaved changes">
          <form method="dialog"><button>Keep editing</button></form>
        </dialog>
      </main>
    `);
    await page.locator('dialog').evaluate((dialog) => dialog.showModal());
    await page
      .getByRole('button', { name: 'Keep editing', exact: true })
      .click({ timeout: 5000 });
    if (await page.locator('dialog').evaluate((dialog) => dialog.open))
      throw new Error('the native confirmation did not close');
    console.log(
      '✓ installed Playwright clicks a native modal inside an inert ancestor',
    );
  } finally {
    await browser.close();
  }
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
  pnpmRun(repo, 'icon', FIXTURE);
  const pub = (file) => join(dir, 'public', file);
  if (readFileSync(pub('favicon.svg'), 'utf8') !== OWNER_SVG)
    throw new Error('icon did not take icon.svg as favicon.svg');
  for (const [file, size] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512],
  ]) {
    const png = readFileSync(pub(file));
    if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size)
      throw new Error(`icon drew ${file} in another size than ${size}`);
  }
  if (readFileSync(pub('icon-512.png')).equals(readFileSync(pub('icon-maskable-512.png'))))
    throw new Error('the maskable icon has no background of its own');
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

/**
 * Opens the built overview in Chromium, as a visitor with a German browser:
 * the list launches apps directly, Details opens the secondary view, and
 * language choice, narrow screens and no-script navigation keep working.
 */
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
      if (!javascript) {
        assert.equal(await meta.nth(0).getAttribute('content'), '#f7f9f7');
        assert.equal(await meta.nth(1).getAttribute('content'), '#131b18');
      } else {
        await page
          .getByRole('heading', { name: 'Selbsttest', exact: true })
          .waitFor();
        await page
          .getByText('Eine kleine Test-App.', { exact: true })
          .waitFor();
        assert.equal(await page.locator('html').getAttribute('lang'), 'de');
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
      '✓ built app: localized identity, static theme colours, system/explicit appearance and owner overrides',
    );
  } finally {
    await browser.close();
  }
}

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
    theme_color: '#f7f9f7',
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

  const manifest = readJson(join(repo, 'package.json'));
  manifest.devDependencies['@sempods/apps'] = `file:${laterTarball}`;
  writeJson(join(repo, 'package.json'), manifest);
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

  // The version is not on the registry yet: install it from its tarball.
  const manifest = readJson(join(repo, 'package.json'));
  manifest.devDependencies['@sempods/apps'] = `file:${tooling}`;
  writeJson(join(repo, 'package.json'), manifest);
  run('pnpm', ['install', '--no-frozen-lockfile'], repo);
  await nativeModalCheck(repo);
  checkSnapshot(
    join(repo, 'node_modules', '@sempods', 'apps'),
    'installed snapshot',
  );

  pnpmRun(repo, 'new-app', FIXTURE, '--title', 'Self test');
  // Verify the executable pnpm selects, not just the installed package
  // version: the tooling's TypeScript 6 must not shadow the app's compiler.
  const app = join(repo, 'apps', FIXTURE);
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
  await overviewCheck(repo);
  await appThemeCheck(repo);
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
