#!/usr/bin/env node
/**
 * import.js — batch-convert song files into ChordPro.
 *
 *   node scripts/import.js <file|dir> [...] [--out songs/private] [--dry]
 *
 * Detects three input shapes, the same three the in-app importer handles:
 *   .cho .chopro .chordpro .pro .crd   already ChordPro, normalised only
 *   .html .htm                         a saved page; chords live in their own
 *                                      inline elements, read by class name
 *   .txt and anything else             plain text, chords on the line above
 *                                      the lyrics, mapped by column
 *
 * Whatever you obtain, from wherever, lands in songs/private/ as ChordPro and
 * gets picked up by seal.js. Nothing here fetches anything from the network.
 */
const fs = require('fs');
const path = require('path');

/* ---------- shared with the in-app importer ---------- */
const QUAL = "(?:maj|maj7|maj9|min|mi|m|M|dim|aug|sus|add|alt|no|°|ø|Δ|\\+|-|\\d+|#\\d*|b\\d+|\\(|\\)|,)";
const CHORD_RE = new RegExp("^[A-H][b#]?" + QUAL + "*(?:/[A-H][b#]?)?$");

const CHORD_CLASS = /(^|[-_ \s"'])(chord|akord)s?([-_ \s"']|$)/i;
const SECTION_WORDS = /^(intro|verse|chorus|refr[eé]n|sloka|bridge|solo|outro|ending|pre-?chorus|interlude|instrumental|riff|coda|hook|breakdown|tag|vamp)\b/i;

const isStringLabel = l => /^[eEABDGabdg]b?\|?$/.test(l.trim());

function sectionHeader(line){
  const m = line.trim().match(/^\[([^\]]{1,40})\]$/);
  if (!m) return null;
  const inner = m[1].trim();
  if (SECTION_WORDS.test(inner)) return inner;
  if (!CHORD_RE.test(inner)) return inner;   // not a chord -> a label
  return null;                                // [Am] alone really is a chord
}
function isTabLine(l){
  const s = l.trim();
  if (!s) return false;
  if (!/-{3,}/.test(s)) return false;
  const striking = (s.match(/[-|0-9]/g) || []).length;
  return striking / s.length > 0.5;
}
function isChordLine(line){
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  if (!toks.every(t => CHORD_RE.test(t))) return false;
  // a lone bare letter is far more likely a tab label or a lyric than a chord
  if (toks.length === 1 && toks[0].length === 1) return false;
  return true;
}
function mergeChordLine(chordLine, lyricLine){
  const marks = [], re = /\S+/g;
  let m; while ((m = re.exec(chordLine)) !== null) marks.push({col: m.index, chord: m[0]});
  const inside = marks.filter(x => x.col < lyricLine.length);
  const over   = marks.filter(x => x.col >= lyricLine.length);
  let out = lyricLine;
  for (let i = inside.length - 1; i >= 0; i--)
    out = out.slice(0, inside[i].col) + '[' + inside[i].chord + ']' + out.slice(inside[i].col);
  for (const o of over) out += '[' + o.chord + ']';
  return out;
}
function kindOf(label){
  const l = label.toLowerCase();
  if (/^(chorus|refr|hook)/.test(l)) return 'chorus';
  if (/^(bridge)/.test(l)) return 'bridge';
  if (/^(verse|sloka)/.test(l)) return 'verse';
  return 'other';
}
function plainToChordPro(text){
  const L = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\t/g, '    ').replace(/\s+$/, ''));
  const out = [];
  let open = null, openIdx = -1, contentSinceOpen = false, verses = 0, sawChord = false;

  const close = () => {
    if (!open) return;
    if (!contentSinceOpen) out.splice(openIdx, out.length - openIdx);  // drop empty section
    else out.push('{end_of_' + open + '}');
    open = null; openIdx = -1;
  };
  const openSec = (kind, label) => {
    close();
    open = kind === 'other' ? 'verse' : kind;
    openIdx = out.length;
    contentSinceOpen = false;
    if (open === 'verse' && !label) label = String(++verses);
    out.push('{start_of_' + open + (label ? ': ' + label : '') + '}');
  };
  const emit = l => { out.push(l); if (l.trim() !== '') contentSinceOpen = true; };

  for (let i = 0; i < L.length; i++){
    const line = L[i];

    const header = sectionHeader(line);
    if (header){ openSec(kindOf(header), header); continue; }

    if (isTabLine(line) || (isStringLabel(line) && isTabLine(L[i + 1] || ''))){
      // a tab right after a bare section header belongs to it — keep the label
      let label = '';
      if (open && !contentSinceOpen){
        const m = out[openIdx].match(/^\{start_of_\w+(?::\s*(.*))?\}$/);
        label = (m && m[1]) ? m[1] : '';
        out.splice(openIdx, out.length - openIdx);
        open = null; openIdx = -1;
      } else close();

      out.push('{start_of_tab' + (label ? ': ' + label : '') + '}');
      while (i < L.length){
        const cur = L[i];
        const isTab = isTabLine(cur) || (isStringLabel(cur) && isTabLine(L[i + 1] || ''));
        if (isTab){ out.push(cur); i++; continue; }
        if (cur.trim() === '' &&
            (isTabLine(L[i + 1] || '') || (isStringLabel(L[i + 1] || '') && isTabLine(L[i + 2] || '')))){
          i++; continue;
        }
        break;
      }
      i--;
      out.push('{end_of_tab}');
      continue;
    }

    if (line.trim() === ''){ if (open) out.push(''); continue; }

    if (isChordLine(line)){
      sawChord = true;
      if (!open) openSec('verse');
      const next = L[i + 1];
      if (next !== undefined && next.trim() !== '' && !isChordLine(next) &&
          !isTabLine(next) && !sectionHeader(next)){
        emit(mergeChordLine(line, next)); i++;
      } else {
        emit(line.trim().split(/\s+/).map(c => '[' + c + ']').join(' '));
      }
      continue;
    }

    // a line that is already a directive passes straight through
    if (/^\s*\{[a-z_]+[:}]/i.test(line)){ out.push(line.trim()); continue; }
    // credits and tuning notes ahead of any chord are not a verse
    if (!sawChord && !open){ out.push('{comment: ' + line.trim() + '}'); continue; }
    if (!open) openSec('verse');
    emit(line);
  }
  close();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- HTML: chords sit in their own inline elements ---------- */
