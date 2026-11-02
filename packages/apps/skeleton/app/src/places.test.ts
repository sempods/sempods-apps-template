import { createBrowserRuntime } from '@sempods/app-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addressModel,
  decodeSubject,
  encodeSubject,
  inApp,
  ITEM,
} from './places.ts';
import { app, runtimeOptions } from './sempods.generated.ts';

afterEach(() => vi.unstubAllGlobals());

describe('places', () => {
  const model = addressModel({
    basePath: '/konsum/',
    routes: ['bought'],
    resources: [ITEM],
  });
  const subject = 'https://pod.example/data/items/milk#it';
  const id = encodeSubject(subject);

  it('reads the place of an address under the app path', () => {
    expect(model.parse('/konsum/', '').place).toEqual({ kind: 'start' });
    expect(model.parse('/konsum/bought/', '')).toEqual({
      place: { kind: 'view', route: 'bought' },
      canonical: '/konsum/bought',
    });
    expect(model.parse(`/konsum/items/${id}`, '').place).toEqual({
      kind: 'item',
      subject,
    });
    expect(model.parse('/konsum/callback', '?code=x').canonical).toBe(
      '/konsum/callback?code=x',
    );
  });

  it('keeps the query of a view while it normalises the address', () => {
    expect(model.parse('/konsum/bought/', '?filter=open').canonical).toBe(
      '/konsum/bought?filter=open',
    );
    expect(model.parse('/konsum/', '?task=x').canonical).toBe('/konsum/?task=x');
  });

  it('keeps the rest of an item query after its context', () => {
    const search = '?tab=history&context=urn%3Actx%3A1';
    expect(model.parse(`/konsum/items/${id}/`, search)).toEqual({
      place: { kind: 'item', subject, context: 'urn:ctx:1' },
      canonical: `/konsum/items/${id}?context=urn%3Actx%3A1&tab=history`,
    });
    expect(model.parse(`/konsum/items/${id}`, '?tab=history').canonical).toBe(
      `/konsum/items/${id}?tab=history`,
    );
  });

  it('keeps the source Context the address names', () => {
    const context = 'https://pod.example/contexts/home';
    const place = { kind: 'item', subject, context } as const;
    const address = model.format(place);
    const [path, query] = address.split('?');
    expect(model.parse(path!, `?${query}`).place).toEqual(place);
  });

  it('shows unknown and invalid addresses as not found, keeping them', () => {
    expect(model.parse('/konsum/other', '')).toEqual({
      place: { kind: 'not-found', reason: 'unknown' },
      canonical: '/konsum/other',
    });
    expect(model.parse('/konsum/items/!!', '').place).toEqual({
      kind: 'not-found',
      reason: 'invalid',
    });
    expect(model.parse(`/konsum/items/${id}`, '?context=x').place).toEqual({
      kind: 'not-found',
      reason: 'invalid',
    });
    expect(model.parse('/notes/', '').place.kind).toBe('not-found');
  });

  it('finds no item an app has not declared', () => {
    const plain = addressModel({
      basePath: '/konsum/',
      routes: [],
      resources: [],
    });
    expect(plain.parse(`/konsum/items/${id}`, '').place).toEqual({
      kind: 'not-found',
      reason: 'unknown',
    });
  });

  it('returns a callback without a matching sign-in to the start page', async () => {
    // An expired sign-in in a browser with nothing saved: the runtime gets
    // `/` and the app keeps the person in it.
    const callback = new URL(
      `http://127.0.0.1:5180${app.basePath}callback?code=unused&state=expired`,
    );
    vi.stubGlobal('location', callback);
    const seen: string[] = [];
    const runtime = createBrowserRuntime({
      ...runtimeOptions,
      location: () => callback.href,
      // A free lock, so the runtime reads the empty store.
      locks: { request: (name, _options, granted) => granted({ name }) },
      openStore: async () => ({
        read: async () => undefined,
        list: async () => ({ records: [], unreadable: [] }),
        commit: async () => {
          throw new Error('nothing to commit');
        },
        close() {},
      }),
      replaceUrl: (url) => seen.push(inApp(url)),
    });
    const report = await runtime.initialize();
    expect(report).toMatchObject({ storage: 'durable', problem: 'attempt' });
    expect(seen).toEqual([app.basePath]);
    expect(inApp(`${app.basePath}bought?filter=open`)).toBe(
      `${app.basePath}bought?filter=open`,
    );
  });

  it('encodes a subject as one path segment', () => {
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSubject(id)).toBe(subject);
    expect(decodeSubject('bm90IGFuIElSSQ')).toBeNull();
  });
});
