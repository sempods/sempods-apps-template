import { describe, expect, it } from 'vitest';
import { pathOf, routeOf } from './routes.ts';

describe('routes', () => {
  const routes = ['open', 'bought'] as const;

  it('reads the route of an address under the app path', () => {
    expect(routeOf('/konsum/bought', routes, '/konsum/')).toBe('bought');
    expect(routeOf('/konsum/bought/', routes, '/konsum/')).toBe('bought');
    expect(routeOf('/konsum/', routes, '/konsum/')).toBeUndefined();
    expect(routeOf('/konsum/other', routes, '/konsum/')).toBeUndefined();
    expect(routeOf('/notes/bought', routes, '/konsum/')).toBeUndefined();
  });

  it('writes the address of a route', () => {
    expect(pathOf('bought', '/konsum/')).toBe('/konsum/bought');
    expect(pathOf(undefined, '/konsum/')).toBe('/konsum/');
  });
});