const ENTITIES = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', '#39':"'", hellip:'…', ndash:'–', mdash:'—'};
function decodeEntities(s){
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+|#\d+);/gi, (m, n) => ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m);
}

/* Find the close tag matching an opener at `from`, honouring same-tag nesting.
   Needed because a chord is wrapped several spans deep, which no regex can
   match — this is the one place the browser build gets to use a real DOM. */
function findClose(html, tag, from){
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(html)) !== null){
    if (m[1] === '/'){ if (--depth === 0) return {start: m.index, after: re.lastIndex}; }
    else depth++;
  }
  return null;
}

function replaceChordElements(html){
  const openRe = /<([a-z0-9]+)\b([^>]*)>/gi;
  let out = '', idx = 0, m, found = 0;
  while ((m = openRe.exec(html)) !== null){
    const tag = m[1].toLowerCase();
    const cls = (m[2].match(/class\s*=\s*"([^"]*)"/i) || [, ''])[1];
    if (!cls || !CHORD_CLASS.test(cls)) continue;

    const close = findClose(html, tag, openRe.lastIndex);
    if (!close) continue;

    const txt = decodeEntities(html.slice(openRe.lastIndex, close.start).replace(/<[^>]+>/g, '')).trim();
    if (txt && !CHORD_RE.test(txt)) continue;   // a container, not a chord

    out += html.slice(idx, m.index) + (txt ? '[' + txt + ']' : '');
    idx = close.after;
    openRe.lastIndex = close.after;
    if (txt) found++;
  }
  out += html.slice(idx);
  return {html: out, found};
}

