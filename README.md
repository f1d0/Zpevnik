# Zpěvník

A free, ad-free chord-and-lyrics player for guitar. Pick a song, prop up
the tablet, play — the page scrolls itself at the pace you play at.

No accounts. No ads. No tracking. Works offline.

## Why

Chords and lyrics are everywhere on the web, wrapped in advertising and
paywalls. The *information* isn't the scarce part — a good, quiet player
is. This is the player.

## Status

Design phase. See **[docs/DESIGN.md](docs/DESIGN.md)** for the full plan:
screens, the auto-scroll mechanic, the song format, and the content model.

## Songs

Songs are plain-text [ChordPro](https://www.chordpro.org/) files.

- `songs/public-domain/` — traditional and public-domain songs that ship
  with the app and are published with it.
- Everything else lives in the user's own browser, imported by them, and
  is never uploaded or committed. See §3 of the design doc for why.

## Deploying

See **[docs/DEPLOY.md](docs/DEPLOY.md)**. In short:

```sh
npm run build -- '<passphrase>'   # seals songs into dist/index.html
npm run deploy                    # -> Cloudflare Pages, behind Access
```

## Licence

App code: MIT. Song files under `songs/public-domain/` are public domain.

## Prototype

`prototype/index.html` is a single-file, working proof of the player —
parser, transpose, Czech/English chord notation, the hands-free scroll,
paste-in import, and the PIN gate. It is a sketch to feel the
interaction, not the codebase.

### Adding songs in bulk

`scripts/import.js` converts whatever you already have into ChordPro. It
reads three shapes — ChordPro files, plain text with chords on the line
above the lyrics, and saved web pages where each chord sits in its own
inline element — and writes them to `songs/private/`, which is gitignored.
It does no networking; you supply the files.

```sh
node scripts/import.js ~/Downloads/songs --dry   # see what it would do
node scripts/import.js ~/Downloads/songs         # -> songs/private/
```

The songbook inside it is encrypted; rebuild the sealed payload with:

```sh
node scripts/passphrase.js 6                    # suggest a passphrase
node scripts/seal.js '<passphrase>' songs/public-domain songs/private
```
