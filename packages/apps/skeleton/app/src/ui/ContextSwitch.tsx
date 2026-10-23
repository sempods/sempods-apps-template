import type { ReactNode } from 'react';
import { useApp, useWorkflowAccess } from '@sempods/app-sdk/react';
import { ChevronIcon } from './icons.tsx';
import { Menu } from './Menu.tsx';

/** A context's name: its label, else the last segment of its address. */
export function contextName(
  iri: string,
  labels: Readonly<Record<string, string>> | undefined,
): string {
  const label = labels?.[iri]?.trim();
  if (label) return label;
  const segments = new URL(iri).pathname.split('/').filter(Boolean);
  return decodeURIComponent(segments.at(-1) ?? iri);
}

/**
 * The everyday switch between the contexts (for example lists) the person
 * shared with the app: the app icon and the current context's name, opening
 * a menu with the readable contexts, their access and a way to share more.
 * Shows `fallback` until a context is chosen and the shared contexts are
 * known. AppAccess keeps its own chooser for the first choice and for
 * management.
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
  readonly texts: {
    readonly canChange: string;
    readonly readOnly: string;
    readonly shareMore: string;
  };
}) {
  const { connection } = useWorkflowAccess();
  const { selectContext, authorize } = useApp();
  const catalogue = connection?.catalogue;
  const selected = connection?.selectedContext;
  if (!connection || !selected || catalogue?.kind !== 'ready') return fallback;
  const labels = catalogue.labels;
  const current = contextName(selected, labels);
  return (
    <Menu
      className="context-switch"
      align="start"
      label={`${label}: ${current}`}
      trigger={
        <>
          {icon}
          <span className="context-name">{current}</span>
          <ChevronIcon />
        </>
      }
      items={[
        ...catalogue.contexts
          .filter((context) => context.readable)
          .map((context) => ({
            label: contextName(context.iri, labels),
            hint: context.writable ? texts.canChange : texts.readOnly,
            checked: context.iri === selected,
            onSelect: () => {
              if (context.iri !== selected) void selectContext(context.iri);
            },
          })),
        null,
        {
          label: texts.shareMore,
          onSelect: () => void authorize(connection.id),
        },
      ]}
    />
  );
}
