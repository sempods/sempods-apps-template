# Choose one palette for the app

Start with sage. The ordinary screen, SDK login, dialogs and controls share
its colour roles; a special login theme is unnecessary. Three starting
palettes have light and dark values:

| Theme | Character | Light primary | Dark primary |
| --- | --- | --- | --- |
| `sage` (default) | Quiet green, softly tinted surfaces | `#3e6b56` | `#a2cbb4` |
| `fresh` | Clear petrol, cool surfaces | `#0a6680` | `#5ec6e4` |
| `warm` | Terracotta, cream surfaces | `#9c4128` | `#f0a184` |

Use `pnpm run new-app <id> --theme sage` or change the one theme import in
`src/index.css`. Neutral `calm` and violet `playful` remain available. The
CSS file in `src/themes/` belongs to the app: change role values there,
without copying components or introducing a theme provider. Keep foreground
and background pairs together. Run `pnpm run check:theme <id>` after changes
and inspect the actual screens in both modes.

Use roles such as `--background`, `--primary` and `--muted-foreground` in
components. The UI kit maps them to the SDK's `--sempods-*` tokens; do not
maintain a second palette for login. Palette and action treatment are
independent: the starter uses `data-actions="inverted"` and
`data-secondary="text"` on `<html>`. Apps can choose the other documented
button variants without replacing colours.

## Page, installed app and catalog

| Surface | Source |
| --- | --- |
| Running page and marked `theme-color` meta elements | Resolved `--background`, including an explicit appearance choice |
| Manifest `background_color` | Light background, as a static launch fallback |
| Manifest `theme_color` | Light primary, as a static installed-app brand colour |
| Generated monogram | Primary and primary foreground; see [icons](icons.md) |
| Personal overview | `catalog.theme`, default sage |
| Independent app store | Its own palette; app icons retain their identity |

Follow the [screen consistency instructions](app-workflow.md#build-the-screen)
for browser-theme synchronization, explicit appearance changes and page
colour overrides.

The manifest's `theme_color` is one static colour. Do not rely on
`color_scheme_dark` for installed dark-mode bars. Some installed browsers
use `theme_color` for native system bars even while the page's meta colour
changes. The theme's light primary is the fallback in both modes, so it can
also differ from a light page. Android's three-button navigation and gesture
navigation differ. Web code cannot force native bar contrast, remove system
scrims or control every browser/OS version. An OS launch screen is separate
from an in-page splash.

To override installed colours, replace the guarded `VitePWA` entry in the
`plugins` array of the app-owned `vite.config.ts`, preserving the generated
options and manifest fields. For example, to use sage's light page colour
for installed chrome:

```ts
...(pwa ? [VitePWA({
  ...pwa,
  manifest: {
    ...pwa.manifest,
    theme_color: '#f7f9f7',
  },
})] : []),
```

Set `background_color` in the same object to override the launch fallback.
Do not edit generated configuration or change manifest identity to force an
update. Run `pnpm run regenerate` after changing the palette; run
`pnpm run icon <id>` too if its artwork should follow it.

Before claiming device support, test an existing installation and a new one
in both modes, including explicit app appearance opposite to the system.
Record browser/OS versions and navigation mode. Browser emulation verifies
page colours and metadata, not Android's system navigation or iOS chrome.
Installed metadata updates may arrive later than page updates.

References: [manifest theme colour](https://www.w3.org/TR/appmanifest/#theme_color-member),
[Chromium installed navigation colour implementation](https://chromium.googlesource.com/chromium/src/+/0a6ab4f0e2ce17e572b05400ae6eacd7fc5389f0%5E!/),
[Chrome edge-to-edge behavior](https://developer.chrome.com/docs/css-ui/edge-to-edge).
