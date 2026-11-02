#!/usr/bin/env node
// Checks the contrast of an app's theme in a browser: builds the app, loads
// its stylesheet with the attributes of its <html> and runs the UI kit's role
// check (@sempods/app-ui/theme-check) under a light and a dark colour
// preference. Every action variant is sampled, the inactive ones too. A
// failure names the variant, state, roles, colours and ratio; fix the roles it
// names and run the command again. Screens still need a visual check.
// Usage: pnpm run check:theme [<id>] [--json] [--install-browser]
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readApps } from './lib/apps.mjs';
import { escapeHtml } from './lib/html.mjs';
import { readJson } from './lib/json.mjs';
import { repositoryRoot } from './lib/paths.mjs';
import { pnpm, scriptArgs } from './lib/pnpm.mjs';
import { UI_KIT } from './lib/sdk.mjs';

export const SCHEMES = ['light', 'dark'];
// The page's origin: requests to it are answered from local files, nothing
// goes to the network.
const ORIGIN = 'http://theme-check.invalid';

/** The attributes of the page's <html> element, such as data-actions. */
export function htmlAttributes(html) {
  const tag = html.match(/<html\b([^>]*)>/i)?.[1] ?? '';
  return [...tag.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g)]
    .map(([, name, a, b, c]) => [name.toLowerCase(), a ?? b ?? c ?? ''])
    .filter(([name]) => name !== 'lang');
}

/** The stylesheets a built page links, as paths below the build folder. */
export function linkedStylesheets(html, basePath) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => /\brel\s*=\s*["']?stylesheet\b/i.test(tag))
    .map((tag) => tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1])
    .filter((href) => href?.startsWith(basePath))
    .map((href) => href.slice(basePath.length));
}

/** The check page: the app's stylesheets, its <html> attributes, the check. */
export function checkPage(attributes, stylesheets) {
  const attrs = attributes
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
  const links = stylesheets
    .map((file) => `<link rel="stylesheet" href="/app/${file}">`)
    .join('');
  return `<!doctype html><html${attrs}><head><meta charset="utf-8">${links}<script type="module">import * as check from '/theme-check/index.js'; window.themeCheck = check;</script></head><body></body></html>`;
}

/** The UI kit an app has installed, or undefined. */
function installedKit(root, appDir) {
  return [appDir, root]
    .map((base) => join(base, 'node_modules', ...UI_KIT.split('/')))
    .find((dir) => existsSync(join(dir, 'dist', 'theme-check', 'index.js')));
}

