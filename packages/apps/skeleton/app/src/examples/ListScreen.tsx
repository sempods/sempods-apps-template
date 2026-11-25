// An example, not mounted: the default screen of a list app, built from the
// SDK's quickstart screen with the UI kit (@sempods/app-ui). For a list app,
// copy it next to App.tsx, change its import of '../places.ts' to
// './places.ts', render <ListScreen nav={nav} /> in place of <Start />,
// declare the item address in apps.json (`"resources": ["items/:id"]`) and
// run pnpm run regenerate; then rename the type, fields, collection, address
// and texts to the app's own. Keep App.tsx's runtime,
// provider and frame; take behaviour from the SDK's examples, never their
// runtime, provider or styles.
import { useEffect, useRef, useState } from 'react';
import {
  LoadNotice,
  RemoveButton,
  ResourceEditor,
  UnresolvedNotices,
  UpdateNotice,
  type FieldUpdateRow,
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
import {
  ActionButton,
  Checkbox,
  Input,
  ScreenDialog,
  type Nav,
} from '@sempods/app-ui';
import { LoaderCircleIcon, PlusIcon } from 'lucide-react';
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
type Item = ReturnType<typeof item.read>;

// In an app these belong in src/texts.ts.
const en = {
  empty: 'Nothing here yet. Add the first item below.',
  emptyReadOnly: 'Nothing in this list.',
  done: (name: string) => `Done: ${name}`,
  saving: (name: string) => `Saving: ${name}`,
  doneItems: 'Done',
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
    saving: (name) => `Wird gespeichert: ${name}`,
    doneItems: 'Erledigt',
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
  // The ticks asked for and not yet settled, for this list's target only.
  const ticks = useTicks(view?.key);
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
  const rows = items?.map((entry) => ({
    entry,
    row: mutate.for(entry),
    tick: ticks.of(entry.iri),
  }));
  type Row = NonNullable<typeof rows>[number];
  // A ticked row stays in its group until its confirmed tick has left it.
  const isDone = ({ row, tick }: Row) => (tick ? !tick.done : row.data.done);
  const open = rows?.filter((shown) => !isDone(shown));
  const done = rows?.filter(isDone);
  const rowView = ({ entry, row, tick }: Row) => (
    // After a confirmed tick the row collapses (`leaving`), then moves to its
    // new group; it takes no presses while it leaves.
    <li
      key={entry.iri}
      data-item={entry.iri}
      inert={tick?.leaving}
      className={`grid transition-[grid-template-rows,opacity] duration-180 ease-out motion-reduce:transition-none ${tick?.leaving ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]'}`}
    >
      <div className={`min-h-0 ${tick?.leaving ? 'overflow-hidden' : ''}`}>
        {/* The row wraps, so a notice gets its own full-width line below. */}
        <div className="flex min-h-14 flex-wrap items-center gap-1">
          {/* The kit's Checkbox, named for its row: its 44px target reaches
              12px beyond the box, so the margin keeps it off the link. A
              tick shows at once; until the SDK settles it the box keeps its
              focus and takes no second press. */}
          <Checkbox
            className="mx-3"
            aria-label={t.done(row.data.name)}
            isSelected={tick?.done ?? row.data.done}
            isReadOnly={tick !== undefined}
            isDisabled={!tick && !row.canMutate}
            onChange={(checked) => void ticks.tick(entry.iri, row, checked)}
          />
          {/* The item's own address: a plain click opens its dialog, a
              modified click a new tab. */}
          <a
            {...nav.link(itemPlace(entry.iri))}
            className="flex min-h-11 min-w-0 flex-1 items-center rounded-md px-2 wrap-anywhere hover:bg-muted"
          >
            {row.data.name}
          </a>
          {tick ? (
            // Saving, in Delete's place, until the SDK settles the tick.
            <span className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
              {!tick.leaving && (
                <LoaderCircleIcon
                  aria-hidden="true"
                  className="size-4 motion-safe:animate-spin"
                />
              )}
            </span>
          ) : (
            // Asks in the SDK's dialog before it deletes.
            <RemoveButton
              disabled={!row.canMutate}
              onRemove={row.remove}
              label={t.remove(row.data.name)}
            />
          )}
          {/* Mounted before its text changes, so it is announced. */}
          <span role="status" className="sr-only">
            {tick && !tick.leaving ? t.saving(row.data.name) : ''}
          </span>
          {/* The changed row is the confirmation; problems show here, across
              the row's full width. */}
          <div className="basis-full pb-2 empty:hidden">
            <UpdateNotice {...row.notice} quiet />
          </div>
        </div>
      </div>
    </li>
  );

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
      <ul className="divide-y">{open?.map(rowView)}</ul>
      {/* Done items below, under a heading, once there are some. */}
      {done && done.length > 0 && (
        <>
          <h2 className="mt-6 px-3 pb-1 text-sm font-medium text-muted-foreground">
            {t.doneItems}
          </h2>
          <ul className="divide-y">{done.map(rowView)}</ul>
        </>
      )}
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
              // The field keeps the focus, so the keyboard stays for the next
              // item; Add never takes it (preventFocusOnPress below).
              input.current?.focus();
              if (creation.canCreate) void creation.create();
            }}
          >
            <Input
              ref={input}
              className="h-11 flex-1"
              aria-label={t.newItem}
              placeholder={t.newItem}
              value={creation.draft.name}
              // While a creation is pending the field ignores typing; a
              // confirmed creation empties it. Not readOnly: a phone closes
              // its keyboard when a focused field becomes read-only.
              disabled={!creation.canEdit && !creation.busy}
              onChange={(event) => {
                if (!creation.busy)
                  creation.change({ name: event.target.value });
              }}
            />
            <ActionButton
              type="submit"
              shape="round-sm"
              label={t.add}
              isDisabled={!creation.canCreate}
              preventFocusOnPress
            >
              <PlusIcon />
            </ActionButton>
          </form>
        </div>
      )}
    </div>
  );
}

