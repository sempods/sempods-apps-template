import { describe, expect, it } from 'vitest';
import { addressModel, decodeSubject, encodeSubject, ITEM } from './places.ts';

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

  it('encodes a subject as one path segment', () => {
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSubject(id)).toBe(subject);
    expect(decodeSubject('bm90IGFuIElSSQ')).toBeNull();
  });
});
