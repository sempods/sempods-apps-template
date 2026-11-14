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

Keep `src/browser-theme.ts` imported after the page stylesheet. After an
explicit appearance change, call `syncBrowserTheme()` as the Preferences
example does. Set `build.cssTarget: 'esnext'` in Vite so `light-dark()` keeps
following the chosen `color-scheme` in production. To own a page's chrome
colour separately, remove `data-sempods-theme` from its meta element.

The broadly implemented `theme_color` is one static colour. The current
manifest draft adds `color_scheme_dark`, but the inspected Chromium 157
parser does not read it; do not rely on it for installed dark-mode bars. Some
installed browsers use it for native system bars even while the page's meta
colour changes. A quiet brand colour is a deliberate fallback in both modes;
it does not promise an exact match to the page. Android's three-button
navigation and gesture navigation differ. Web code cannot force native bar
contrast, remove system scrims or control every browser/OS version. An OS
launch screen is also separate from a future in-page splash.

To override installed colours, configure `theme_color` and `background_color`
on the manifest passed to `VitePWA` in the app-owned `vite.config.ts`, after
spreading the generated manifest. Do not edit generated configuration or
change manifest identity to force an update. Regenerate config after changing
the palette; run `pnpm run icon <id>` too if its artwork should follow it.

Before claiming device support, test an existing installation and a new one
in both modes, including explicit app appearance opposite to the system.
Record browser/OS versions and navigation mode. Browser emulation verifies
page colours and metadata, not Android's system navigation or iOS chrome.
Installed metadata updates may arrive later than page updates.

References: [manifest theme colour](https://www.w3.org/TR/appmanifest/#theme_color-member),
[Chromium installed navigation colour implementation](https://chromium.googlesource.com/chromium/src/+/0a6ab4f0e2ce17e572b05400ae6eacd7fc5389f0%5E!/),
[Chrome edge-to-edge behavior](https://developer.chrome.com/docs/css-ui/edge-to-edge).