/** How long a confirmed row takes to leave its group, as `duration-180`. */
const leaveMs = 180;
type Tick = { readonly done: boolean; readonly leaving: boolean };

/**
 * The ticks the person asked for, until the SDK settles them. Presentation
 * only: the rows keep the SDK's confirmed data, notices and recovery. Only a
 * confirmed write (`saved`) lets a row leave its group, briefly and without
 * motion when the person asks for less; every other outcome drops the tick
 * and the row's notice shows what happened. Another target or leaving the
 * screen drops every tick, and a late outcome or timer changes nothing.
 */
function useTicks(target: string | undefined) {
  const live = useRef(new Map<string, Tick>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [ticks, setTicks] = useState<ReadonlyMap<string, Tick>>(new Map());
  useEffect(() => {
    const own = live.current;
    const pending = timers.current;
    return () => {
      own.clear();
      pending.forEach(clearTimeout);
      pending.clear();
      setTicks(new Map());
    };
  }, [target]);
  // Replaces a tick that is still current; false once it was dropped.
  const settle = (iri: string, from: Tick, to?: Tick) => {
    if (live.current.get(iri) !== from) return false;
    if (to) live.current.set(iri, to);
    else live.current.delete(iri);
    setTicks(new Map(live.current));
    return true;
  };
  const tick = async (
    iri: string,
    row: Pick<FieldUpdateRow<Item>, 'canMutate' | 'update'>,
    done: boolean,
  ) => {
    if (!target || !row.canMutate || live.current.has(iri)) return;
    const pending: Tick = { done, leaving: false };
    live.current.set(iri, pending);
    setTicks(new Map(live.current));
    const outcome = await row.update({ done }).catch((error: unknown) => {
      settle(iri, pending);
      throw error;
    });
    // Only a confirmed write leaves; any other outcome shows the row's notice.
    if (outcome.kind !== 'saved') {
      settle(iri, pending);
      return;
    }
    if (live.current.get(iri) !== pending) return;
    // Focus in the leaving row moves to its neighbour's checkbox.
    const from = document.activeElement?.closest('li');
    if (from instanceof HTMLElement && from.dataset.item === iri)
      (from.nextElementSibling ?? from.previousElementSibling)
        ?.querySelector('input')
        ?.focus();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      settle(iri, pending);
      return;
    }
    const leaving: Tick = { done, leaving: true };
    settle(iri, pending, leaving);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      settle(iri, leaving);
    }, leaveMs);
    timers.current.add(timer);
  };
  return { of: (iri: string) => ticks.get(iri), tick };
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
