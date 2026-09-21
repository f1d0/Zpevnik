# Zpěvník — design & plan

A free, ad-free, offline-capable chord-and-lyrics player for guitar.
Pick a song, prop the tablet on a music stand, and play. The page scrolls
itself at the pace you play at.

Primary user: Hannah, playing at home or round a fire. Secondary: anybody
on the internet, for free, with no account and no ads.

---

## 1. What we are actually building

Two things, and it matters that they are separate:

**A. The player** (the app). A small static web app that renders a
chord sheet beautifully and scrolls it hands-free. This is the part with
all the craft in it, and the part worth publishing — it is ours, it has no
copyright problem, and it is what is genuinely missing from the free web.

**B. The songbook** (the content). Song files in a plain text format.
Some ship with the app; the rest the user brings.

Existing sites have the content and a bad player wrapped in advertising.
We are building a good player and letting content arrive from anywhere.

### The core loop

```
  Library  ──tap a song──▶  Player  ──tap the screen──▶  scrolling
     ▲                         │
     └──────── back ───────────┘
```

Two screens. Nothing else in the way. No splash, no login, no "upgrade to
Pro", no cookie banner, no popup asking her to rate the app.

---

## 2. How the existing apps do it (research)

What the paid apps have converged on, and what we take from each:

| App | The idea worth stealing |
| --- | --- |
| OnSong | Transposable, auto-scrolling charts as the default view, not a mode |
| Chordly "Play Mode" | Transpose/zoom/BPM adjustable *without leaving performance view* |
| JustChords | Truly hands-free; pedal/Bluetooth page turns |
| SetMate | Tap to pause, swipe to change speed — no menus while playing |
| GigScroll | Scroll speed saved **per song**, +/- controls |
| Ultimate Guitar | "SmartScroll" — speed adapts, rather than one global rate |
| OpenSong / Chordii | ChordPro as the storage format; automatic transposition |

What they all get wrong, from our point of view:

- **Ads and paywalls over public facts.** Chord progressions are not
  anyone's property. The paywall is on the convenience, not the information.
- **Login before playing.** Several require an account to save a song.
- **Autoscroll as a constant speed.** A verse and a chorus do not have the
  same lyric density, so a single px/sec rate drifts out of sync. This is
  the thing we can genuinely do better (see §6).
- **Desktop UI shrunk onto a tablet.** Tiny tap targets, chords in 11px
  grey text, unreadable at arm's length on a music stand.

---

## 3. The content problem — and the design that solves it

This needs stating plainly because it shapes the architecture.

- **Chords are free.** "Am F C E" is a fact about a song, not a creative
  work. Chord symbols and progressions carry no copyright.
- **Lyrics are not.** Song lyrics are protected for the author's life plus
  70 years. In the Czech Republic, publishing them to the public without a
  licence (OSA represents lyricists and publishers) is an infringement —
  this is precisely why the existing sites monetise: they carry the cost of
  licensing, or they carry the risk.
- **Copying for your own use is a different thing** from publishing to the
  world. Hannah having a songbook on her own tablet is not the issue; a
  public website serving the same text is.

So: **the app is public, the repertoire is personal.**

Two content tiers, and the boundary is enforced by where the bytes live:

**Tier A — ships in the repo, deployed publicly.**
Public-domain and traditional material only: Czech *lidové* and *trampské*
songs, authors dead 70+ years, plus anything explicitly licensed or
self-written. Every file carries `{x_license}` and `{x_source}`. This is a
real songbook, not a token one — the campfire canon is largely folk.

**Tier B — never leaves the device.**
Everything else. Imported by the user, stored in the browser (IndexedDB),
never uploaded, never in git, never on our server. Import paths:
paste ChordPro text, open a `.cho`/`.txt` file, paste a plain
chords-over-lyrics block from any site (the parser handles that shape),
or restore a JSON backup.

This gives exactly what you wanted — "something anyone can access and use
freely" — without us republishing other people's lyrics. The free thing we
give away is the tool. Everyone brings their own songs, and the good ones
that are out of copyright come in the box.

