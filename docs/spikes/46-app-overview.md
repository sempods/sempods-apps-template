# Spike: the app overview, the app's public description and the app store

[Claude] First written on 2026-11-03 as a decision paper for the overview
(sempods/sempods-apps-template#46), then deferred until the app's public
description was settled as a whole. Revised on 2026-11-12 at the owner's
request with that question answered: one description per app, written once,
published in the formats that browsers, authorization servers, the site's
overview and a later app store read. Checked against template 0.10.0 (d5c98fa),
SDK 0.8.0, the
[CIMD draft -03](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)
of 2026-11-02 and sempods/sempods-kotlin#437. No prototype was built.
**Decided on 2026-11-12** by the owner, decision by decision; see
[Decisions](#decisions) at the end.

## Answer

1. **Each app describes itself in one owner file, `apps/<id>/app.json`.** Its
   fields follow the Web App Manifest (`name`, `short_name`, `description`,
   `categories`, `*_localized`); a longer detail text is Markdown in
   `details.md` beside it. `apps.json` stays the registry of IDs, paths,
   ports, routes and the site; it loses `title` and `description` to
   `app.json`.
2. **Every published format is generated from it in one build** and checked
   against the others: the PWA manifest for browsers, a Client ID Metadata
   Document for authorization servers, the minimal `did.json` some Pods
   require, the overview page for people and a JSON-LD description for
   machines. Consistency comes from generation, not from signatures.
3. **The app's IRI is its address**, for example
   `https://danilo.apps.sempods.org/konsum/`. It is the manifest's `id` and
   `start_url`, the subject of the JSON-LD description, the CIMD's
   `client_uri`, and the `did:web` identity is derived from it. A store entry
   points to this IRI.
4. **The overview becomes a store-like, localized page** with cards, a detail
   view per app at `/#<id>`, an install hint and a language switch. It stays
   static: no SDK runtime and no sign-in, only a few lines of inline script
   for the language.
5. **Host anywhere, list centrally.** Anyone vibe-codes their apps with this
   template and publishes them for free on a host of their choice, for
   example `my-apps.netlify.app`. Good apps can be submitted to the store at
   `apps.sempods.org`, which lists and checks them but never hosts them:
   decentralised, yet trusted.
6. **Trust comes from the origin and the publisher, not from app keys.** HTTPS
   and DNS prove who serves an app; the store re-fetches what it lists; a
   publisher is verified by a link in both directions between site and
   WebID, which listing requires; a review vouches for the publisher, not for
   every build. Apps hold no signing keys. The Pod's consent stays the
   safety boundary, so the store shows which data an app asks for.
7. **The store at `apps.sempods.org` is a Pod plus a sempods app.** It imports
   each site's catalog `/apps.jsonld`, keeps one record per app IRI with its
   provenance in a public Context, and its UI reads that Context without
   sign-in. It is a project of its own; this template only publishes what it
   needs.

## Baseline

What exists in 0.10.0:

- **`apps.json`** records per app `id`, `title`, `language` (`en`, `de` or
  `auto`), `path`, `devPort`, `pwa`, optionally `description` (one sentence,
  at most 120 characters), `routes` and `resources`. `site` records the
  production and preview origins.
- **Generated per app** (`regenerate`): the runtime profiles with the
  `did:web` identity, and the Vite configuration with the page title and the
  PWA manifest (`id`, `name`, `short_name`, `description`, `lang`,
  `start_url`, `scope`, two PNG icons, fixed white colours).
- **Icons**: `new-app` and `icon` draw a monogram from the title's first
  letter in the theme's accent, as `favicon.svg` and PNG 192/512, without an
  image tool. An owner cannot supply an icon of their own.
- **`build-site`** writes per app `did.json` (`@context` and `id` only) and
  the callback page, and at the root the overview `index.html` and
  `404.html`: one card per app with icon, title and description, system
  colours, `lang` per card, no script. The page language is the apps' shared
  language, else English.
- **Sign-in identity**: `did:web:<host>:<id>` with the callback
  `<origin>/<id>/callback`. Under SPS-AUTH-003 a Pod fetches neither a DID
  document nor client metadata; it binds the DID's host and path to the
  callback. Only some Pods require the DID document
  ([deployment guide](https://github.com/sempods/sempods-typescript/blob/v0.8.0/docs/deployment.md)).
  Locally, a dynamic client registers with the title as `client_name`.

So name, description and icon already appear in four places (manifest,
overview, sign-in screen in development, page title), all from `apps.json`.
CIMD and a store add two more, and those are read by others: that is why the
source has to be settled first.

## One app, one IRI

Every format describes the same app and must name it the same way. The anchor
is the HTTPS address of the app's start page:

| What                         | Value for Konsum on `danilo.apps.sempods.org`                   |
| ---------------------------- | ---------------------------------------------------------------- |
| App IRI (`@id`, `client_uri`) | `https://danilo.apps.sempods.org/konsum/`                        |
| Manifest `id`, `start_url`   | `/konsum/`, which resolves to the app IRI                        |
| `did:web` client ID (today)  | `did:web:danilo.apps.sempods.org:konsum`                         |
| DID document                 | `https://danilo.apps.sempods.org/konsum/did.json`                |
| CIMD client ID (later)       | `https://danilo.apps.sempods.org/konsum/client.json`             |
| Callback                     | `https://danilo.apps.sempods.org/konsum/callback`                |
| JSON-LD description          | `https://danilo.apps.sempods.org/konsum/app.jsonld`              |
| Site catalog                 | `https://danilo.apps.sempods.org/apps.jsonld`                    |

Any HTTPS origin works the same way, for example
`https://my-apps.netlify.app/konsum/`. Everything lives below the app's path,
so each app keeps its own isolation on a shared origin, and the IRI cannot drift from the identity: both derive from
`site.production` and the ID. Changing either still changes the identity and
loses sessions and grants, as today.

## The source: `apps/<id>/app.json`

### Why a file per app

| Option                                   | For                                                                                                      | Against                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **`apps/<id>/app.json`** (chosen)        | Travels with the app ("same app, either way"); long localized texts stay out of the registry; one owner file per app | A second file per app; `apps.json` schema version 2 and a migration                    |
| Everything in `apps.json`                | One file, one validation                                                                                 | Grows with every language and detail text; the description leaves with the app's folder |
| The PWA manifest itself as the source    | No mapping for browsers                                                                                  | Exists only with `pwa: true`; has no place for detail text or publisher; Vite generates it |

`app.json` borrows the manifest's field names and its localization model, so
the PWA manifest is close to a copy and the assistant writes fields that
already have documented meanings. Fields the manifest does not have are few
and marked below.

### Shape

```json
{
  "lang": "de",
  "name": "Konsum",
  "short_name": "Konsum",
  "description": "Was im Haushalt fehlt, für alle.",
  "categories": ["shopping", "lifestyle"],
  "name_localized": { "en": "Konsum" },
  "description_localized": { "en": "What the household needs, for everyone." }
}
```

Beside it, the detail text in Markdown, one file per language:

```text
apps/konsum/app.json
apps/konsum/details.md       (the language of "lang", here German)
apps/konsum/details.en.md
```

- `lang` is the language of the base values. It is required, because a
  manifest's base values carry no language of their own.
- `name` replaces `apps.json`'s `title`; `description` keeps today's rule
  (one sentence, at most 120 characters).
- The detail text (not in the manifest) is Markdown in `details.md` and
  `details.<lang>.md`, not a JSON field, so the assistant and the owner write
  it as prose. It is optional; without it, the detail view shows the
  description only. See [Markdown](#markdown) for the allowed subset.
- `categories` uses the manifest's
  [known categories](https://github.com/w3c/manifest/wiki/Categories); it
  drives grouping on the overview and in the store.
- `*_localized` follows the manifest's localization members, which Chrome and
  Edge ship since version 148
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Localize_an_app_manifest)):
  a map from language tag to value. Browsers without support use the base
  values.
- The app's UI languages stay in `apps.json` (`language`). `check` requires
  texts for each of them: an `auto` app needs `de` and `en`, a `de` app only
  `de`. A missing translation is an error, not a silent fallback, because the
  overview would otherwise show one language mixed into another.

### Markdown

Prose increasingly arrives as Markdown, from assistants, wikis and notes, and
a sempod will have to handle Markdown sources well in general. The detail
text is a small, early case of it, so it uses Markdown rather than a format to
be replaced later. To keep every reader safe without its own sanitizer, the
text is restricted:

- CommonMark without raw HTML; `check` rejects HTML blocks and inline HTML.
- Links only with `https:`; images only from below the app's own path.
- Headings from level 2, because the detail view supplies the level-1
  heading.

`build-site` renders it with [micromark](https://github.com/micromark/micromark),
which is CommonMark-compliant and drops raw HTML by default; that is one new
runtime dependency of the tooling. In `app.jsonld` the text stays Markdown,
so the store and a Pod receive the original. An RDF literal carries either a
language or a datatype, never both, so each language becomes its own
`schema:TextObject` with `inLanguage` and the media type `text/markdown`
([RFC 7763](https://www.rfc-editor.org/rfc/rfc7763)) as `encodingFormat`. How a Pod turns Markdown into RDF structure (sections,
links as edges) is a question for the Pod and the spec, not for this
template, and this choice does not preclude it.

Later, without a new model: `screenshots` (manifest field; the visual check
already takes them at 375px) and `icon` for an owner icon (below). The kinds
of data an app reads and writes (schema.org types and whether it writes) are
needed before the store opens to other owners: the store shows them next to
the trust level, because consent in the Pod is what actually limits an app
(see [Trust is not safety](#trust-is-not-safety)). They also let the store
say which vocabularies an app shares with others.

### Icons

The store needs better icons than letters. Proposal: an optional owner file
`apps/<id>/icon.svg` (square, content inside the maskable safe zone). When it
exists, `icon` renders the PNG sizes and a maskable variant from it; without
it, the monogram stays. Rendering an arbitrary SVG needs a rasterizer: the
tooling already depends on Playwright, whose Chromium can render it, so no
new dependency is needed. Every published icon keeps a fixed address
(`/<id>/icon-512.png`), because CIMD's `logo_uri` and store records point to
it.

### Site level

`apps.json` gains a `catalog` object for the overview and the store, separate
from `site`, which stays the published origins:

```json
"catalog": {
  "lang": "de",
  "name": "Danilos Apps",
  "description": "Kleine Apps für den Alltag, mit den Daten im eigenen Pod.",
  "name_localized": { "en": "Danilo's apps" },
  "description_localized": { "en": "Small everyday apps, with the data in your own Pod." },
  "publisher": "https://danilo.example-pod.org/profile/card#me"
}
```

`publisher` is optional: the WebID of the person or team behind the site. It
counts as verified only when the WebID links back (see [Trust](#trust)).

## The generated formats

One `build-site` run writes all of them from `app.json`, `apps.json` and the
profile's origin. A check in `build-site` compares the identifiers across the
outputs before anything is published.

### PWA manifest (browsers)

As today, plus `*_localized`, `categories`, the maskable icon and the theme's
colours instead of fixed white. Only for apps with `pwa: true`.

### Client ID Metadata Document (authorization servers)

`/<id>/client.json`, small enough for the draft's suggested 5 KB limit:

```json
{
  "client_id": "https://danilo.apps.sempods.org/konsum/client.json",
  "client_name": "Konsum",
  "client_name#en": "Konsum",
  "client_uri": "https://danilo.apps.sempods.org/konsum/",
  "logo_uri": "https://danilo.apps.sempods.org/konsum/icon-512.png",
  "redirect_uris": ["https://danilo.apps.sempods.org/konsum/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_methods_supported": ["none"],
  "application_type": "web"
}
```

- Language variants use RFC 7591's `#<tag>` suffix; the base value is in the
  app's `lang`.
- No secrets, no keys: a browser app is a public client, and the draft forbids
  shared secrets.
- RFC 7591 has no description field; the description stays in the JSON-LD
  description, which `client_uri` leads to.
- A preview build writes its own `client.json` with the preview origin.

**Published from phase 1**, before any Pod reads it. The document is
harmless while the runtime signs in as `did:web`, and it lets
sempods-kotlin#437 test against real documents. Switching the runtime to it
is a separate step (below).

**Input for #437.** The draft does not require redirect URIs to share the
client ID's origin or path. For apps sharing an origin, the sempods spec
must require what `did:web` gives today: same origin, and the redirect
inside the directory of the client ID URL (`/konsum/client.json` allows
`/konsum/…` only). Otherwise one app on a site could name another's
callback. The consent screen should show the verified host and path next to
the self-asserted name and logo, as the draft advises.

### DID document (Pods that require it)

Unchanged: `@context` and `id`. Adding services or `alsoKnownAs` would help
nobody today, since a conforming Pod does not fetch it; the JSON-LD
description links the identifiers instead.

### JSON-LD description (overview, store, any RDF reader)

`/<id>/app.jsonld`, schema.org terms, language maps for the localized fields:

```json
{
  "@context": [
    "https://schema.org/",
    {
      "name": { "@container": "@language" },
      "description": { "@container": "@language" }
    }
  ],
  "@id": "https://danilo.apps.sempods.org/konsum/",
  "@type": "WebApplication",
  "name": { "de": "Konsum", "en": "Konsum" },
  "description": {
    "de": "Was im Haushalt fehlt, für alle.",
    "en": "What the household needs, for everyone."
  },
  "subjectOf": [
    {
      "@type": "TextObject",
      "inLanguage": "de",
      "encodingFormat": "text/markdown",
      "text": "Konsum hält die gemeinsame Einkaufsliste …"
    },
    {
      "@type": "TextObject",
      "inLanguage": "en",
      "encodingFormat": "text/markdown",
      "text": "Konsum keeps a household's shared shopping list …"
    }
  ],
  "applicationCategory": ["shopping", "lifestyle"],
  "inLanguage": ["de", "en"],
  "url": "https://danilo.apps.sempods.org/konsum/",
  "image": "https://danilo.apps.sempods.org/konsum/icon-512.png",
  "isPartOf": { "@id": "https://danilo.apps.sempods.org/" },
  "identifier": [
    "did:web:danilo.apps.sempods.org:konsum",
    "https://danilo.apps.sempods.org/konsum/client.json"
  ]
}
```

The app's `index.html` links it with
`<link rel="alternate" type="application/ld+json" href="app.jsonld">`. The
mapping is small: `name`, `description`, the detail files → `subjectOf`,
`categories` → `applicationCategory`, the UI languages → `inLanguage`.
`publisher` comes from the catalog. The `did:web` identity and the client ID
are plain `identifier` values; their scheme tells them apart. A term of our
own is added only when the store needs one that schema.org lacks, as the
vision asks.

### Site catalog

`/apps.jsonld` at the site root: a `schema:ItemList` with the catalog's name,
description and publisher and one item per app, each with its IRI and its
card fields, so the store needs one request for the list. The overview links
it the same way. File names with a dot cannot collide with app IDs.

`build-site` adds `client.json` and `app.jsonld` to the paths it reserves in
an app's output, as it does for `did.json`.

## The overview

### Look

A store front, not a list of links:

- A header with the catalog's name and description and a language switch.
- Cards in a grid: the icon as a rounded square with a soft shadow, the name,
  the short description, the first category as a small chip, an "Open"
  action, and "Can be installed" for PWAs.
- Grouping by category once there are enough apps (proposal: from eight),
  otherwise the order of `apps.json`.
- A detail view at `/#<id>`: large icon, name, the rendered detail text,
  categories, languages, publisher, "Open", and the install hint. It uses
  CSS `:target`, so it works without script and every app has a shareable
  link without a reserved path.
- Colours from the theme tokens of `@sempods/app-ui` (one of the skeleton's
  themes, chosen with `catalog.theme` later), light and dark mode, visible
  focus, contrast of at least 4.5:1 also on the icon placeholder.
- An empty state for a site without apps, and the 404 page in the same look.

Search waits until a site has many apps; the store has it from the start.

### Languages

The page holds all catalog languages; each text carries its `lang`. Without
script it shows `catalog.lang`. A few lines of inline script choose the best
match from `navigator.languages`, set `<html lang>` and remember a choice from
the switch. This keeps one static page and one URL. Per-language pages would
need reserved paths or host-specific language redirects, which Cloudflare
Pages lacks. An app's card always shows the app's own texts; an app in German
only stays German on an English page, marked `lang="de"`.

The overview's own words ("Open", "Can be installed", the install help) come
from the tooling in English and German, as today.

### Install hint

Unchanged from the first version of this paper: the overview cannot install
another page's app, since the browser offers installation only inside the
app's scope. A card says "Can be installed", and the detail view explains the
three browser cases (Chromium's install icon, "Add to Home Screen" on iOS,
little in desktop Firefox) with the SDK's caveat that installed apps are
experimental.

### Local overview

`pnpm run dev` without an ID lists every app with its name and development
address and says how to start one. A served local overview follows only if
owners run several apps at once.

## Trust

The question for the store: how can a visitor of `apps.sempods.org` trust an
entry that is only a record in a Pod, when everything comes from the app's
own domain? The formats in the request answer different parts of it:

| Mechanism                                    | What it proves                                                     | Fit here                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPS origin (DNS and TLS)                   | Who serves the app and its callback                                | **The basis.** It is what `did:web` and CIMD rest on today                                                                                                |
| `did:web` per app                            | Nothing beyond the origin: the DID resolves through that domain    | Stays as the sign-in identity; no keys needed                                                                                                             |
| CIMD                                         | The same origin, plus name and logo for the consent screen         | The coming sign-in identity; name and logo are self-asserted                                                                                              |
| Signed web bundles (Isolated Web Apps)       | The code was signed by a key, independent of hosting                | **Does not fit**: requires the `isolated-app://` scheme and offline bundles, not a hosted PWA                                                             |
| An app signing its JSON (JWS, Data Integrity) | The same as the origin, unless the key is independent of hosting  | **Not now**: a key in the owner's CI adds a secret to manage and proves little more. Only useful if records travel without being re-fetched              |
| DID Configuration (`did-configuration.json`) | Links a key-based DID to a domain                                  | Not needed: a `did:web` already is the domain                                                                                                            |
| WebID ↔ site link                            | A known person or team publishes the site                          | **Yes**, as "verified publisher", without keys                                                                                                           |
| A store-signed attestation                   | The store reviewed this app at this state                          | **Yes**, as the "certificate": signed by `did:web:apps.sempods.org`, not by the app                                                                       |

The resulting levels a store entry can show:

1. **Domain verified** (automatic). The store fetched `apps.jsonld`,
   `app.jsonld` and `client.json` over HTTPS from the app's origin, every
   `@id` lies below the catalog's origin, and the identifiers agree with each
   other and with the manifest. The store re-fetches on a schedule and
   removes an entry that fails repeatedly. Alone, this is not enough to be
   listed (see [Takeover and moves](#takeover-and-moves)).
2. **Publisher verified** (automatic, **required for listing**). The catalog
   names a WebID as `publisher`, and that WebID's public profile links back
   to the site (the term is chosen with the store). A link in one direction
   proves nothing.
3. **Build checked** (automatic, per build). The store inspects the published
   build as far as a static look allows: no scripts or styles from other
   origins, no network targets other than the Pod and the app's own origin
   in the bundle, the manifest and callback as generated. A failed check is
   shown on the entry; it is evidence, not a guarantee.
4. **Reviewed publisher** (manual). Someone at the store looked at the
   publisher and their apps. The store signs a statement about the WebID and
   the site with `did:web:apps.sempods.org`. A vibe-coded app changes with
   every prompt, so a review of one build would almost always be stale; a
   review of who publishes stays meaningful. The store may still record a
   fingerprint it computed itself (a digest of `index.html`, which
   references every hashed asset) and show "changed since review" for an app
   it looked at closely.

Apps never hold keys; the only signing key is the store's. Name and logo stay
self-asserted at every level, so the store, like a consent screen, shows the
host next to them.

Optional, a stronger signal without an owner key: a site built by GitHub
Actions can carry an
[artifact attestation](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
(Sigstore, keyless) that names the commit it was built from, and
`app.jsonld` can name a `codeRepository`. The store can then show "built from
public source". This needs a deploy through Actions rather than the host's
own build, so it stays optional.

### Trust is not safety

A trust level says who publishes an app and what the store saw; it does not
make the app's code safe. The app runs with the person's Pod tokens, and a
publisher can change it at any time. What limits the damage is the consent
the person gives in their Pod: which Contexts, read or write. The store
therefore shows the kinds of data an app reads and writes beside its trust
level, and its texts say plainly that a listing is no security guarantee.

### Takeover and moves

**Takeover.** An owner deletes their Netlify site, and someone else registers
the free name `my-apps.netlify.app`. The newcomer serves a valid catalog, so
"domain verified" would pass. Worse, they get the same `did:web` identity,
and later the same CIMD client ID, so a Pod may take them for the client a
person already consented to. Two answers:

- The store lists only publisher-verified sites. A newcomer cannot edit the
  original owner's WebID profile, so the link back fails and the entry is
  hidden at the next check.
- On the Pod side, sempods-kotlin#437 should consider how long consent to a
  client ID lasts and whether a changed client document (another `logo_uri`,
  other `redirect_uris`) asks again. This is input for the spec, not for
  this template.

**Moves.** An owner who starts on `my-apps.netlify.app` and later takes their
own domain gets new app IRIs and new identities. People lose sessions and
grants, and a store entry would point to the old address. The store supports
"moved": the old site's catalog names the new one, the new one names the same
WebID, and the store carries the entry over. People still sign in again. The
publish instructions therefore advise choosing a durable domain before
submitting to the store.

### One registrable domain for many owners

Hosts that give each customer a subdomain are already on the
[Public Suffix List](https://publicsuffix.org/), `netlify.app` among them, so
`my-apps.netlify.app` is a site of its own. The question arises only if
sempods itself offers subdomains, which is an optional service, not the
default way.

If several people deploy to `<name>.apps.sempods.org`, their sites share the
registrable domain `sempods.org`. Browsers then treat them as the same site
for cookies (`SameSite`, a cookie set for `.apps.sempods.org`) and for
storage partitioning, which contradicts "apps of different people never share
a site". The fix is an entry `apps.sempods.org` in the private section of the
Public Suffix List, as `github.io` has; each
`<name>.apps.sempods.org` then is a site of its own. It takes weeks to reach
browsers, so it belongs before the second owner; the owner decided to apply
now. The store at
`apps.sempods.org` itself then sits on a public suffix, which is fine for a
page that reads public data without cookies or a session.

Who controls DNS for `<name>.apps.sempods.org` (a delegated CNAME to the
owner's host) is a sempods operation, not template tooling; the template only
needs the origin in `site.production`, as today. The vision's "no shared
hosting for several people" still holds: each owner hosts their own site.

## The store at `apps.sempods.org`

A sketch, so that this template publishes the right things; the store is its
own project:

- **A Pod** holds one record per app IRI in a public Context: the imported
  JSON-LD description, plus provenance (`prov:wasDerivedFrom` the fetched
  URL, the fetch time, the fingerprint) and the trust level.
- **An importer** takes a site origin (first by a pull request or an issue to
  the store, later a form), fetches `/apps.jsonld`, checks it as in
  [Trust](#trust) and writes the records. It re-checks on a schedule.
- **The UI** is a sempods app with `signIn: 'none'`: it reads the public
  Context without a token
  ([SDK decision](https://github.com/sempods/sempods-typescript/blob/v0.8.0/docs/decisions.md#public-data-without-a-token-sign-in-only-when-the-app-needs-it)),
  searches with SPARQL and links every entry to its app IRI. It can be built
  with this template, which makes it the first test of the formats.
- **The store never serves an app.** "Open" and installation happen on the
  app's own origin, so sessions, grants and the PWA stay there.
- **Operation.** As a curator, the store needs terms of use, a way to report
  an app, and a delisting procedure. That belongs to the store project.

### Getting listed

Submitting should be easy for someone who has never published anything:

1. The owner publishes their site as today (`configure-site`, `build-site`,
   their host) on a durable HTTPS origin.
2. `pnpm run store-check` in their repository checks locally what the store
   requires: the catalog and every `app.jsonld` on the published site, texts
   and detail files in every UI language, an icon, a `publisher` WebID whose
   profile links back, and that the published files match the local build.
   It explains each failure in plain language.
3. When everything passes, it prints a prefilled link to submit the site,
   first as an issue in the store's repository, later a form.
4. The store's importer then checks the same things itself and lists the
   site. Nothing in the owner's repository needs a key, a token or an
   account at the store.

The assistant's publish instructions mention the store only after a working
publication, as an optional step.

## Phases

1. **Template, no protocol change** (#46 and follow-ups):
   1. `app.json` with migration (`apps.json` schema 2), validation and the
      assistant instructions; `regenerate` reads it.
   2. Manifest with `*_localized`, categories, theme colours and the owner
      icon.
   3. `app.jsonld` and `apps.jsonld`, and the identifier check in
      `build-site`.
   4. The overview: look, detail view, languages, install hint; `dev`
      without an ID.
   5. The declared kinds of data in `app.json`, and `store-check` with the
      submission link, once the store's import format is fixed.
2. **Sign-in by metadata document**, after sempods-kotlin#437 and the spec
   companion: `client.json` (may ship in phase 1), an identity kind in the
   SDK runtime, and a `configure-site` choice between `did:web` and the
   document. Switching changes the client identity, so it needs fresh sign-in
   and consent, and goes into the changelog as such.
3. **The store**, its own repository: Pod, importer and UI with publisher
   verification required for listing; then build checks, moves, publisher
   reviews, terms and a report path. DNS delegation for
   `<name>.apps.sempods.org` only if sempods offers subdomains.

Independent of the phases, and now: the Public Suffix List entry for
`apps.sempods.org`, because it takes weeks to months to reach browsers.

## Decisions

Taken by the owner on 2026-11-12:

1. **Source**: `apps/<id>/app.json` per app; `title` and `description` move
   out of `apps.json` (schema 2 with a migration).
2. **Detail text**: Markdown in `details.md` and `details.<lang>.md`, in the
   restricted subset under [Markdown](#markdown). The owner expects Markdown
   to become a common source of Pod data; how a Pod structures it is a
   separate question for the Pod and the spec.
3. **Translations**: required for every UI language of an app; `check`
   fails when one is missing.
4. **`client.json`**: published from phase 1, before any Pod reads it.
5. **CIMD redirect rule**: same origin and inside the client ID's directory,
   proposed for sempods-kotlin#437.
6. **Trust**: the three levels under [Trust](#trust); apps hold no keys, the
   store's key is the only one.
7. **Public Suffix List**: apply for `apps.sempods.org` now.
8. **Vocabulary**: schema.org `WebApplication`; the `did:web` identity and
   the client ID as `identifier` values; own terms only when the store needs
   them.
9. **Model**: anyone hosts their apps for free wherever they like; good apps
   can be submitted to the store, which lists but never hosts them. Listing
   requires a verified publisher, reviews are per publisher, build checks are
   automatic, and the store shows the kinds of data an app uses. The store
   supports moves; a takeover loses the listing at the next check.