function htmlToChordPro(html){
  let s = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|iframe|nav|header|footer|aside|button|select|form)\b[\s\S]*?<\/\1>/gi, '');

  // chords first: section markers below rewrite opening tags, which would
  // otherwise unbalance the nesting scan
  const r = replaceChordElements(s);
  if (!r.found) return null;
  s = r.html;

  s = s.replace(/<[a-z0-9]+\b[^>]*(?:data-type|class)\s*=\s*"[^"]*(chorus|refr[eé]n)[^"]*"[^>]*>/gi, '\n\u0001chorus\u0001\n')
       .replace(/<[a-z0-9]+\b[^>]*(?:data-type|class)\s*=\s*"[^"]*(verse|sloka)[^"]*"[^>]*>/gi, '\n\u0001verse\u0001\n');

  s = s.replace(/<br\s*\/?>/gi, '\n')
       .replace(/<\/(div|p|li|tr|h[1-6]|section|article|blockquote)\s*>/gi, '\n')
       .replace(/<[^>]+>/g, '');

  let ls = decodeEntities(s)
    .split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim());

  // Keep only the chord-bearing region. A saved page carries breadcrumbs and
  // navigation above the sheet and related-song links, cookie notices and a
  // footer below it; the song is the span from the first chord-bearing line to
  // the last, plus any section marker sitting just above it.
  const hasChord = l => /\[[^\]\n]+\]/.test(l);
  let lo = ls.findIndex(hasChord);
  if (lo < 0) return null;
  let hi = ls.length - 1;
  while (hi > lo && !hasChord(ls[hi])) hi--;
  while (lo > 0 && /\u0001/.test(ls[lo - 1])) lo--;
  ls = ls.slice(lo, hi + 1);

  s = ls.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!/\[[^\]\n]+\]/.test(s)) return null;

  const parts = s.split(/\u0001/);
  let body = '', open = null, v = 0;
  const close = () => { if (open){ body += '{end_of_' + open + '}\n\n'; open = null; } };
  for (let i = 0; i < parts.length; i++){
    if (i % 2 === 1){
      close();
      open = parts[i];
      body += open === 'verse' ? '{start_of_verse: ' + (++v) + '}\n' : '{start_of_' + open + '}\n';
    } else {
      const t = parts[i].split('\n').filter(l => l.trim() !== '').join('\n');
      if (t) body += t + '\n';
    }
  }
  close();
  return body.trim();
}

function titleFromHtml(html){
  const h1 = html.match(/<h1[^>]*>([\s\S]{0,120}?)<\/h1>/i);
  if (h1) return decodeEntities(h1[1].replace(/<[^>]+>/g, '')).trim();
  const t = html.match(/<title[^>]*>([\s\S]{0,160}?)<\/title>/i);
  if (t) return decodeEntities(t[1]).split(/[|–—-]/)[0].trim();
  return '';
}


/* ---------- Markdown: one document, many songs ----------
   A songbook kept as Markdown splits on "## Song title". Inline formatting is
   stripped outside fenced blocks; inside them tab staves and chord lines are
   kept exactly as written, because their column positions carry meaning. */
const MD_META = /^(Performed by|Artist|Key|Capo|Tuning|Tempo|BPM)\s*:\s*(.*)$/i;
const MD_LABEL = /^(Lyrics|Full Lyrics|Chords|Bridge|Intro|Verse|Chorus|Outro|Solo)\b\s*:?\s*$/i;