> If you do want the public site to carry in-copyright songs later, the
> honest route is an OSA licence for the lyrics. Worth knowing the option
> exists; not worth building for on day one.

### Private mode (current build)

The prototype runs Tier B only: the whole songbook is sealed behind a PIN.

- `scripts/seal.js` encrypts the song files with **AES-256-GCM**, under a key
  derived from the PIN by **PBKDF2-HMAC-SHA256, 310 000 iterations**.
  The page ships ciphertext; no song text exists in the HTML source.
- The browser repeats the same derivation with WebCrypto. A wrong PIN fails
  GCM authentication — there is no plaintext comparison to step around.
- Songs added through the import screen are encrypted with the same key and
  written to `localStorage`. They never touch a server.

**Why a passphrase, not a PIN.** The page is fetchable by anyone who has the
URL, so an attacker downloads the ciphertext once and then attacks it
*offline*, at leisure, forever. There is no rate limit to hide behind — the
only thing standing between them and the songs is the entropy of the
passphrase. A 4-digit PIN is 10 000 possibilities: minutes. The generator in
`scripts/passphrase.js` produces six words plus two digits from a 267-word
list — 54.9 bits, which at an optimistic 10⁵ guesses/second against
PBKDF2-SHA256 at 600 000 iterations is on the order of five thousand years.

Rotate it any time:

```sh
node scripts/passphrase.js 6                       # suggest a new one
node scripts/seal.js '<passphrase>' songs/public-domain > sealed.json
```

**Two layers, doing different jobs.** Encryption protects the *file*. It does
not stop the file being served. Because these are independent failures, the
deployment puts a real authenticator in front (see below) so an
unauthenticated request never receives the bytes at all, and keeps the
encryption underneath so that a leaked file is still useless.

### Delivery

- **GitHub Pages does not work for this.** On Free, Pro and Team, a Pages
  site built from a private repository is still served publicly; private
  Pages exist only on Enterprise Cloud. A private repo protects the source,
  never the published site.
- Giving a second person collaborator access to the repo gives them the
  *files*, not the player — raw ChordPro in the GitHub UI is not a songbook.
  The repo is storage; it is not the delivery mechanism.
- **Cloudflare Pages + Cloudflare Access.** Access is free for up to 50
  users. Deploy from the private repo, then put an Access policy in front
  allowing exactly two email addresses. Unauthenticated requests are
  rejected at the edge and never receive the HTML. Sign-in is a one-time
  code by email, and the session length is configurable up to a month, so
  in practice it is invisible.

---

## 4. The song format

**ChordPro.** It has existed since 1992, it is plain text, it is what
OpenSong, Chordii, OnSong, SongbookPro and every serious tool reads and
writes, and it is trivially diffable in git. We invent nothing.

```chordpro
{title: Holka modrooká}
{artist: lidová}
{key: G}
{tempo: 108}
{x_license: public-domain}
{x_source: traditional Czech folk song}
{x_scroll: 14}

{start_of_verse}
[G]Holka modrooká, nesedávej u po[D7]toka,
[D7]holka modrooká, nesedávej [G]tam.
{end_of_verse}
```

Supported subset — metadata `title subtitle artist composer lyricist key
tempo time capo duration album year copyright`; sections
`start_of_verse/chorus/bridge/tab` (and the `sov/soc/sob/sot` short
forms), `chorus`, `comment` / `comment_italic` / `comment_box`.
Anything prefixed `x_` is ours and ignored by other tools, which is what
the spec reserves it for:

| Extension | Meaning |
| --- | --- |
| `x_scroll` | Calibrated scroll speed, in **lines per minute** (§6) |
| `x_license` | `public-domain`, `own`, `licensed`, `unknown` |
| `x_source` | Where the transcription came from, for credit |
| `x_capo_hint` | e.g. `capo 2, play G shapes` |
| `x_difficulty` | `easy` / `medium` / `hard` — powers a beginner filter |

**Importing from the wild.** Checked against real pages rather than assumed.
Three input shapes, all handled in the browser, all landing in Tier B:

