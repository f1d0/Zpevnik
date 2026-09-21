#!/usr/bin/env node
/**
 * seal.js — encrypt the songbook so the shipped page carries ciphertext only.
 *
 *   node scripts/seal.js <passphrase> [songDir ...] > sealed.json
 *
 * PBKDF2-HMAC-SHA256 (310k iterations, OWASP-recommended) derives an AES-256-GCM
 * key from the passphrase. The browser repeats exactly this with WebCrypto.
 * A wrong passphrase fails GCM authentication — there is no plaintext check to
 * bypass, because the plaintext is not in the file.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ITER = 600000, KEYLEN = 32, DIGEST = 'sha256';

function collect(roots){
  const songs = [];
  for (const root of roots){
    if (!fs.existsSync(root)) continue;
    for (const f of fs.readdirSync(root).sort()){
      if (!/\.(cho|chopro|chordpro|crd|pro)$/i.test(f)) continue;
      songs.push(fs.readFileSync(path.join(root, f), 'utf8'));
    }
  }
  return songs;
}

function seal(pass, roots){
  const songs = collect(roots);
  if (!songs.length) throw new Error('no song files found in: ' + roots.join(', '));

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(pass, salt, ITER, KEYLEN, DIGEST);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(songs), 'utf8'), cipher.final()]);
  // WebCrypto expects the GCM tag appended to the ciphertext
  const ct = Buffer.concat([body, cipher.getAuthTag()]);

  return {
    payload: {v: 1, iter: ITER, salt: salt.toString('base64'),
              iv: iv.toString('base64'), ct: ct.toString('base64')},
    count: songs.length,
    bytes: ct.length
  };
}

module.exports = {seal, collect, ITER};

if (require.main === module){
  const [, , pass, ...dirs] = process.argv;
  if (!pass){
    console.error('usage: node scripts/seal.js <passphrase> [songDir ...]');
    process.exit(1);
  }
  let r;
  try { r = seal(pass, dirs.length ? dirs : ['songs/public-domain']); }
  catch (e) { console.error(e.message); process.exit(1); }
  process.stdout.write(JSON.stringify(r.payload));
  console.error(`sealed ${r.count} songs (${r.bytes} bytes)`);
}
