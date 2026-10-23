import { pathOf, type Route } from '../routes.ts';
import { app } from '../sempods.generated.ts';

export type View = {
  /** The route; undefined for the start page. */
  readonly route: Route | undefined;
  readonly label: string;
};

/**
 * The app's views as tabs on one line: links with their own addresses, so
 * they open in a new tab or get bookmarked; a plain click switches through
 * `go` from `useRoute()`, under the SDK's leave policy.
 */
export function Tabs({
  label,
  views,
  current,
  go,
}: {
  /** The name of the navigation for screen readers. */
  readonly label: string;
  readonly views: readonly View[];
  readonly current: Route | undefined;
  readonly go: (route: Route | undefined) => void;
}) {
  return (
    <nav aria-label={label} className="tabs">
      {views.map(({ route, label }) => (
        <a
          key={route ?? ''}
          href={pathOf(route, app.basePath)}
          aria-current={route === current ? 'page' : undefined}
          onClick={(event) => {
            // Let modified clicks open a new tab or window.
            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            go(route);
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
