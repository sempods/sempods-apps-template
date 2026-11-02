// An example, not mounted: the everyday switch for an app that works in one
// of several contexts at a time (for example lists), built with the UI kit's
// menu parts. Copy it next to App.tsx and render it in place of the header's
// <h1>, with the app's icon and title.
import type { ReactNode } from 'react';
import { useContexts, useSdkLocale } from '@sempods/app-sdk/react';
import {
  Button,
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sempods/app-ui';
import { ChevronDownIcon } from 'lucide-react';

/**
 * The app icon and the current context's name in place of the header's
 * `<h1>`, opening a menu with the readable contexts, their access and a way
 * to share more. The SDK's `useContexts` loads the contexts, selects a
 * sensible one and switches under the leave policy; this component only shows
 * them. Until a context is selected it shows the app's icon and `title` as the
 * `<h1>`; then the `<h1>` names the app for screen readers only, outside the
 * menu. Name things in the person's words: `label` "List", `shareMore`
 * "Share more lists …".
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
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        {icon}
        {title}
      </h1>
    );
  return (
    <div className="grid min-w-0 gap-1">
      <h1 className="sr-only">{title}</h1>
      <DropdownMenuTrigger>
        <Button
          variant="ghost"
          className="h-11 max-w-full justify-start gap-2 px-2 text-xl font-semibold"
          aria-label={`${label}: ${selected.name}`}
        >
          {icon}
          <span className="truncate">{selected.name}</span>
          <ChevronDownIcon />
        </Button>
        <DropdownMenu placement="bottom start" className="min-w-56">
          {/* The contexts as checked choices; the actions below are not. */}
          <DropdownMenuGroup
            aria-label={label}
            selectionMode="single"
            selectedKeys={[selected.iri]}
          >
            {contexts.map((context) => (
              <DropdownMenuItem
                key={context.iri}
                id={context.iri}
                className="min-h-11"
                textValue={context.name}
                onAction={() => {
                  if (context.iri !== selected.iri) void select(context.iri);
                }}
              >
                <span className="grid">
                  {context.name}
                  {/* The SDK's own words, as in its management dialog. */}
                  <span className="text-sm text-muted-foreground">
                    {context.writable
                      ? messages.controls.canChange
                      : messages.controls.canRead}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {(failed || canShare) && <DropdownMenuSeparator />}
          {/* A failed reload keeps the known contexts and offers to try
              again. */}
          {failed && (
            <DropdownMenuItem
              id="retry"
              className="min-h-11"
              onAction={() => void retry()}
            >
              {messages.controls.retry}
            </DropdownMenuItem>
          )}
          {canShare && (
            <DropdownMenuItem
              id="share"
              className="min-h-11"
              onAction={() => void share()}
            >
              {texts.shareMore}
            </DropdownMenuItem>
          )}
        </DropdownMenu>
      </DropdownMenuTrigger>
      {/* A failed request to share says why below the switch. */}
      {shareProblem && (
        <p role="alert" className="text-sm text-destructive">
          {shareProblem}
        </p>
      )}
    </div>
  );
}