function splitMarkdown(text){
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const songs = [];
  let cur = null, fence = false;

  for (const raw of lines){
    if (/^\s*(```|~~~)/.test(raw)){
      fence = !fence;
      if (cur) cur.body.push('');
      continue;
    }

    if (fence){ if (cur) cur.body.push(raw.replace(/\s+$/, '')); continue; }

    const h2 = raw.match(/^##\s+(.+?)\s*$/);
    if (h2){
      const title = h2[1].replace(/\*\*/g, '').replace(/^\d+[.)]\s*/, '').trim();
      cur = {title, meta: {}, body: []};
      songs.push(cur);
      continue;
    }
    if (/^#\s/.test(raw)){ cur = null; continue; }        // document heading
    if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(raw)) continue;   // horizontal rule
    if (!cur) continue;

    let line = raw.replace(/\s+$/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/^\s*_(.+?)_\s*$/, '$1');

    const h3 = line.match(/^#{3,}\s+(.+?)\s*$/);
    if (h3){ cur.body.push('[' + h3[1].trim() + ']'); continue; }

    // a parenthetical aside, e.g. *(Transpose up two semitones)*
    const aside = line.match(/^\s*\*\((.+)\)\*\s*$/) || line.match(/^\s*\*(.+?)\*\s*$/);
    if (aside){ cur.body.push('{comment: ' + aside[1].trim() + '}'); continue; }

    const m = line.match(MD_META);
    if (m){
      const field = m[1].toLowerCase(), rest = m[2].trim();
      // "Key: E | Capo: None" carries two fields on one line
      for (const part of (field === 'key' || field === 'capo' ? line.split('|') : [line])){
        const pm = part.trim().match(MD_META);
        if (!pm) continue;
        const f = pm[1].toLowerCase(), v = pm[2].trim();
        if (/performed by|artist/.test(f)) cur.meta.artist = v;
        else if (f === 'key') cur.meta.key = v.split(/[\s|]/)[0];
        else if (f === 'capo'){ const d = v.match(/\d+/); if (d) cur.meta.capo = d[0]; }
        else if (f === 'tuning') cur.body.push('{comment: Ladění ' + v + '}');
        else if (/tempo|bpm/.test(f)){ const d = v.match(/\d+/); if (d) cur.meta.tempo = d[0]; }
      }
      if (!/tuning/.test(field)) continue;
      continue;
    }
    if (MD_LABEL.test(line)){ cur.body.push('[' + line.replace(/:\s*$/, '').trim() + ']'); continue; }
    if (/^\s*[-*+]\s+/.test(line)) continue;              // bullet lists are not songs

    cur.body.push(line);
  }
  return songs;
}

/* ---------- assembly ---------- */
function slug(t){
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'song';
}
function firstChord(body){
  const m = body.match(/\[([^\]\n]+)\]/);
  return m ? m[1] : '';
}

/* Square brackets alone cannot tell ChordPro from an Ultimate Guitar page:
   ChordPro puts chords in them, UG puts section headers in them. */
function looksLikeChordPro(text){
  // a bare {comment} proves nothing — it is also what this importer injects
  // for tuning notes and asides. Structural directives are the real signal.
  if (/^[ \t]*\{[ \t]*(?!comment|c[:}]|ci[:}]|cb[:}])[a-z_]+[ \t]*[:}]/im.test(text)) return true;
  const inner = (text.match(/\[([^\]\n]{1,30})\]/g) || []).map(b => b.slice(1, -1).trim());
  if (!inner.length) return false;
  const chords = inner.filter(t => CHORD_RE.test(t)).length;
  return chords >= Math.max(2, inner.length * 0.6);
}

function wrapSections(body){
  if (/\{start_of_/.test(body)) return body;
  let v = 0;
  return body.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
    const lines = b.split('\n');
    if (/^(ref(r[ée]n)?|chorus|r)\s*:?\s*$/i.test(lines[0].trim()))
      return '{start_of_chorus}\n' + lines.slice(1).join('\n') + '\n{end_of_chorus}';
    v++;
    return '{start_of_verse: ' + v + '}\n' + b + '\n{end_of_verse}';
  }).join('\n\n');
}

function convert(file){
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file, path.extname(file));

  if (/^\.(md|markdown|mdown)$/.test(ext)){
    const out = [];
    for (const song of splitMarkdown(raw)){
      const text = song.body.join('\n').trim();
      if (!text) continue;
      const converted = looksLikeChordPro(text) ? text : plainToChordPro(text);
      if (!/\[[^\]\n]+\]/.test(converted)){
        out.push({file, ok: false, title: song.title, reason: 'no chords'});
        continue;
      }
      const head = ['{title: ' + song.title.replace(/[{}]/g, '') + '}'];
      if (song.meta.artist) head.push('{artist: ' + song.meta.artist.replace(/[{}]/g, '') + '}');
      const key = song.meta.key && /^[A-H][b#]?m?$/.test(song.meta.key)
        ? song.meta.key : keyFromChord(firstChord(converted));
      if (key) head.push('{key: ' + key + '}');
      if (song.meta.tempo) head.push('{tempo: ' + song.meta.tempo + '}');
      if (song.meta.capo) head.push('{capo: ' + song.meta.capo + '}');
      head.push('{x_license: imported}', '{x_source: ' + path.basename(file) + '}');
      const full = head.join('\n') + '\n\n' + converted + '\n';
      out.push(result(file, 'markdown', song.title, full));
    }
    return out;
  }

  let body = null, title = '', shape = '';

  if (/^\.(cho|chopro|chordpro|pro|crd)$/.test(ext)){
    shape = 'chordpro';
    body = raw.trim();
    const m = body.match(/\{\s*(?:title|t)\s*:\s*([^}]*)\}/i);
    title = m ? m[1].trim() : '';
  } else if (/^\.(html?|xhtml)$/.test(ext)){
    shape = 'html';
    body = htmlToChordPro(raw);
    title = titleFromHtml(raw);
  } else {
    shape = 'text';
    body = looksLikeChordPro(raw) ? raw.trim() : plainToChordPro(raw.trim());
    const first = raw.split('\n').find(l => l.trim());
    if (first && !isChordLine(first) && !/\[/.test(first)) title = first.trim();
  }

  if (!body) return {file, ok: false, reason: 'no chords found'};
  if (!title) title = base.replace(/[-_]+/g, ' ').trim();

  if (!/\{\s*title\s*:/i.test(body)){
    const head = ['{title: ' + title.replace(/[{}]/g, '') + '}'];
    const key = firstChord(body);
    if (key) head.push('{key: ' + key + '}');
    head.push('{x_license: imported}', '{x_source: ' + path.basename(file) + '}');
    body = head.join('\n') + '\n\n' + wrapSections(body) + '\n';
  }

  return [result(file, shape, title, body)];
}

function keyFromChord(sym){
  const m = (sym || '').match(/^([A-H][b#]?)(.*)$/);
  if (!m) return '';
  return m[1] + (/^(m|mi|min)(?!aj)/.test(m[2]) ? 'm' : '');
}

function result(file, shape, title, body){
  const chords = [...new Set((body.match(/\[([^\]\n]+)\]/g) || []).map(c => c.slice(1, -1)))]
    .filter(c => CHORD_RE.test(c));
  const lines = body.split('\n').filter(l => l.trim() && !/^\s*\{/.test(l)).length;
  const secs = (body.match(/\{start_of_(\w+)/g) || []).length;
  return {file, ok: true, shape, title, slug: slug(title), body, chords, lines, secs};
}

/* ---------- cli ---------- */
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : 'songs/private';
const inputs = args.filter((a, i) =>
  !a.startsWith('--') && !(outIdx >= 0 && i === outIdx + 1));

if (!inputs.length){
  console.error('usage: node scripts/import.js <file|dir> [...] [--out songs/private] [--dry]');
  process.exit(1);
}

const files = [];
for (const inp of inputs){
  if (!fs.existsSync(inp)){ console.error('missing: ' + inp); continue; }
  if (fs.statSync(inp).isDirectory()){
    for (const f of fs.readdirSync(inp).sort())
      if (!f.startsWith('.') && fs.statSync(path.join(inp, f)).isFile()) files.push(path.join(inp, f));
  } else files.push(inp);
}

if (!dry) fs.mkdirSync(outDir, {recursive: true});

let ok = 0, skipped = 0;
for (const f of files){
  let results;
  try { results = convert(f); }
  catch (e) { results = [{file: f, ok: false, reason: e.message}]; }

  for (const r of results){
    if (!r.ok){
      console.log('  skip  ' + (r.title || path.basename(f)) + '  (' + r.reason + ')');
      skipped++; continue;
    }
    let name = r.slug + '.cho', n = 2;
    while (!dry && fs.existsSync(path.join(outDir, name))) name = r.slug + '-' + (n++) + '.cho';
    if (!dry) fs.writeFileSync(path.join(outDir, name), r.body, 'utf8');

    console.log('  ok    ' + name.padEnd(32) + r.shape.padEnd(9) +
      String(r.lines).padStart(3) + ' lines ' + String(r.secs).padStart(2) + ' sec  ' +
      r.chords.slice(0, 7).join(' '));
    ok++;
  }
}

console.log('\n' + ok + ' converted, ' + skipped + ' skipped' + (dry ? '  (dry run)' : '  -> ' + outDir));
if (ok && !dry) console.log("next:  node scripts/seal.js '<passphrase>' songs/public-domain " + outDir + " > sealed.json");
