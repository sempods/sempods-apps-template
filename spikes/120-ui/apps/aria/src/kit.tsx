// The spike's primitives on shadcn/ui (aria-nova) over React Aria Components.
import { useState } from 'react';
import { parseDate, type CalendarDate } from '@internationalized/date';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, EllipsisIcon, MenuIcon, XIcon } from 'lucide-react';
import { Dialog as AriaDialog, Heading, I18nProvider } from 'react-aria-components';
import type { UiKit } from '@spike/harness/screen';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverTrigger } from '@/components/ui/popover';

const shapes = {
  pill: 'h-14 rounded-full px-6 text-base',
  round: 'size-14 rounded-full [&_svg:not([class*=size-])]:size-5',
  'round-lg': 'size-18 rounded-full [&_svg:not([class*=size-])]:size-7',
} as const;

export const kit: UiKit = {
  name: 'shadcn/React Aria',
  ScreenDialog({ title, closeLabel, open, onRequestClose, actions, children }) {
    return (
      <Dialog
        isOpen={open}
        onOpenChange={(next) => { if (!next) onRequestClose(); }}
        // SDK confirmations are native top-layer dialogs outside this modal's
        // DOM: a press in them is not a press beside the dialog.
        shouldCloseOnInteractOutside={(element) => !element.closest('dialog')}
        showCloseButton={false}
        className="flex flex-col gap-0 p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-0 max-sm:rounded-none sm:max-h-[min(48rem,calc(100dvh-4rem))] sm:max-w-2xl [&>[data-slot=dialog]]:flex [&>[data-slot=dialog]]:min-h-0 [&>[data-slot=dialog]]:flex-1 [&>[data-slot=dialog]]:flex-col"
      >
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <Heading slot="title" className="flex-1 text-lg font-medium">{title}</Heading>
          {actions}
          <Button variant="ghost" size="icon-lg" className="size-11" aria-label={closeLabel} onPress={onRequestClose}>
            <XIcon />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      </Dialog>
    );
  },
  HeaderMenu({ label, items, icon = 'menu' }) {
    return (
      <DropdownMenuTrigger>
        <Button variant="secondary" size="icon-lg" className="size-11 rounded-full" aria-label={label}>
          {icon === 'menu' ? <MenuIcon /> : <EllipsisIcon />}
        </Button>
        <DropdownMenu placement="bottom end" className="min-w-48">
          {items.map((item, i) =>
            item === null ? (
              <DropdownMenuSeparator key={i} />
            ) : 'choices' in item ? (
              <DropdownMenuSub key={i}>
                <DropdownMenuSubTrigger className="min-h-11">{item.label}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  selectionMode="single"
                  selectedKeys={item.choices.filter((c) => c.checked).map((c) => c.label)}
                >
                  {item.choices.map((choice) => (
                    <DropdownMenuItem key={choice.label} id={choice.label} className="min-h-11" onAction={choice.onSelect}>
                      {choice.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
              <DropdownMenuItem key={i} className="min-h-11" onAction={item.onSelect}>
                {item.label}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenu>
      </DropdownMenuTrigger>
    );
  },
  DateField({ label, value, onChange, noneLabel, applyLabel, locale }) {
    const [open, setOpen] = useState(false);
    const [picked, setPicked] = useState<CalendarDate | null>(value ? parseDate(value) : null);
    // CalendarDate is date-only: no instant, no time zone.
    const shown = value
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'))
      : noneLabel;
    return (
      <div className="grid gap-1.5">
        <span>{label}</span>
        <PopoverTrigger isOpen={open} onOpenChange={(next) => { setOpen(next); if (next) setPicked(value ? parseDate(value) : null); }}>
          <Button variant="outline" className="h-11 justify-between text-base font-normal" aria-label={`${label}: ${shown}`}>
            {shown}
          </Button>
          <Popover placement="bottom start" className="w-auto p-2">
            <AriaDialog aria-label={label} className="outline-none">
              {/* React Aria reads the browser's locale unless told otherwise. */}
              <I18nProvider locale={locale}>
                <Calendar aria-label={label} autoFocus value={picked} onChange={setPicked} />
              </I18nProvider>
              <Button className="mt-2 h-11 w-full" isDisabled={!picked} onPress={() => { if (picked) onChange(picked.toString()); setOpen(false); }}>
                {applyLabel}
              </Button>
            </AriaDialog>
          </Popover>
        </PopoverTrigger>
      </div>
    );
  },
  Button({ variant, shape = 'pill', label, onPress, disabled, children }) {
    return (
      <Button
        variant={variant === 'primary' ? 'default' : variant}
        className={shapes[shape]}
        aria-label={label}
        isDisabled={disabled}
        onPress={onPress}
      >
        {children}
      </Button>
    );
  },
  Icon({ name }) {
    return name === 'check' ? <CheckIcon strokeWidth={2.5} /> : name === 'left' ? <ChevronLeftIcon /> : <ChevronRightIcon />;
  },
};
