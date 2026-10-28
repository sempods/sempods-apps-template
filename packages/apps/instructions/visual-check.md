# Check a screen visually

The owner judges an app by what they see. Before reporting a screen as done,
look at it the way they will and fix what fails; the [app workflow](app-workflow.md)
says when.

## Look at the real states

Open the app in a browser you can control, signed in to the test context, and
take screenshots:

- at 375px wide and at desktop width;
- in light and in dark mode;
- with real states: the empty list, a few items, an open item or dialog, and
  a notice (for example after a refused change or with read-only access).

Without a browser tool, or without a test context, say which states you could
not see; do not describe them as checked. Without a Pod, only the sign-in
screen is visible.

## Checklist

- Spacing and alignment are consistent; nothing touches the screen edge.
- The hierarchy is clear: one primary action per screen or dialog, other
  actions read as text.
- Every control has a 44px touch target; checkboxes are wrapped in their
  label.
- Nothing scrolls sideways at 375px.
- The empty state says in one friendly line what to do next.
- The app does not repeat a message an SDK component already shows.
- The app's icon and name are present in the header and on the sign-in
  screen.
- Text and controls keep their contrast in both modes; colours come from the
  app's theme.
- A bar fixed at the bottom is not covered and leaves room for the content
  above it.

## Ask the owner

Fix what fails, then show the owner the 375px screenshot of the main state and
ask for a short verdict before moving on. Record the states checked, the
widths and modes, and the owner's verdict under Tested in the app's
`NOTES.md`; design choices made on the way go under Design.
