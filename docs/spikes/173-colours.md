# Colour roles across apps and installed surfaces

Investigation for [#173](https://github.com/sempods/sempods-apps-template/issues/173),
14 November 2026. Scope: SDK, UI kit, starter, TODO, Konsum and the phase-zero
store; no theme framework or deployment.

## Findings and decisions

The architecture already has useful ownership: app-ui semantic palette roles,
a bridge to SDK tokens, ordinary app-owned CSS, and light-dark pairs. Sage,
fresh and warm already exist and are suitable starting choices. The problem
was adoption: AppAccess and new template apps defaulted to sage, app-ui and
TODO supplied neutral overrides, Konsum imported calm, and the personal
overview defaulted to fresh. Align defaults, retain every explicit app choice
and recommend three existing palettes rather than add another configuration
layer. The headless SDK acquires no UI or theme dependency.

The referenced [store PR #1](https://github.com/haed/sempods-app-store/pull/1)
uses an independently authored green palette, with warm off-white surfaces,
light/dark values and contrast checks. Its role model agrees with the apps.
It remains static and independent: no SDK runtime or shared build dependency
is needed to make its visual family coherent. The personal app overview is a
different surface and adopts sage as its default while retaining catalog.theme.

## The Pixel system bar

The supplied screenshot shows a dark Konsum page and status bar above a white
three-button Android navigation area. The owner reports Pixel 8a, Chrome
157.0.8103.50, both Android and the app dark. The live manifest advertises
`theme_color: '#ffffff'` and `background_color: '#ffffff'`; page meta elements
separately advertise white/light and `#111315`/dark. The installed metadata
itself has not been inspected.

Chromium's [navigation-bar change](https://chromium.googlesource.com/chromium/src/+/0a6ab4f0e2ce17e572b05400ae6eacd7fc5389f0%5E!/)
uses the manifest theme colour for installed web-app navigation. Its current
provider falls back to the light custom colour when no dark custom colour
exists. This is consistent with the screenshot, but is source/configuration
evidence, not a reproduction on the device.

The [current manifest draft](https://www.w3.org/TR/appmanifest/#color_scheme_dark-member)
now specifies color_scheme_dark. The inspected
[Chromium 157 parser](https://chromium.googlesource.com/chromium/src/+/157.0.8103.50/third_party/blink/renderer/modules/manifest/manifest_parser.cc)
does not parse that member, nor does the inspected main parser. Do not describe
dark manifests as impossible in the standard, or assume proposal support from
the browser version. The implementation uses the broadly supported static
members and an intentional light-primary brand colour for installed chrome.
The page meta colours continue to follow its resolved background. Launch
background remains the light background; an OS may paint that before CSS loads.

[Edge-to-edge guidance](https://developer.chrome.com/docs/css-ui/edge-to-edge)
addresses gesture-navigation viewport/safe-area behavior; it does not establish
control over the three-button system strip. Native contrast protection and
installed metadata updates remain browser/OS decisions. Neither an emulator
screenshot nor correct meta tags prove a repaired native bar.

## Acceptance

- Template script tests and packed self-test: separate manifest brand/startup
  colours, page meta system/explicit appearance, owner overrides, and all three
  recommended palettes in light/dark through the contrast checker.
- SDK: default UI palette, styled TODO and no-styles SDK boundaries through
  unit and packed browser gates. The TODO's actual app/SDK background and page
  meta values agree and follow a system change.
- Konsum: unchanged template sage CSS, ordinary action variants, production
  native light-dark(), page theme synchronization, and an app-owned manifest
  override while it still consumes tooling 0.10.0. No generated file is patched.
- Remaining device acceptance: after deployment, inspect installed manifest
  refresh, existing/fresh installation, Android dark/light and three-button
  navigation. Test gesture navigation and iOS separately when available.

The [owner colour workflow](../../packages/apps/instructions/colours.md) gives
customization steps and the relevant platform limits.
