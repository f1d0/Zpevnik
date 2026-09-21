# Using it on iPhone and iPad

Neither of you needs a computer for day-to-day use. The laptop is only for
the occasional rebuild (below).

## Once, on each device

Open the site in Safari → **Share** → **Add to Home Screen**. It then opens
fullscreen with no browser chrome, like an app.

First launch asks for the passphrase. Leave **"zapamatovat na tomto zařízení"**
ticked and it never asks again on that device.

## Adding a whole songbook file

If you keep songs in a file — Markdown, plain text, or ChordPro — you do not
need to paste anything:

1. Put the file somewhere the Files app can reach it (iCloud Drive, On My
   iPhone, Dropbox, or just save it from Mail).
2. Zpěvník → **+** → **Ze souboru** → **Choose File** → pick it.
3. The box fills and tells you how many songs it found, e.g.
   *"5 písní k přidání (3 bez akordů se přeskočí)"*.
4. **Přidat do zpěvníku** adds them all at once.

Songs are separated by a `## Song title` heading. Per song it also reads
`Performed by:`, `Key:`, `Capo:`, `Tuning:`, `### Section` headings, fenced
code blocks (tab staves keep their alignment), and `[Intro]` / `[Chorus]`
markers.

Selecting several files at once imports all of them straight away, which is
the quick way to move a folder of `.cho` files onto a new device.

A song is skipped when it has no chords positioned over its lyrics — lyrics
alone, or a note like *"chords: A / D / G"*, give the player nothing to
anchor to. Add chord lines above the words and it imports.

## Hana: adding a song she found

1. Find the song in Safari. Select the chord sheet, **Copy**.
2. Open Zpěvník → **+**
3. Tap **Vložit ze schránky**

   iOS shows its usual "Allow Paste?" prompt. The chords convert automatically —
   it reads the chord markup these sites use, so the chords stay anchored to the
   right syllables instead of collapsing into the text.
4. Type the title, tap **Přidat do zpěvníku**.

It's hers immediately, encrypted, on her device only.

## Hana: sending it to you

Open the song → **↑ share icon** in the top bar → iOS share sheet → **Messages**.

That's it. What she sends is a link, roughly 250 characters, with the whole
song compressed and encrypted inside it.

## You: receiving it

Tap the link in Messages. The app opens, and above the song list:

```
  ┌─────────────────────────────────────────┐
  │  Song title                             │
  │  někdo ti poslal píseň   [Přidat] [Zahodit] │
  └─────────────────────────────────────────┘
```

Tap **Přidat**. Done — it's in your songbook, encrypted like everything else.

## Why this is safe to send over iMessage

The song rides in the URL **fragment** — the part after `#`. Browsers never
transmit a fragment to a server, so it is not in any web log, including
Cloudflare's. On top of that it is encrypted with the same passphrase-derived
key as the rest of the songbook: both devices seal against the same salt, so
they derive an identical key without ever exchanging one.

The practical effect: the link is useless to anyone who doesn't have your
passphrase. If it gets forwarded, screenshotted, or sits in an iCloud backup,
it stays useless. The app also strips the fragment from the address bar as
soon as it reads it, so it isn't left sitting in history.

## When you still need the laptop

Songs shared this way live in each device's own vault. That's fine, and it's
the normal path — but a brand-new device starts with only the songs baked into
the build. So every now and then, fold the good ones in:

```sh
node scripts/import.js ~/wherever      # -> songs/private/
npm run build -- '<passphrase>'
npm run deploy
```

Now any device that unlocks gets them from the start. Worth doing before a
trip, or whenever you set up a new phone.

## Ultimate Guitar and similar pages

These are handled directly. Their text format uses `[Intro]`, `[Verse 1]`,
`[Chorus]` as section headers, chords on the line above the lyrics, and tab
staves — all of which the importer now reads:

- section headers become real sections, and the chorus gets highlighted
- tab staves are kept in monospace so the fret numbers stay lined up
- the credits block at the top becomes a note, not a verse
- awkward chords (`Fsus2`, `Dm7sus4`, `Bb#11`, `F#m7b5`) parse and transpose

Select the sheet on the page, copy, paste. Nothing else to do.

## If a paste doesn't convert

Some sites lay chords out as plain text columns rather than marked-up
elements. Those still work — paste and the column positions are read instead.
If a song comes out misaligned, save the page (Share → Options → **Web
Archive** won't work; use **Print → Save as PDF**, or open it on a laptop and
save the HTML) and send me the file — tuning the converter for that site makes
every later import from it work too.
