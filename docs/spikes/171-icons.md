# Installed icons and the generation pipeline

Investigation for [#171](https://github.com/sempods/sempods-apps-template/issues/171),
14 November 2026. The owner reports icons becoming smaller after each app
update on a Pixel 8 using Chrome. The apps are installed from
`https://apps.sempods.org/{konsum,focus,explorer}/`.

## What the evidence establishes

The screenshot shows older pictorial icons on white circular launcher plates.
The public site currently serves K/F/E monograms instead. Both published PNG
sizes match the app repository's committed files byte for byte:

| App | Last PNG change | SHA-256 prefix, 192 px | SHA-256 prefix, 512 px |
| --- | --- | --- | --- |
| Konsum | 2026-10-28, `d530d9f` | `f6149cdac35d07ee` | `bd315513e0062df2` |
| Focus | 2026-10-29, `9ddd1f4` | `5504c44358d03deb` | `4599a1fc7ce187a8` |
| Explorer | 2026-11-04, `674d53b` | `98c9e096e2b8d0dc` | `1109094a85a8f579` |

Each PNG has its declared dimensions and artwork filling the image. No new
padding accumulated in these files during subsequent deployments. The
production manifests name only the two generic icons at fixed URLs; neither
maskable nor Apple touch files were served. The source for this deployed site
uses tooling 0.10.0; the changes on template main have not been released there.

The installed icon is therefore not the current served bitmap. The continuing
shrinkage is consistent with installed-browser/WebAPK processing or retained
identity, but we have not inspected the Pixel's installed package or reproduced
its update loop. It is not established as a generator or deployment resize bug.
Do not claim the device is fixed from a browser screenshot or a passing build.

## Confirmed gaps and changes

- Android may put an `any` icon on a white plate. A separate opaque maskable
  icon gives the launcher the full background and lets it apply its own shape.
  Template main already added this for 0.11; deployment still needs that release.
- Chrome's newer update process treats an unchanged `icons` entry as unchanged
  artwork. Replacing bytes at the same URL is insufficient. The generated
  configuration now names content-addressed copies, and the Vite plugin emits
  them in the build and serves them in dev. Rebuilding unchanged artwork keeps
  the same URL. Manifest identity, path and app scope remain unchanged.
- iOS/iPadOS gets an explicit opaque 180 px Apple touch icon and an absolute
  per-app link on every route. Existing owner links remain authoritative.
- A custom SVG may work well as a small transparent logo but need different
  launcher composition. Optional `icon-maskable.svg` supplies that composition
  for maskable and Apple variants. No automatic crop, content guessing or
  repeated padding is applied. The meaningful mark must fit a circular safe
  zone, not just an 80% square.
- Custom rendering fixes colour scheme and device pixel scale. The original
  SVGs are immutable inputs. A generation record detects changed sources,
  background or output bytes; icon generation refreshes configuration too.
  Icon validation also rejects non-finite or malformed square viewBoxes.

The [owner icon workflow](../../packages/apps/instructions/icons.md) defines
favicon, header/login, generic launcher, maskable launcher and Apple roles.
The forthcoming HTML splash should reuse the unpadded UI SVG; the OS's launch
screen is a different surface. A notification or monochrome icon is deliberately
not invented before the app has that feature.

## Validation and remaining device acceptance

Script tests check source validation, output/record staleness, repeated
monogram pixels and URLs, selective URL changes, independent maskable sources,
manifest purposes, owner Apple-link preservation, dev responses, build emission
and rejection of changed bytes under an old digest. The packed self-test checks
repeated custom rendering byte for byte, source preservation, PNG dimensions,
transparent generic corners, opaque maskable/Apple corners, mark bounds inside
the safe circle, actual built URLs and worker precaching. These are fixture and
Chromium checks, not Android or iOS installation evidence.

After the release is adopted and deployed:

1. Record the Pixel's Chrome and Android versions, installed app details and
   its current icon. Compare the installed manifest/icon with the live ones.
2. Accept/schedule an available app identity update without clearing site data.
   Check the corrected maskable icon, then check a subsequent app-only update:
   size must remain constant. Also check a fresh install separately.
3. On iPhone/iPad, check first install, deep-link installation, rounded corners,
   icon contrast and a later update. No physical Apple device was available in
   this investigation, so this remains explicit acceptance work.

Do not replace the original artwork with an enlarged copy of the tiny installed
icon. Do not use timestamps in every deployment, rename the manifest or reset
app identity to force refreshes. If the Pixel continues to shrink a current,
opaque maskable asset, capture the installed update evidence for a Chromium
report; the platform defect cannot be fixed by asserting different image sizes.

Sources: [Chrome's current icon-update behavior](https://developer.chrome.com/blog/improvements-to-web-app-updates),
[maskable icons and the safe circle](https://web.dev/articles/maskable-icon),
[Apple Web Clip icon selection](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html).