/** Builds the app into `outDir`, or throws. */
function buildApp(appDir, outDir) {
  // The output path is relative to the app, so no user directory name passes
  // through the Windows shell (lib/pnpm.mjs).
  const result = pnpm(
    [
      ...['exec', 'vite', 'build', '--outDir', relative(appDir, outDir)],
      ...['--emptyOutDir', '--logLevel', 'error'],
    ],
    { cwd: appDir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(
      `the build failed:\n${`${result.stdout}${result.stderr}`.trim()}`,
    );
}

const MISSING_BROWSER =
  'the browser for the check is missing: run pnpm run check:theme --install-browser once, then again without it';

/** Starts Chromium through the tooling's Playwright. */
async function launch() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch();
  } catch (error) {
    if (/Executable doesn't exist|playwright install/i.test(error.message))
      throw new Error(MISSING_BROWSER);
    throw error;
  }
}

/** Installs the Chromium of the tooling's Playwright into its user cache. */
export function installBrowser() {
  const cli = join(
    dirname(createRequire(import.meta.url).resolve('playwright/package.json')),
    'cli.js',
  );
  return (
    spawnSync(process.execPath, [cli, 'install', 'chromium'], {
      stdio: 'inherit',
    }).status === 0
  );
}

/** Serves `root` for requests below `prefix`, and nothing outside it. */
function fileFrom(root, prefix, path) {
  const file = resolve(root, decodeURIComponent(path.slice(prefix.length)));
  return file.startsWith(root + sep) && existsSync(file) ? file : undefined;
}

const TYPES = { '.css': 'text/css', '.js': 'text/javascript' };

/**
 * The reports of one built app under each colour preference: `{ scheme:
 * report }`, with `error` for a scheme whose check threw.
 */
export async function inspectBuild(browser, { outDir, kitDir, basePath }) {
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  const stylesheets = linkedStylesheets(html, basePath);
  if (stylesheets.length === 0)
    throw new Error('the built page links no stylesheet');
  const page = await browser.newPage();
  const checkDir = join(kitDir, 'dist', 'theme-check');
  await page.route(`${ORIGIN}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: checkPage(htmlAttributes(html), stylesheets),
      });
    const file = pathname.startsWith('/app/')
      ? fileFrom(outDir, '/app/', pathname)
      : pathname.startsWith('/theme-check/')
        ? fileFrom(checkDir, '/theme-check/', pathname)
        : undefined;
    if (!file) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({
      contentType: TYPES[file.slice(file.lastIndexOf('.'))] ?? 'text/plain',
      body: readFileSync(file),
    });
  });
  // Fonts, images and anything else outside the page stay unloaded.
  await page.route(
    (url) => url.origin !== ORIGIN,
    (route) => route.abort(),
  );
  try {
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => 'themeCheck' in window);
    const reports = {};
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme });
      reports[scheme] = await page.evaluate((only) => {
        try {
          return window.themeCheck.checkTheme(only);
        } catch (error) {
          return { error: String(error?.message ?? error) };
        }
      }, scheme);
    }
    return reports;
  } finally {
    await page.close();
  }
}

// The action variants the check samples: data-actions × data-secondary.
const VARIANT_COUNT = 6;

/**
 * Failures of the same pair with the same colours, once each, with the
 * variants they occur in; the page's own variant is marked.
 */
export function failureGroups(failures) {
  const groups = new Map();
  for (const f of failures) {
    const key = [
      f.state,
      f.pair,
      f.backdrop,
      f.foreground.colour,
      f.surface.colour,
    ].join('|');
    if (!groups.has(key)) groups.set(key, { failure: f, variants: [] });
    groups
      .get(key)
      .variants.push(
        `${f.variant.actions}/${f.variant.secondary}${f.active ? ' (the page)' : ''}`,
      );
  }
  return [...groups.values()].map(({ failure, variants }) => ({
    failure,
    variants:
      variants.length === VARIANT_COUNT
        ? 'every variant'
        : variants.join(', '),
  }));
}

/**
 * Lines for the console and whether everything passed. A scheme the theme
 * excludes (a forced colour scheme) is reported as not sampled, not as
 * passing; the other preference's samples are skipped by design.
 */
export function summarize(results) {
  const lines = [];
  let ok = true;
  for (const { id, error, reports } of results) {
    if (error) {
      ok = false;
      lines.push(`✗ apps/${id}: ${error}`);
      continue;
    }
    for (const scheme of SCHEMES) {
      const report = reports[scheme];
      const label = `apps/${id} ${scheme}`;
      if (report.error) {
        ok = false;
        lines.push(`✗ ${label}: the check failed: ${report.error}`);
        continue;
      }
      const failures = report.failures.filter((f) => f.scheme === scheme);
      const skips = report.skipped.filter((skip) => skip.scheme === scheme);
      if (!report.pass) ok = false;
      if (report.pass && skips.length > 0)
        lines.push(`– ${label}: not sampled (${skips[0].reason})`);
      else if (report.pass)
        lines.push(
          `✓ ${label}: every role pair passes in every variant (the page uses ${report.active.actions}/${report.active.secondary})`,
        );
      else {
        const groups = failureGroups(failures);
        lines.push(`✗ ${label}: ${groups.length} pair(s) below the minimum`);
        for (const { failure: f, variants } of groups)
          lines.push(
            `    ${f.pair} on ${f.backdrop} (${f.state}): ${f.foreground.colour} on ${f.surface.colour}, ${f.ratio.toFixed(2)}:1, needs ${f.required}:1, in ${variants}. Adjust ${f.adjust.join(', ')}.`,
          );
      }
    }
  }
  return { ok, lines };
}

/** Checks the given apps; the build and the inspection are replaceable for tests. */
export async function checkThemes(
  root,
  ids,
  { build = buildApp, inspect, browser: start = launch } = {},
) {
  const { apps } = readApps(root);
  const unknown = ids.filter((id) => !apps.some((app) => app.id === id));
  if (unknown.length > 0)
    throw new Error(`${unknown.join(', ')} is not listed in apps.json`);
  const selected = ids.length
    ? apps.filter((app) => ids.includes(app.id))
    : apps;
  const results = [];
  const skipped = [];
  let browser;
  try {
    for (const app of selected) {
      const appDir = join(root, 'apps', app.id);
      const { dependencies = {} } = readJson(join(appDir, 'package.json'));
      if (!dependencies[UI_KIT]) {
        skipped.push(
          `apps/${app.id} does not use ${UI_KIT}; its theme is not checked`,
        );
        if (ids.length) results.push({ id: app.id, error: skipped.at(-1) });
        continue;
      }
      const kitDir = installedKit(root, appDir);
      if (!kitDir) {
        results.push({
          id: app.id,
          error: `${UI_KIT} with its theme check is not installed; run pnpm install`,
        });
        continue;
      }
      // Inside the app's node_modules, where builds leave nothing to commit.
      const cache = join(appDir, 'node_modules', '.cache');
      mkdirSync(cache, { recursive: true });
      const outDir = mkdtempSync(join(cache, 'sempods-theme-'));
      try {
        build(appDir, outDir);
        const target = { outDir, kitDir, basePath: app.path };
        const reports = inspect
          ? await inspect(target)
          : await inspectBuild((browser ??= await start()), target);
        results.push({ id: app.id, reports });
      } catch (error) {
        if (error.message === MISSING_BROWSER) throw error;
        results.push({ id: app.id, error: error.message });
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    }
  } finally {
    await browser?.close();
  }
  return { results, skipped };
}

async function main() {
  const { values, positionals } = parseArgs({
    args: scriptArgs(),
    allowPositionals: true,
    options: {
      json: { type: 'boolean' },
      'install-browser': { type: 'boolean' },
    },
  });
  if (values['install-browser']) {
    if (!installBrowser()) throw new Error('the browser could not be installed');
    if (positionals.length === 0 && !values.json) return;
  }
  const root = repositoryRoot();
  const { results, skipped } = await checkThemes(root, positionals);
  const { ok, lines } = summarize(results);
  if (values.json)
    console.log(
      JSON.stringify(
        {
          pass: ok,
          apps: results.map(({ id, error, reports }) => ({
            id,
            ...(error ? { error } : {}),
            ...(reports ? { schemes: reports } : {}),
          })),
          skipped,
        },
        null,
        2,
      ),
    );
  else {
    for (const line of skipped) console.log(`– ${line}`);
    for (const line of lines) console.log(line);
    if (results.length === 0) console.log('No app uses the UI kit yet.');
    console.log(
      ok
        ? '\ncheck:theme passed. Check the screens visually as well.'
        : '\ncheck:theme failed: change the roles named above in the theme, then run it again.',
    );
  }
  if (!ok) process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(`check:theme: ${error.message}`);
    process.exitCode = 1;
  });