1. **HTML with inline chord elements.** What the live sites actually ship.
   On `akordy.kytary.cz` a line looks like
   `<div><span class="scs-chord">A</span>lyric…</div>` — the chord sits in
   its own element immediately before its syllable, which *is* ChordPro's
   `[A]` anchor. No column arithmetic, no ambiguity. We match on class names
   containing `chord`/`akord` rather than per-site selectors, take the
   outermost element of each nested chord wrapper, and read `data-type` /
   class names for verse and chorus boundaries. One converter, many sites.
2. **Plain text, chords on the line above the lyrics.** The older shape, and
   what you get from a `<pre>` or a text file. Converted by column position.
3. **ChordPro**, passed through.

The delivery mechanism is the clipboard, not a fetcher: select the chord
sheet on the page, copy, paste. The clipboard carries `text/html`, so the
chord elements survive intact, and the app converts on paste. This sidesteps
CORS entirely and works on any site — worth knowing, because two of the
three sites tested refuse automated requests outright (HTTP 403), and their
terms generally prohibit scraping. A person copying a page in their browser
is not scraping.

---

## 5. The two screens

### Library

- Instant fuzzy search, first field focused, **diacritic-insensitive**:
  typing `holka modrooka` finds *Holka modrooká*. Non-negotiable for Czech.
- Filters: favourites, key, difficulty, "only songs I've added", tag.
- Rows show title, artist, key, and 3–4 chord badges — so she can see
  "oh, that's just G–D7" before opening it.
- Recently played at the top. Because in practice you play the same
  eight songs.

### Player

The whole screen is the song. Controls live in a bar that fades out while
scrolling and comes back on tap.

- **Chords above lyrics**, aligned by column, chord in accent colour and
  bold, lyric in high-contrast text. Large by default — readable at
  arm's length, which is the actual viewing distance.
- **Sections labelled** in the margin (Verse 1, Refrén) and colour-tinted
  so she can find the chorus while playing.
- **Transpose −/+** with the resulting key shown, plus a capo suggestion
  ("or: capo 2, play in G"). Recomputed live, never destructive to the file.
- **Font size −/+**, remembered globally.
- **Chord diagram** on tapping any chord name: a fingering popover.
- **Auto-scroll**, see below.
- **Screen stays awake** (Wake Lock API) — a tablet sleeping mid-verse is
  the single most annoying failure mode of every free alternative.
- **Metronome** (optional, off by default): count-in clicks at `{tempo}`.
- **Landscape two-column** on wide screens: many songs then need no
  scrolling at all, which is better than any scrolling.

---

## 6. Auto-scroll — the core mechanic

This is the feature she actually asked for, so it gets designed properly
rather than bolted on.

**Speed is expressed in lines per minute, not pixels per second.**
Pixels are wrong: they change meaning when she changes font size or rotates
the tablet. A *line* is roughly a musical phrase, so lines/minute survives
zoom, rotation and screen size unchanged. Internally:

```
px_per_second = (lines_per_minute / 60) * line_height_px
```

**Where the initial speed comes from,** best source first:

1. `{x_scroll}` — a calibrated value, once someone has played it.
2. `{duration}` — total content height ÷ duration. Exact, when we know it.
3. `{tempo}` + `{time}` — estimate at ~2 bars per printed line.
4. Fallback: 12 lines/minute, which is a slow ballad, because too slow is
   recoverable and too fast is not.

**It learns.** Whenever she adjusts speed while playing, the new value is
saved for that song. Second time through, it starts right. Over a few
weeks the songbook calibrates itself to how *she* plays — which is the
thing the paid apps charge for and still do globally rather than per song.

**Mechanics that make it feel good:**

- Sub-pixel accumulation in `requestAnimationFrame`, scrolling by
  fractional amounts — not `scrollBy(1)` on a timer, which visibly stutters.
- **3–2–1 count-in** before movement starts, so she can get both hands on
  the guitar. Optionally with metronome clicks.
- **Tap anywhere to pause**, tap to resume. The entire viewport is the
  pause button. No aiming at a small icon mid-song.
