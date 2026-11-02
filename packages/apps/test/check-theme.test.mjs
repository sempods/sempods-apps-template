import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  checkPage,
  checkThemes,
  failureGroups,
  htmlAttributes,
  linkedStylesheets,
  summarize,
} from '../scripts/check-theme.mjs';
import { createApp } from '../scripts/new-app.mjs';
import { tempRepository } from './fixture.mjs';

// The browser run itself is exercised by the self-test against a real build;
// these tests cover what the command makes of the page and the reports.
const variants = ['solid', 'inverted'].flatMap((actions) =>
  ['tonal', 'outline', 'text'].map((secondary) => ({ actions, secondary })),
);
const failure = (variant, scheme = 'light') => ({
  scheme,
  variant,
  active: variant.actions === 'solid' && variant.secondary === 'tonal',
  pair: 'muted text on background',
  state: 'rest',
  backdrop: 'background',
  foreground: { role: 'muted-foreground', colour: '#d0d4da' },
  surface: { role: 'background', colour: '#ffffff' },
  adjust: ['muted-foreground', 'background'],
  ratio: 1.4881,
  required: 4.5,
});
const passing = (scheme) => ({
  pass: true,
  active: variants[0],
  failures: [],
  skipped: [
    {
      variant: variants[0],
      scheme: scheme === 'light' ? 'dark' : 'light',
      reason: 'not the browser preference',
    },
  ],
});

describe('check-theme', () => {
  it('builds the check page from the built page', () => {
    const html =
      '<!doctype html><html lang="de" data-actions="inverted" data-secondary=\'outline\'><head>' +
      '<link rel="icon" href="/demo/favicon.svg">' +
      '<link rel="stylesheet" crossorigin href="/demo/assets/index-1.css">' +
      '<link rel="stylesheet" href="https://cdn.example/x.css"></head></html>';
    const attributes = htmlAttributes(html);
    assert.deepEqual(attributes, [
      ['data-actions', 'inverted'],
      ['data-secondary', 'outline'],
    ]);
    const sheets = linkedStylesheets(html, '/demo/');
    assert.deepEqual(sheets, ['assets/index-1.css']);
    const page = checkPage([...attributes, ['title', 'a "b"']], sheets);
    assert.match(
      page,
      /<html data-actions="inverted" data-secondary="outline" title="a &#34;b&#34;">/,
    );
    assert.match(page, /<link rel="stylesheet" href="\/app\/assets\/index-1\.css">/);
    assert.match(page, /import \* as check from '\/theme-check\/index\.js'/);
  });

  it('names each failing pair once, with the variants it fails in', () => {
    const all = failureGroups(variants.map((v) => failure(v)));
    assert.equal(all.length, 1);
    assert.equal(all[0].variants, 'every variant');
    const some = failureGroups(variants.slice(0, 2).map((v) => failure(v)));
    assert.equal(some[0].variants, 'solid/tonal (the page), solid/outline');
  });

  it('passes, fails and tells a scheme it did not sample apart', () => {
    const ok = summarize([
      { id: 'demo', reports: { light: passing('light'), dark: passing('dark') } },
    ]);
    assert.equal(ok.ok, true);
    assert.match(ok.lines.join('\n'), /✓ apps\/demo light: every role pair passes/);
    assert.match(ok.lines.join('\n'), /✓ apps\/demo dark/);

    const failed = summarize([
      {
        id: 'demo',
        reports: {
          light: {
            pass: false,
            active: variants[0],
            failures: variants.map((v) => failure(v)),
            skipped: [],
          },
          // A theme that forces light mode: the kit samples nothing in dark
          // and so reports no pass for it.
          dark: {
            pass: false,
            active: variants[0],
            failures: [],
            skipped: [
              { variant: variants[0], scheme: 'dark', reason: 'color-scheme is light' },
            ],
          },
        },
      },
    ]);
    assert.equal(failed.ok, false);
    const text = failed.lines.join('\n');
    assert.match(text, /✗ apps\/demo light: 1 pair\(s\) below the minimum/);
    assert.match(
      text,
      /muted text on background on background \(rest\): #d0d4da on #ffffff, 1\.49:1, needs 4\.5:1, in every variant\. Adjust muted-foreground, background\./,
    );
    assert.match(text, /– apps\/demo dark: not sampled \(color-scheme is light\)/);

    const forced = summarize([
      {
        id: 'demo',
        reports: {
          light: passing('light'),
          dark: {
            pass: false,
            active: variants[0],
            failures: [],
            skipped: [
              { variant: variants[0], scheme: 'dark', reason: 'color-scheme is light' },
            ],
          },
        },
      },
    ]);
    assert.equal(forced.ok, true);
    assert.match(forced.lines.join('\n'), /– apps\/demo dark: not sampled/);
    const empty = summarize([
      {
        id: 'demo',
        reports: {
          light: passing('light'),
          dark: { pass: false, active: variants[0], failures: [], skipped: [] },
        },
      },
    ]);
    assert.equal(empty.ok, false);
    assert.match(empty.lines.join('\n'), /✗ apps\/demo dark: no sample was checked/);

    const broken = summarize([
      { id: 'demo', reports: { light: { error: 'Missing role' }, dark: passing('dark') } },
      { id: 'other', error: 'the build failed' },
    ]);
    assert.equal(broken.ok, false);
    assert.match(broken.lines.join('\n'), /✗ apps\/demo light: the check failed: Missing role/);
    assert.match(broken.lines.join('\n'), /✗ apps\/other: the build failed/);
  });
});

describe('check-theme apps', () => {
  let root;
  beforeEach(() => {
    root = tempRepository('sempods-check-theme-');
    createApp(root, { id: 'demo' });
    createApp(root, { id: 'old' });
    // An app that keeps its own kit, from before @sempods/app-ui.
    const pkg = join(root, 'apps', 'old', 'package.json');
    const manifest = JSON.parse(readFileSync(pkg, 'utf8'));
    delete manifest.dependencies['@sempods/app-ui'];
    writeFileSync(pkg, JSON.stringify(manifest));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('checks the apps that use the UI kit and needs it installed', async () => {
    const all = await checkThemes(root, [], {
      inspect: () => assert.fail('nothing to inspect without the kit'),
    });
    assert.deepEqual(all.skipped, [
      'apps/old does not use @sempods/app-ui; its theme is not checked',
    ]);
    assert.match(all.results[0].error, /theme check is not installed; run pnpm install/);
    await assert.rejects(
      () => checkThemes(root, ['nope']),
      /nope is not listed in apps\.json/,
    );
    const named = await checkThemes(root, ['old']);
    assert.match(named.results[0].error, /does not use @sempods\/app-ui/);
    // With the kit installed, the build goes to the inspection.
    const kit = join(root, 'node_modules', '@sempods', 'app-ui', 'dist', 'theme-check');
    mkdirSync(kit, { recursive: true });
    writeFileSync(join(kit, 'index.js'), '');
    const seen = [];
    const run = await checkThemes(root, ['demo'], {
      build: (appDir, outDir) => {
        seen.push(appDir.split(/[\\/]/).pop());
        writeFileSync(join(outDir, 'index.html'), '<html></html>');
      },
      inspect: (build) => {
        seen.push(build.basePath);
        return { light: passing('light'), dark: passing('dark') };
      },
    });
    assert.deepEqual(seen, ['demo', '/demo/']);
    assert.equal(summarize(run.results).ok, true);
    const failing = await checkThemes(root, ['demo'], {
      build: () => {
        throw new Error('the build failed:\nboom');
      },
    });
    assert.match(failing.results[0].error, /the build failed/);
  });
});
