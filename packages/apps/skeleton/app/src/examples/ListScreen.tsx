// An example, not mounted: the default screen of a list app, built from the
// SDK's quickstart screen with the UI kit (@sempods/app-ui). For a list app,
// copy it next to App.tsx, render <ListScreen nav={nav} /> in place of
// <Start />, declare the item address in apps.json (`"resources":
// ["items/:id"]`) and run pnpm run regenerate; then rename the type, fields,
// collection, address and texts to the app's own. Keep App.tsx's runtime,
// provider and frame; take behaviour from the SDK's examples, never their
// runtime, provider or styles.
import { useEffect, useRef } from 'react';
import {
  LoadNotice,
  RemoveButton,
  ResourceEditor,
  UnresolvedNotices,
  UpdateNotice,
  useAppState,
  useContextEditor,
  useCreation,
  useFieldUpdate,
  useList,
  useMessages,
  useSdkLocale,
  useWorkflowAccess,
} from '@sempods/app-sdk/react';
import { fields, flag, text } from '@sempods/client-sdk/edit';
import { ActionButton, Input, ScreenDialog, type Nav } from '@sempods/app-ui';
import { PlusIcon } from 'lucide-react';
import type { Place } from '../places.ts';

const schema = 'https://schema.org/';

/** What one row is: a name and whether it is done. */
const item = fields(
  {
    name: text(`${schema}name`, { language: null, trim: true }),
    done: flag(`${schema}actionStatus`, {
      on: `${schema}CompletedActionStatus`,
      off: `${schema}PotentialActionStatus`,
    }),
  },
  { type: `${schema}Action` },
);

// In an app these belong in src/texts.ts.
const en = {
  empty: 'Nothing here yet. Add the first item below.',
  emptyReadOnly: 'Nothing in this list.',
  done: (name: string) => `Done: ${name}`,
  remove: (name: string) => `Delete: ${name}`,
  edit: 'Edit item',
  name: 'Name',
  newItem: 'New item',
  add: 'Add',
};
const listTexts: { readonly en: typeof en; readonly de: typeof en } = {
  en,
  de: {
    empty: 'Noch nichts hier. Füge unten den ersten Eintrag hinzu.',
    emptyReadOnly: 'Nichts in dieser Liste.',
    done: (name) => `Erledigt: ${name}`,
    remove: (name) => `Löschen: ${name}`,
    edit: 'Eintrag bearbeiten',
    name: 'Name',
    newItem: 'Neuer Eintrag',
    add: 'Hinzufügen',
  },
};

