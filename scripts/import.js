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
const CHORD_RE = /^[A-H](#|b)?(mi|min|maj|m|M|dim|aug|sus|add)?\d*(sus\d*|add\d*|maj\d*|dim|aug|\+)*(\/[A-H](#|b)?)?$/;
const CHORD_CLASS = /(^|[-_ \s"'])(chord|akord)s?([-_ \s"']|$)/i;

function isChordLine(line){
  const toks = line.trim().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every(t => CHORD_RE.test(t));
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

function plainToChordPro(text){
  const L = text.split('\n').map(l => l.replace(/\t/g, '    ').replace(/\s+$/, ''));
  const out = [];
  for (let i = 0; i < L.length; i++){
    if (!isChordLine(L[i])){ out.push(L[i]); continue; }
    const next = L[i + 1];
    if (next !== undefined && next.trim() !== '' && !isChordLine(next)){
      out.push(mergeChordLine(L[i], next)); i++;
    } else {
      out.push(L[i].trim().split(/\s+/).map(c => '[' + c + ']').join(' '));
    }
  }
  return out.join('\n');
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

/* ---------- assembly ---------- */
function slug(t){
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'song';
}
function firstChord(body){
  const m = body.match(/\[([^\]\n]+)\]/);
  return m ? m[1] : '';
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
    body = /\[[^\]\n]+\]/.test(raw) ? raw.trim() : plainToChordPro(raw.trim());
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

  const chords = [...new Set((body.match(/\[([^\]\n]+)\]/g) || []).map(c => c.slice(1, -1)))];
  const lines = body.split('\n').filter(l => l.trim() && !/^\s*\{/.test(l)).length;
  return {file, ok: true, shape, title, slug: slug(title), body, chords, lines};
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
  let r;
  try { r = convert(f); } catch (e) { r = {file: f, ok: false, reason: e.message}; }
  if (!r.ok){ console.log('  skip  ' + path.basename(f) + '  (' + r.reason + ')'); skipped++; continue; }

  let name = r.slug + '.cho', n = 2;
  while (!dry && fs.existsSync(path.join(outDir, name))) name = r.slug + '-' + (n++) + '.cho';
  if (!dry) fs.writeFileSync(path.join(outDir, name), r.body, 'utf8');

  console.log('  ok    ' + name.padEnd(34) +
    r.shape.padEnd(9) + String(r.lines).padStart(3) + ' lines  ' +
    r.chords.slice(0, 6).join(' '));
  ok++;
}

console.log('\n' + ok + ' converted, ' + skipped + ' skipped' + (dry ? '  (dry run)' : '  -> ' + outDir));
if (ok && !dry) console.log("next:  node scripts/seal.js '<passphrase>' songs/public-domain " + outDir + " > sealed.json");
