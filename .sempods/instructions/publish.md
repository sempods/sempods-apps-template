# Publish the apps

All apps of the repository are published together as one static site. Each
app lives under its own path (`https://<host>/<id>/`), and an overview at `/`
links them. Read this guide before the first deployment, together with the
installed SDK's `deployment.md` and `pwa.md`
(`node_modules/@sempods/app-sdk/docs/`).

## 1. Choose the addresses once

Ask the owner for:

- **the published origin** (production), for example `https://apps.example.org`
  or `https://<site>.netlify.app`. It becomes part of every app's identity,
  `did:web:<host>:<id>`, with the callback `https://<host>/<id>/callback`.
  Changing it later changes every identity: every sign-in and Pod grant must be
  made again. Confirm that the owner controls this address;
- **a fixed preview address**, optional: an address that always shows the
  latest deploy of one branch, for example a branch named `preview`. It gets its
  own identity and should use a test Pod or a test context;
- **the host**: `netlify`, `cloudflare-pages` or `static` (any other static
  host).

Record them with:

```sh
pnpm run configure-site --production https://apps.example.org \
  --preview https://preview--apps.netlify.app --host netlify
```

The command writes `site` in `apps.json` and regenerates every app's
configuration. Local development is unchanged: `pnpm run dev <id>`, plain
builds and tests keep the local identity.

## 2. Build the site

```sh
pnpm run build-site                    # production
pnpm run build-site --profile preview  # the fixed preview address
```

It builds every app into `site-dist/<id>/` with the published identity and
writes the overview, `did.json` per app (`/<id>/did.json`, needed by some
Pods), the SDK's licence notices and the routing files the host needs.
`site-dist/` is build output; do not commit it. `apps/<id>/dist` is not
touched, so `pnpm run build` and `pnpm run preview` in an app keep the local
identity.

A build only works on the origin it was made for: opened anywhere else, the SDK
stops with a configuration error. Previews on other addresses, such as one per
pull request or per commit, therefore show no working sign-in. Turn them off
or treat them as unusable.

## 3. What the host must provide

Every host, whatever it is:

- serves `site-dist/` as static files over HTTPS, with Node from
  `.node-version` and pnpm from `packageManager` when it builds;
- answers `/<id>/` and `/<id>/callback?code=…&state=…` with a first response
  of `200`, without a redirect (`Location` header), with path and query
  unchanged. The SDK recognises the callback only at its exact path;
- answers `/<id>/did.json` with the JSON document, not with an app page;
- does not rewrite every path to an `index.html`, which would also replace
  scripts, `sw.js` and `did.json`. Unknown paths show the not-found page;
- does not cache or log full callback URLs, and keeps the default or a stricter
  referrer policy.

Build command `pnpm run build-site`, publish directory `site-dist`.

### Netlify

Use `--host netlify`: `build-site` writes `_redirects` with one rule per app,
`/<id>/callback /<id>/index.html 200`, and a top-level `404.html` that Netlify
serves for unknown paths. Write this `netlify.toml` in the
repository root when the owner asks for Netlify (the template ships none):

```toml
[build]
  command = "pnpm run build-site"
  publish = "site-dist"

# The branch whose deploys form the fixed preview address.
[context.preview]
  command = "pnpm run build-site --profile preview"

# Pull request previews have their own addresses and no identity.
[context.deploy-preview]
  command = "echo 'Deploy previews cannot sign in; push to the preview branch.' && exit 1"
```

Connect the repository to a Netlify site. For a preview, enable branch deploys
for the `preview` branch: its address is `https://preview--<site>.netlify.app`.

### Cloudflare Pages (not tested by the template)

Use `--host cloudflare-pages`: `build-site` writes `<id>/callback.html`, which
Pages serves at `/<id>/callback`, and a top-level `404.html`. Without it Pages
serves the overview for every unknown path. Do not add a `_redirects` rule for
`/<id>/*`: on Cloudflare such rules win over existing files.

In the project's build settings: build command `pnpm run build-site`, build
output directory `site-dist`. For the fixed preview address, set the variable
`SEMPODS_SITE_PROFILE=preview` for the Preview environment. The branch alias
`https://preview.<project>.pages.dev` then shows the `preview` branch. Commit
addresses (`https://<hash>.<project>.pages.dev`) have no working sign-in.

### Cloudflare Workers and other hosts

The `static` layout (`callback.html` per app, top-level `404.html`) suits hosts
that serve `/<path>` from `<path>.html`. Cloudflare Workers static assets do
this by default, but the template has no recipe yet for their asset and
deploy configuration. For any other host, check the requirements above before
the first sign-in.

## 4. Check the deployment

1. For each app and both addresses:
   - `curl -sI https://<host>/<id>/callback?code=x&state=y` returns `200` and
     no `Location`;
   - `curl -s https://<host>/<id>/did.json` returns the JSON with
     `"id": "did:web:<host>:<id>"`.
2. In a fresh browser profile, the owner signs in to each app on the
   published site, grants only the intended context, saves something and
   reloads. Never ask for credentials or tokens.
3. On the preview address, sign in with its own identity against a test
   context.
4. If the Pod rejects the app before or at its consent screen, read
   `deployment.md` on Pods that require a DID document or an allow-list.
   Falling back to another identity is not a fix.

Record the published addresses, identities, what was checked and what was not
in each app's `NOTES.md`.