export function ListScreen({ nav }: { readonly nav: Nav<Place> }) {
  const t = useMessages(listTexts);
  // A list that can only be read gets no input and no invitation to add.
  const { write } = useWorkflowAccess();
  const { view } = useAppState();
  const list = useList(item);
  const items = list.data?.items;
  // One hook for the list; each row gets its part with `mutate.for(row)`.
  const mutate = useFieldUpdate(item);
  const creation = useCreation(item, {
    initial: { name: '', done: false },
    collection: 'items',
  });
  const input = useRef<HTMLInputElement>(null);
  if (!view) return null;
  const { place } = nav;
  // A link names the Context the list reads, so the address keeps its source.
  const itemPlace = (subject: string): Place => ({
    kind: 'item',
    subject,
    context: view.contextIri,
  });

  return (
    // Room below the rows for the bar fixed at the bottom.
    <div className="mt-4 pb-28">
      {/* Loading, a failed read with "Try again", never a failure as empty. */}
      <LoadNotice {...list} />
      {(list.state.kind === 'ready' || list.state.kind === 'loading') &&
        items?.length === 0 &&
        list.data?.skipped === 0 && (
          <p className="py-6 text-muted-foreground">
            {write ? t.empty : t.emptyReadOnly}
          </p>
        )}
      <ul className="divide-y">
        {items?.map((entry) => {
          const row = mutate.for(entry);
          return (
            <li key={entry.iri} className="flex min-h-14 items-center gap-1">
              {/* The label is the checkbox's 44px touch target. */}
              <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  className="size-6 accent-primary"
                  checked={row.data.done}
                  disabled={!row.canMutate}
                  onChange={() => void row.update({ done: !row.data.done })}
                />
                <span className="sr-only">{t.done(row.data.name)}</span>
              </label>
              {/* The item's own address: a plain click opens its dialog, a
                  modified click a new tab. */}
              <a
                {...nav.link(itemPlace(entry.iri))}
                className="flex min-h-11 flex-1 items-center rounded-md px-2 hover:bg-muted"
              >
                {row.data.name}
              </a>
              {/* Asks in the SDK's dialog before it deletes. */}
              <RemoveButton
                disabled={!row.canMutate}
                onRemove={row.remove}
                label={t.remove(row.data.name)}
              />
              {/* The changed row is the confirmation; problems show here. */}
              <UpdateNotice {...row.notice} quiet />
            </li>
          );
        })}
      </ul>
      {/* Recovery for a row with an open write that is no longer listed. */}
      <UnresolvedNotices of={mutate} shown={items} />
      <ItemDialog
        subject={place.kind === 'item' ? place.subject : null}
        // The Context the address names; only an address without one uses
        // the selected Context.
        context={(place.kind === 'item' && place.context) || view.contextIri}
        title={t.edit}
        label={t.name}
        // Back to where it was opened from, after a direct entry to the
        // start; the list refreshes on its own time, so a slow read never
        // keeps the dialog open.
        leave={() => {
          nav.close({ kind: 'start' });
          void list.reload();
        }}
      />
      <UpdateNotice {...creation.notice} quiet />
      {write && (
        // A bar fixed at the bottom, in thumb reach, above the home indicator.
        // Render it outside views that switch: switching does not ask about
        // an unsent creation draft, and unmounting loses it.
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
          <form
            className="mx-auto flex max-w-3xl items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              // The field keeps the focus, also after a press on Add, so the
              // keyboard stays for the next item. Only this press moves it.
              input.current?.focus();
              void creation.create();
            }}
          >
            <Input
              ref={input}
              className="h-11 flex-1"
              aria-label={t.newItem}
              placeholder={t.newItem}
              value={creation.draft.name}
              // While a creation is pending the field stays focused and
              // cannot change; a confirmed creation empties it.
              readOnly={creation.busy}
              disabled={!creation.canEdit && !creation.busy}
              onChange={(event) => creation.change({ name: event.target.value })}
            />
            <ActionButton
              type="submit"
              shape="round-sm"
              label={t.add}
              isDisabled={!creation.canCreate}
            >
              <PlusIcon />
            </ActionButton>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * The item's screen: a dialog that follows the address, with the SDK's
 * editor for the Context the address names. Escape, Close and a press beside
 * it ask before an unsaved edit is discarded; Back does too.
 */
function ItemDialog({
  subject,
  context,
  title,
  label,
  leave,
}: {
  readonly subject: string | null;
  readonly context: string;
  readonly title: string;
  readonly label: string;
  readonly leave: () => void;
}) {
  const { messages } = useSdkLocale();
  const edit = useContextEditor(item);
  const { open, close } = edit;
  // While the SDK changes the target (`changing`), it opens no editor; the
  // effect runs again once the change has settled.
  const { changing } = useAppState();
  useEffect(() => {
    if (changing) return;
    if (subject) void open({ subject, context });
    else void close();
  }, [subject, context, changing, open, close]);
  // An editor still showing another target is not this dialog's.
  const editor =
    subject &&
    edit.target?.subject === subject &&
    edit.target.context === context
      ? edit.editor
      : null;
  // The SDK asks before a dirty draft is discarded; leaving the address does
  // not wait for the list to reload.
  const requestClose = async () => {
    if (await edit.close()) leave();
  };
  return (
    <ScreenDialog
      title={title}
      open={subject !== null}
      onRequestClose={() => void requestClose()}
    >
      {edit.phase === 'unavailable' && edit.problem ? (
        // A source Context the app cannot read: no editor, no other Context.
        <p role="alert">{messages.contextProblems?.[edit.problem]}</p>
      ) : (
        <ResourceEditor
          editor={editor}
          quiet
          onClose={() => void requestClose()}
          labels={{ name: label }}
        >
          {(draft, change) => (
            <label className="grid gap-1.5">
              {label}
              <Input
                value={draft.name}
                onChange={(event) =>
                  change({ ...draft, name: event.target.value })
                }
                required
              />
            </label>
          )}
        </ResourceEditor>
      )}
    </ScreenDialog>
  );
}
