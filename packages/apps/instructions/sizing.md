# Make an app larger

When the owner finds text or controls too small, enlarge the whole app with
ordinary CSS and the components' public props; do not restyle single SDK
controls. Tailwind and the UI kit size text, spacing and most controls in
`rem`, so one relative root size moves them together, menus and dialogs
included.

## Scale from the root

Raise the root font size as a percentage, in `@layer base` of the app's
`src/index.css`, after the imports:

```css
@layer base {
  html {
    font-size: 112.5%;
  }
}
```

A percentage keeps the browser's font setting: 112.5% turns the default 16px
into 18px, and a person who chose larger text gets 112.5% of theirs. Do not
use a pixel size, `zoom` or `transform: scale()`, and do not target a
component's internal classes or `data-slot` attributes. Go one step at a
time and keep the largest that still fits at 375px. Record the size under
Design in `NOTES.md`.

## Measure the real targets

Tell apart the visible box or icon, the target (the area a press actually
reaches) and the row around the control. More padding enlarges the row, not
the target. Not every dimension follows the root either: some controls
reach a fixed number of pixels beyond their box or keep a fixed size. In SDK
0.9, for example, the kit's `Checkbox` target reaches 12px beyond its box,
so it grows only as much as the box; give it a larger box through its
`className` (`size-6`) and room around it. The SDK's `RemoveButton` stays
44px wide while the kit's `HeaderMenu` grows with the root. Where controls
of both kinds share a column, put the fixed one in an element of the other's
size (`size-11`) that centres it, so the icons line up.

Check a target by pressing just outside the visible box, not by reading
class names.

## Check the result

Follow the [visual check](visual-check.md) at the new size, and also check:

- wrapping at 375px and with the browser's text set larger still: the header,
  long names and the bar at the bottom;
- menus, dialogs and the date chooser, which open outside the screen's
  layout, and the SDK's editors and confirmations;
- adding at the bottom with the phone's keyboard open, keyboard use and
  focus;
- light and dark.

Browser screenshots show layout, not how a thumb meets a control. Before
saying that the app is easier to use on a phone, ask the owner to try it on
theirs, and record the device and their verdict under Tested.
