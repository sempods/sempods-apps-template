# One app identity, icons for each surface

Keep the artwork in `apps/<id>/icon.svg`. Without it, the tooling draws the
app name's monogram in the theme's primary colour. Never use an installed
launcher icon, screenshot, or generated PNG as the source for the next build:
that can bake a platform's padding and mask into the artwork again.

| Surface | Generated asset | Treatment |
| --- | --- | --- |
| Browser favicon, app header, AppAccess and an app-owned splash | `public/favicon.svg` | Original SVG, transparency allowed; size it in the component, do not add launcher padding. |
| Generic desktop/PWA icon, catalog | `public/icon-192.png`, `public/icon-512.png` | Original artwork, transparency preserved, manifest purpose `any`. |
| Android/adaptive launcher | `public/icon-maskable-512.png` | Opaque square; the launcher supplies the circle, squircle or other mask; purpose `maskable` only. |
| iOS/iPadOS Home Screen | `public/apple-touch-icon.png` | Opaque 180 × 180 square; the system supplies rounded corners. The generated page head links it explicitly, including on deep links. |

## Supply artwork once

Use a self-contained, static SVG with a square `viewBox`, at most 64 KB.
Outline text; do not depend on an installed font, external images or animation.
Avoid large empty margins: the tooling preserves your composition rather than
trying to guess which pixels are the logo. Check the favicon at 16 and 32 px.

The launcher uses `icon.svg` too unless you supply `icon-maskable.svg` beside
it. Use that optional source when the app logo needs transparency or a tight
crop but the launcher needs a full background or different placement. It
must represent the same app; it changes neither the favicon nor the UI logo.

For the launcher source, extend the background to all four edges. Keep every
essential part of the mark inside the **centred circle of radius 40% of the
image width**. A square inset by 10% is not that circle: its corners can still
be cut off. Do not pre-cut a circle, round the outside corners or bake in an
extra platform border. Transparent pixels are composited onto the theme's
light background. The monogram already supplies a full background and a
safe central letter. The generator adds no padding, trims no artwork and
never scales an earlier output into a new frame.

Run `pnpm run icon <id>` after changing the source, name or theme. This writes
the SVG/PNG outputs, records custom rendering inputs in `.sempods-icon.json`
and refreshes the generated configuration. Commit the sources, generated
outputs, record and configuration together. `check` detects changed custom
sources/backgrounds and missing or modified PNG outputs. Keep any intentional
owner `apple-touch-icon` link; the generated head does not replace it.

## Publish and verify

The build emits launcher copies below `sempods-icons/` whose filenames contain
a digest of the image bytes. The manifest and Apple link use those URLs. The
same bytes keep the same URL across deployments; changed bytes get a new URL.
Do not hand-edit the copies or rename the manifest, change its `id`, or add a
build timestamp to icon URLs to force an update. A direct build with stale
icon hashes fails and asks for `pnpm run regenerate`. The worker precaches the
versioned files, and the dev server serves the same paths.

Check the built page, not only the source:

- Favicon and app/header/login artwork remain legible at their actual sizes.
- Generic icons keep intended transparency. Maskable and Apple icons have
  an opaque background. Preview the launcher as a circle and rounded square;
  the whole meaningful mark fits inside the safe circle.
- The manifest's `any` and `maskable` entries are separate, have the declared
  dimensions, and their URLs return PNGs rather than an HTML fallback.
- Test a fresh installation and an update of an already installed app.
  A successful build or desktop emulation does not prove launcher behavior.

Browsers keep installed app identity separately from the page and may ask the
person to accept an icon update. A deployment does not guarantee an immediate
Home Screen change. For a stale Android installation, compare the live manifest
and icon with Chrome's installed app details (`chrome://webapks`, where
available), and use its update action or the app's offered identity update.
Record browser/OS versions and the before/after result. Do not routinely clear
site data or uninstall: that can remove device-local drafts and preferences.
An iOS/iPadOS device check is still needed before claiming installed support.

References: [maskable icon design](https://web.dev/articles/maskable-icon),
[Chrome icon updates](https://developer.chrome.com/blog/improvements-to-web-app-updates),
[Apple Web Clip icons](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html).
