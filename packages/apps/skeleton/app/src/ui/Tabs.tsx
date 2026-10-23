import type { useRoute, Route } from '../routes.ts';

export type View = {
  /** The route; undefined for the start page. */
  readonly route: Route | undefined;
  readonly label: string;
};

/**
 * The app's views as tabs on one line: links with their own addresses, so
 * they open in a new tab or get bookmarked; a plain click switches in place
 * under the SDK's leave policy. Pass `route` and `link` from `useRoute()`.
 */
export function Tabs({
  label,
  views,
  current,
  link,
}: {
  /** The name of the navigation for screen readers. */
  readonly label: string;
  readonly views: readonly View[];
  readonly current: Route | undefined;
  readonly link: ReturnType<typeof useRoute>['link'];
}) {
  return (
    <nav aria-label={label} className="tabs">
      {views.map(({ route, label }) => (
        <a
          key={route ?? ''}
          {...link(route)}
          aria-current={route === current ? 'page' : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
