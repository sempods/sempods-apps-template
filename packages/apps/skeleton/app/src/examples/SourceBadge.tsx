// An example, not mounted: a passive badge that names where an entry comes
// from in a view that combines Contexts or Pods (an overview, a combined task
// view). Copy it next to App.tsx for such a view. Call useSources once per
// screen and pass each row's own source ({ context, connection? }, as
// usePodList or a read per connection gives it):
//
//   const source = useSources({ combined: true }); // the view's podView="combined"
//   <span>{row.data.title}</span>
//   <SourceBadge source={source(item)} />
//
// useSources reads the labels through usePodContexts, which tells AppAccess
// that the app owns the context chooser: AppAccess then offers none and
// waits for that chooser's selection. An app that works in a selected
// context (TargetScreen, useCreation without `context`, or
// contextSelection="required") therefore mounts ContextSwitch in its header
// beside the badge (./ContextSwitch.tsx), which selects and switches. An app
// whose reads and writes all name their context (usePodList, rows written
// where they came from, useCreation with `context`) or that has a fixed
// preset.contextIri needs none.
//
// Show the same badge under an item's title, in its details, beside each
// area of a grouped confirmation and as the selected value of a labelled
// destination control (in the kit's SelectValue). It never acts: put
// actions on the row or the control, not on the badge.
import { useAppState, usePodContexts } from '@sempods/app-sdk/react';
import { Badge } from '@sempods/app-ui';

/** Where an entry was read: its Context, and its connection unless the active one. */
export interface SourceRef {
  readonly context: string;
  readonly connection?: string;
}

/** What a badge shows: the text is the identity, the hue only decorates it. */
export interface Source {
  readonly key: string;
  readonly text: string;
  readonly hue: number;
}

/**
 * Names an entry's source with the SDK's labels. One Pod: the Context's
 * label, unique within its Pod ("Tasks · work"). In a combined view with a
 * second Pod connected, every source also names its Pod ("Tasks · work ·
 * Alice"), so all rows read alike. Unknown until the Pod's Contexts are
 * read: null. While it is mounted, AppAccess shows no context chooser: keep
 * ContextSwitch beside it where the app selects a context (see above).
 */
export function useSources(options: {
  readonly combined: boolean;
  readonly podNames?: Readonly<Record<string, string>>;
}): (ref: SourceRef) => Source | null {
  const { pods } = usePodContexts({ podNames: options.podNames });
  const { activeId } = useAppState();
  const withPod = options.combined && pods.length > 1;
  return (ref) => {
    const connection = ref.connection ?? activeId;
    const choice = pods
      .find((pod) => pod.connectionId === connection)
      ?.choices.find((entry) => entry.contextIri === ref.context);
    if (!choice) return null;
    return {
      key: choice.key,
      text: withPod ? `${choice.label} · ${choice.podLabel}` : choice.label,
      // From the exact addresses: the same after sorting, renaming, a status
      // or access change, and in every view of the app.
      hue: hueOf(`${choice.podUrl}\n${choice.contextIri}`),
    };
  };
}

/**
 * A stable hue (0–359) from an identity string: FNV-1a, then a final mix so
 * addresses that differ only at the end still differ in colour. Colours may
 * repeat; the text tells sources apart.
 */
function hueOf(identity: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < identity.length; i++) {
    hash ^= identity.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) % 360;
}

/**
 * The kit's outline Badge with a quiet tint mixed into the theme's
 * background, so the text keeps the foreground's contrast in light and dark.
 * Forced colours drop the tint and keep text and border. Long names wrap,
 * so the corners are less round than a one-line badge's.
 */
export function SourceBadge({ source }: { readonly source: Source | null }) {
  if (!source) return null;
  return (
    <Badge
      variant="outline"
      className="h-auto min-h-5 max-w-full justify-start rounded-lg text-start whitespace-normal wrap-anywhere"
      style={{
        backgroundColor: `color-mix(in oklch, var(--background) 82%, oklch(0.7 0.14 ${source.hue}))`,
      }}
    >
      {source.text}
    </Badge>
  );
}
