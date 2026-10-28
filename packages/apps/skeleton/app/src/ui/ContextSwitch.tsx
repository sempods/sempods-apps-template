import type { ReactNode } from 'react';
import { useContexts, useSdkLocale } from '@sempods/app-sdk/react';
import { ChevronIcon } from './icons.tsx';
import { Menu } from './Menu.tsx';

/**
 * The everyday switch for an app that works in one of several contexts at a
 * time (for example lists): the app icon and the current context's name in
 * place of the header's `<h1>`, opening a menu with the readable contexts,
 * their access and a way to share more. The SDK's `useContexts` loads the
 * contexts, selects a sensible one and switches under the leave policy; this
 * component only shows them. Until a context is selected it shows the app's
 * icon and `title` as the `<h1>`; then the `<h1>` names the app for screen
 * readers only, outside the menu. Name things in the person's words: `label`
 * "List", `shareMore` "Share more lists …".
 */
export function ContextSwitch({
  icon,
  title,
  label,
  texts,
}: {
  readonly icon: ReactNode;
  /** The app's name. */
  readonly title: string;
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
  if (!selected)
    return (
      <h1>
        {icon}
        {title}
      </h1>
    );
  // A failed reload keeps the known contexts and offers to try again; a
  // failed request to share says why below the switch.
  const actions = [
    ...(failed
      ? [{ label: messages.controls.retry, onSelect: () => void retry() }]
      : []),
    ...(canShare
      ? [{ label: texts.shareMore, onSelect: () => void share() }]
      : []),
  ];
  return (
    <div className="context-switch-wrap">
      <h1 className="visually-hidden">{title}</h1>
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
      {shareProblem && (
        <p role="alert" className="context-switch-problem">
          {shareProblem}
        </p>
      )}
    </div>
  );
}
