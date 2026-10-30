// The spike's primitives on shadcn/ui (radix-nova) over Radix; interop gate only.
import { useState } from 'react';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, EllipsisIcon, MenuIcon, XIcon } from 'lucide-react';
import type { UiKit } from '@spike/harness/screen';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Day strings <-> local dates at noon: react-day-picker works with Date
// objects, so the conversion must never pass through UTC midnight.
const toDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12);
};
const toDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const shapes = {
  pill: 'h-14 rounded-full px-6 text-base',
  round: 'size-14 rounded-full [&_svg:not([class*=size-])]:size-5',
  'round-lg': 'size-18 rounded-full [&_svg:not([class*=size-])]:size-7',
} as const;

export const kit: UiKit = {
  name: 'shadcn/Radix',
  ScreenDialog({ title, closeLabel, open, onRequestClose, actions, children }) {
    return (
      <Dialog open={open} onOpenChange={(next) => { if (!next) onRequestClose(); }}>
        <DialogContent
          showCloseButton={false}
          className="flex flex-col gap-0 p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-0 max-sm:rounded-none sm:max-h-[min(48rem,calc(100dvh-4rem))] sm:max-w-2xl"
        >
          <header className="flex items-center gap-2 border-b px-4 py-2">
            <DialogTitle className="flex-1 text-lg">{title}</DialogTitle>
            {actions}
            <Button variant="ghost" size="icon-lg" className="size-11" aria-label={closeLabel} title={closeLabel} onClick={onRequestClose}>
              <XIcon />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
        </DialogContent>
      </Dialog>
    );
  },
  HeaderMenu({ label, items, icon = 'menu' }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon-lg" className="size-11 rounded-full" aria-label={label} title={label}>
            {icon === 'menu' ? <MenuIcon /> : <EllipsisIcon />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {items.map((item, i) =>
            item === null ? (
              <DropdownMenuSeparator key={i} />
            ) : 'choices' in item ? (
              <DropdownMenuSub key={i}>
                <DropdownMenuSubTrigger className="min-h-11">{item.label}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={item.choices.find((c) => c.checked)?.label ?? ''}>
                    {item.choices.map((choice) => (
                      <DropdownMenuRadioItem key={choice.label} value={choice.label} className="min-h-11" onSelect={choice.onSelect}>
                        {choice.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
              <DropdownMenuItem key={i} className="min-h-11" onSelect={item.onSelect}>
                {item.label}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
  DateField({ label, value, onChange, noneLabel, applyLabel, locale }) {
    const [open, setOpen] = useState(false);
    const [picked, setPicked] = useState<Date | undefined>(value ? toDate(value) : undefined);
    const shown = value
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(toDate(value))
      : noneLabel;
    return (
      <div className="grid gap-1.5">
        <span>{label}</span>
        <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setPicked(value ? toDate(value) : undefined); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-11 justify-between text-base font-normal" aria-label={`${label}: ${shown}`}>
              {shown}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <Calendar mode="single" selected={picked} onSelect={setPicked} defaultMonth={picked} />
            <Button className="mt-2 h-11 w-full" disabled={!picked} onClick={() => { if (picked) onChange(toDay(picked)); setOpen(false); }}>
              {applyLabel}
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    );
  },
  Button({ variant, shape = 'pill', label, onPress, disabled, children }) {
    return (
      <Button
        variant={variant === 'primary' ? 'default' : variant}
        className={shapes[shape]}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onPress}
      >
        {children}
      </Button>
    );
  },
  Icon({ name }) {
    return name === 'check' ? <CheckIcon strokeWidth={2.5} /> : name === 'left' ? <ChevronLeftIcon /> : <ChevronRightIcon />;
  },
};
