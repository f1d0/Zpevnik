# Deploying Zpěvník privately

Goal: reachable at a URL Hannah can bookmark, updatable in one command, and
not readable by anyone else.

## The shape of it

```
  songs/public-domain ─┐
  songs/private ───────┴─▶ build.js ─▶ dist/index.html ─▶ Cloudflare Pages
     (gitignored)           (seals)      (ciphertext)          │
                                                               ▼
                                                    Cloudflare Access
                                                    (two email addresses)
```

**The build runs on your machine, never in CI.** `songs/private/` is
gitignored, so GitHub never receives your private repertoire — which means a
CI runner could not build the real songbook even if it had the passphrase.
Only the sealed output is deployed.

Two independent layers, and both must fail before anything is exposed:

1. **Cloudflare Access** rejects unauthenticated requests at the edge. A
   stranger never receives the HTML, so there is no ciphertext to take away
   and attack offline at leisure.
2. **The encryption underneath** means that if the file does escape — a
   misconfiguration, a copy on a USB stick — it is still useless.

## One-time setup

**1. Create the Pages project**

```sh
npm run build -- '<passphrase>'
npx wrangler login
npx wrangler pages project create zpevnik --production-branch main
npx wrangler pages deploy dist --project-name zpevnik
```

That gives you `https://zpevnik.pages.dev` — **public at this point**. Do not
stop here.

**2. Lock it down — Cloudflare Zero Trust → Access → Applications**

- *Add an application* → **Self-hosted**
- Application domain: `zpevnik.pages.dev`
- Session duration: **1 month** (so Hannah signs in roughly never)
- Policy: *Allow*, rule type **Emails**, listing exactly your two addresses
- Identity provider: **One-time PIN** — she gets a code by email, so there is
  no account for either of you to create

Free for up to 50 users. Confirm it works by opening the URL in a private
window: you should hit the Access login, not the songbook.

## Updating

```sh
node scripts/import.js ~/Downloads/new-songs   # -> songs/private/
npm run build -- '<passphrase>'
npm run deploy
```

Roughly ten seconds. She reloads and the new songs are there.

## Rotating the passphrase

```sh
npm run passphrase                             # suggests a new one
npm run build -- '<new passphrase>' && npm run deploy
```

Everything re-seals under the new key. Songs she imported **on her device**
were encrypted under the old one and will not decrypt — she re-imports them,
or you add them to `songs/private/` so they ship in the build instead. That is
the better home for anything worth keeping.

## Why not GitHub Pages

A Pages site built from a private repository is still served **publicly** on
Free, Pro and Team; private Pages exist only on Enterprise Cloud. A private
repo protects the source, never the published site. Giving a second person
collaborator access also gives them the files, not the player — raw ChordPro
in the GitHub web UI is not a songbook.

## What ships

`dist/` contains only:

- `index.html` — the app, with the songbook as ciphertext
- `robots.txt` — `Disallow: /`
- `_headers` — `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`

The build refuses to write output if any song title or lyric line from
`songs/` appears as plaintext in the page. That check is a build breaker, not
a warning — it exists so a refactor can never quietly ship the songbook in
the clear.