- **Swipe up/down (or −/+) changes speed** by 1 line/min, with a brief
  numeric readout. No menu.
- Scrolling **stops at the last line** and does not run off into blank space.
- **Anchor mode (phase 2):** long-press a line to mark section start times
  on a first pass; the sheet then scrolls at the right rate through each
  section instead of one average rate. This is the "SmartScroll" idea,
  done properly and per song.
- **Pedal support (phase 3):** a Bluetooth page-turner pedal is just a
  keyboard; bind space/arrows to pause and section-jump. Truly hands-free.

---

## 7. Czech specifics

Easy to overlook, and each one is the difference between "usable" and "not".

- **H vs B.** Czech notation writes `H` for B natural and `B` for B flat.
  Anglo-American writes `B` and `Bb`. A song imported from a Czech site
  will be in the first system, one from an English site in the second.
  We store canonical (Anglo) internally, and render in whichever notation
  is selected — a single setting, defaulting to Czech.
- **Diacritic-insensitive search**, as above.
- **UI language** Czech first, English available.
- **`Ch`** as a chord name never appears, but `H7`, `Hmi`, `Cmi` do —
  the parser accepts `mi`/`m`/`-` as minor.

---

## 8. Technical architecture

**A static site. No backend, no database, no accounts.**

Rationale, since it drives everything else: nothing to run means nothing to
pay for, nothing to keep patched, nothing to breach, and nothing that can
stop working when we lose interest. It also means it genuinely works
offline — at a campfire, which is where it will actually be used, there is
no signal.

```
Vite + TypeScript, no UI framework
  ├── ChordPro parser        ~200 lines, pure, unit-tested
  ├── Transposer             chord-symbol aware, H/B notation aware
  ├── Renderer               chords-over-lyrics, column-aligned
  ├── Scroller               rAF loop, lines/min
  ├── Importer               ChordPro + chords-over-lyrics text
  └── Store                  localStorage (prefs) + IndexedDB (Tier B songs)
```

No framework because there are two screens and very little state; a
zero-dependency build still compiles unchanged in five years, and the
bundle stays small enough to open instantly on a phone. If it grows an
editor and setlists and starts to hurt, Svelte is the escape hatch.

**Build step** walks `songs/`, parses each `.cho`, and emits
`songs.json` (the search index: title, artist, key, chords, difficulty)
plus the song bodies. The same parser runs at build time and in the
browser — one implementation, no drift.

**PWA**: service worker precaches app and Tier A songs; installable to the
home screen so it opens like a native app with no browser chrome.

**Hosting**: static, free — Netlify or GitHub Pages. Custom domain later.

**Tests**: parser, transposer and importer are pure functions with sharp
edges, so they get real unit tests. The UI gets a couple of smoke tests.

### Repo layout

```
/src              app source
/songs
  /public-domain  Tier A, ships publicly
  /_private       gitignored; scratch for personal files during dev
/scripts          build-index, import helpers
/docs             this document
/tests
```

---

## 9. Phases

**Phase 1 — it works.** Parser, renderer, transpose, auto-scroll with
per-song learned speed, library with search, wake lock, ~25 public-domain
songs. Deployed. Hannah can use it for real.

**Phase 2 — it's hers.** Import (paste / file / plain-text converter),
IndexedDB storage, favourites, font size, chord diagrams, PWA offline,
Czech/English notation toggle, JSON backup-restore.

**Phase 3 — it's polished.** Section anchors for accurate scroll,
metronome and count-in, setlists, pedal support, two-column landscape,
print/PDF export, in-app editor.

**Phase 4 — maybe.** Shareable song links that encode the song in the URL
(so nothing is stored server-side and people can swap songs without us
hosting the lyrics), capo calculator, ukulele mode.

---

## 10. Open questions

1. Which sites do your songs come from? I'll write the importer against
   their exact markup.
2. Roughly how many songs, and are they already in a file somewhere?
3. Czech notation (H/B) as the default — confirm?
4. Her device: tablet, phone, or laptop? Screen size drives typography.
5. Does she read chord diagrams, or just chord names?
6. Public site now, or private link for her first and public once it's good?
