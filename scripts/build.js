#!/usr/bin/env node
/**
 * build.js — assemble the deployable site.
 *
 *   node scripts/build.js '<passphrase>' [--out dist] [--songs dir ...]
 *
 * Seals songs/public-domain plus songs/private (gitignored) into the page and
 * writes dist/index.html. This runs on your machine, never in CI: CI has no
 * copy of songs/private, so it could not build the real songbook even if it
 * had the passphrase. Only the sealed output is ever deployed.
 */
const fs = require('fs');
const path = require('path');
const {seal} = require('./seal.js');

const args = process.argv.slice(2);
const pass = args.find(a => !a.startsWith('--'));
if (!pass){
  console.error("usage: node scripts/build.js '<passphrase>' [--out dist] [--songs dir ...]");
  process.exit(1);
}
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : 'dist';
const songIdx = args.indexOf('--songs');
const songDirs = songIdx >= 0
  ? args.slice(songIdx + 1).filter(a => !a.startsWith('--'))
  : ['songs/public-domain', 'songs/private'];

const SRC = 'prototype/index.html';
if (!fs.existsSync(SRC)){ console.error('missing ' + SRC); process.exit(1); }

let r;
try { r = seal(pass, songDirs); }
catch (e) { console.error(e.message); process.exit(1); }

const src = fs.readFileSync(SRC, 'utf8');
if (!/const SEALED = \{[\s\S]*?\};/.test(src)){
  console.error('could not find the SEALED payload in ' + SRC);
  process.exit(1);
}
const out = src.replace(/const SEALED = \{[\s\S]*?\};/,
  'const SEALED = ' + JSON.stringify(r.payload) + ';');

// The built page must carry no plaintext song. Check titles AND a sample of
// real lyric lines — a title alone can legitimately appear in UI copy, a lyric
// line cannot. Anything that trips this is a build-breaking bug, not a warning.
const leaks = [];
for (const dir of songDirs){
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)){
    if (!/\.(cho|chopro|chordpro|crd|pro)$/i.test(f)) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');

    const title = (text.match(/\{\s*title\s*:\s*([^}]*)\}/i) || [, ''])[1].trim();
    if (title && out.includes(title)) leaks.push(f + ': title "' + title + '"');

    const lyrics = text.split('\n')
      .filter(l => l.trim() && !/^\s*\{/.test(l))
      .map(l => l.replace(/\[[^\]]*\]/g, '').trim())
      .filter(l => l.length >= 12);
    for (const l of lyrics.slice(0, 4))
      if (out.includes(l)){ leaks.push(f + ': lyric "' + l.slice(0, 40) + '…"'); break; }
  }
}
if (leaks.length){
  console.error('REFUSING TO BUILD — plaintext found in output:');
  leaks.forEach(l => console.error('  ' + l));
  process.exit(1);
}

fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'index.html'), out, 'utf8');
fs.writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
fs.writeFileSync(path.join(outDir, '_headers'),
  '/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n' +
  '  X-Content-Type-Options: nosniff\n', 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log(`built ${outDir}/index.html — ${r.count} songs sealed, ${kb} KB`);
console.log('no plaintext song titles in output: ok');
console.log(`\ndeploy:  npx wrangler pages deploy ${outDir} --project-name zpevnik`);
