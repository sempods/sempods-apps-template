// The tooling's public exports, as apps import them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { TOOLING } from '../scripts/lib/paths.mjs';

const manifest = JSON.parse(
  readFileSync(join(TOOLING, 'package.json'), 'utf8'),
);

describe('package exports', () => {
  it('ships each export with its types', () => {
    for (const name of ['./vite', './browser-theme']) {
      const entry = manifest.exports[name];
      assert.ok(entry.types && entry.default, name);
      for (const file of [entry.types, entry.default])
        assert.ok(
          manifest.files.some((dir) => file.startsWith(`./${dir}`)),
          `${file} is published`,
        );
    }
    // Only the apps' Vite configuration needs these, for its types.
    for (const peer of ['vite', 'vite-plugin-pwa'])
      assert.equal(manifest.peerDependenciesMeta[peer].optional, true, peer);
  });

  it('keeps the browser export free of imports', () => {
    const source = readFileSync(join(TOOLING, 'api/browser-theme.mjs'), 'utf8');
    assert.doesNotMatch(source, /^\s*import\b|\bimport\(|\brequire\(/m);
  });
});

describe('browser theme', () => {
  const saved = {};
  const fake = ({ background }) => {
    const listeners = new Set();
    const metas = [
      { marked: true, content: '__THEME_LIGHT__' },
      { marked: true, content: '__THEME_DARK__' },
      { marked: false, content: '#123456' },
    ];
    const state = { background, appended: 0 };
    const probe = {
      style: {},
      remove() {
        state.appended -= 1;
      },
    };
    Object.assign(globalThis, {
      document: {
        body: {
          append() {
            state.appended += 1;
          },
        },
        createElement: () => probe,
        querySelectorAll: (selector) => {
          assert.equal(
            selector,
            'meta[name="theme-color"][data-sempods-theme]',
          );
          return metas.filter((meta) => meta.marked);
        },
      },
      getComputedStyle: (element) => {
        assert.equal(element.style.color, 'var(--background)');
        return { color: state.background };
      },
      matchMedia: (query) => {
        assert.equal(query, '(prefers-color-scheme: dark)');
        return {
          addEventListener: (type, listener) => {
            assert.equal(type, 'change');
            listeners.add(listener);
          },
          removeEventListener: (type, listener) => listeners.delete(listener),
        };
      },
    });
    const change = () => {
      for (const listener of listeners) listener({ matches: true });
    };
    return { metas, state, listeners, change };
  };
  for (const name of ['document', 'getComputedStyle', 'matchMedia'])
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
  afterEach(() => {
    for (const [name, descriptor] of Object.entries(saved))
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
  });

  it('gives marked meta elements the resolved background and leaves the others', async () => {
    const { syncBrowserTheme } = await import('@sempods/apps/browser-theme');
    const { metas, state } = fake({ background: 'rgb(1, 2, 3)' });
    syncBrowserTheme();
    assert.deepEqual(
      metas.map((meta) => meta.content),
      ['rgb(1, 2, 3)', 'rgb(1, 2, 3)', '#123456'],
    );
    // The probe is gone again.
    assert.equal(state.appended, 0);
  });

  it('follows system changes until stopped', async () => {
    const { followBrowserTheme } = await import('@sempods/apps/browser-theme');
    const { metas, state, listeners, change } = fake({
      background: 'rgb(247, 249, 247)',
    });
    const stop = followBrowserTheme();
    assert.equal(metas[0].content, 'rgb(247, 249, 247)');
    assert.equal(listeners.size, 1);
    state.background = 'rgb(19, 27, 24)';
    change();
    assert.equal(metas[1].content, 'rgb(19, 27, 24)');
    // Hot module replacement disposes the module with this.
    stop();
    assert.equal(listeners.size, 0);
    state.background = 'rgb(0, 0, 0)';
    change();
    assert.equal(metas[0].content, 'rgb(19, 27, 24)');
  });
});
