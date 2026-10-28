import type { ReactNode } from 'react';
import { useContexts, useSdkLocale } from '@sempods/app-sdk/react';
import { ChevronIcon } from './icons.tsx';
import { Menu } from './Menu.tsx';

/**
 * The everyday switch between the contexts (for example lists) the person
 * shared with the app: the app icon and the current context's name, opening
 * a menu with the readable contexts, their access and a way to share more.
 * The SDK's `useContexts` loads the contexts, selects a sensible one and
 * switches under the leave policy; this component only shows them. Shows
 * `fallback` until a context is selected.
 */
export function ContextSwitch({
  icon,
  label,
  texts,
  fallback,
}: {
  readonly icon: ReactNode;
  readonly fallback: ReactNode;
  /** What a context is in this app, for example "List". */
  readonly label: string;
  readonly texts: { readonly shareMore: string };
}) {
  const {
    contexts,
    selected,
    select,
    failed,
    retry,
    canShare,
    share,
    shareProblem,
  } = useContexts();
  const { messages } = useSdkLocale();
  if (!selected) return fallback;
  // A failed reload keeps the known contexts and offers to try again; a
  // failed request to share shows its reason under the action.
  const actions = [
    ...(failed
      ? [{ label: messages.controls.retry, onSelect: () => void retry() }]
      : []),
    ...(canShare
      ? [
          {
            label: texts.shareMore,
            hint: shareProblem ?? undefined,
            onSelect: () => void share(),
          },
        ]
      : []),
  ];
  return (
    <Menu
      className="context-switch"
      align="start"
      label={`${label}: ${selected.name}`}
      trigger={
        <>
          {icon}
          <span className="context-name">{selected.name}</span>
          <ChevronIcon />
        </>
      }
      items={[
        ...contexts.map((context) => ({
          label: context.name,
          // The SDK's own words, as in its management dialog.
          hint: context.writable
            ? messages.controls.canChange
            : messages.controls.canRead,
          checked: context.iri === selected.iri,
          onSelect: () => {
            if (context.iri !== selected.iri) void select(context.iri);
          },
        })),
        ...(actions.length > 0 ? [null, ...actions] : []),
      ]}
    />
  );
}
