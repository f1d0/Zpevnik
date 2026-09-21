#!/usr/bin/env node
/**
 * passphrase.js — generate a songbook passphrase and report its real strength.
 *
 *   node scripts/passphrase.js [wordCount]
 *
 * Words are drawn with crypto.randomInt (uniform, no modulo bias). The printed
 * entropy is the honest figure: log2(listSize^words * 100), assuming the
 * attacker knows the generator and the list. Strength is then quoted against
 * PBKDF2-SHA256 at the iteration count seal.js uses.
 */
const crypto = require('crypto');

const WORDS = `
ancla arbor astra baleno barva bazar bedna blesk bobr bouda brana breh brizy
buben budka cesta chata chlum cihla cinek clun compas cukr datel delta dlan
dolek domek drak dratek druh duben duha dukat dusek dvorek echo edice fagot
fazole fialka filtr flauta fontana forma fresk fuga galerie granat hajek halo
harfa havran hejno hlina hnizdo hodina holub horal hrabe hrad hranol hrebik
hruska husle jablko jantar jarmo javor jedle jehla jelen jeskyne jestrab jezero
jilm jitro kachna kajak kalich kamen kanoe kapka kaple karta kaskada kavka
kmen kobalt kohout kolej komar kopec koral koruna kosatec kostka kotva koza
kredit krokev krtek kruh krystal kvartet kytice lampa lavina ledovec lekno
lepidlo lipa listek lodka loket louka lucerna lupa lyzar magnet majak makovice
malina mandle marina mece medved melodie mesic mlyn modrin mohyla molo mosaz
motyl mravenec mrkev muzeum nabytek nadeje narcis nasep nebe nedele norek
noty obilí oblak obruc ocel okap olive opal orech orgovan ostrov otava
palanda papoda parket pastel patro pavouk pecet pelikan penal perla petrklic
piano pilot pivonka platan plavba plotna podzim pole polena poklop potok
prameny prkno prsten pruh ptacek pulka puma radlice rakev rampa rebrik
remen reseda reva rokle rosa rukav rybnik rysava sada safir sedlo sekera
semeno sever silnice sirka skala sklep slama slunce smrk snizek sokol
sova spirala srdce stodola strom struna studna sud svetlo sykora talir
tapeta terasa tetiva tisk tkanina topol torzo trava trubka tulipan tunel
udoli ulice urna vaha valcik vanek vata vazba vcela verse vesla vichr
vidle viola vlcak vlna vodopad vrba vrchol vydra vyhen zahon zaliv zamek
zapad zebra zelva zidle zima zlato zrcadlo zvon
`.trim().split(/\s+/).filter(Boolean);

const uniq = [...new Set(WORDS)];
const n = Math.max(3, Math.min(10, parseInt(process.argv[2] || '5', 10)));

const pick = () => uniq[crypto.randomInt(uniq.length)];
const words = Array.from({length: n}, pick);
const digits = String(crypto.randomInt(10, 100));
const phrase = words.join('-') + '-' + digits;

const bits = Math.log2(Math.pow(uniq.length, n) * 90);
const ITER = 600000;
// optimistic attacker: a multi-GPU rig at ~1e5 PBKDF2-SHA256(600k) guesses/sec
const RATE = 1e5;
const seconds = Math.pow(2, bits - 1) / RATE;      // expected: half the space
const years = seconds / (365.25 * 24 * 3600);

console.log('\npassphrase:  ' + phrase);
console.log('\nword list:   ' + uniq.length + ' words, ' + n + ' words + 2 digits');
console.log('entropy:     ' + bits.toFixed(1) + ' bits');
console.log('PBKDF2:      ' + ITER.toLocaleString('en-US') + ' iterations (SHA-256)');
console.log('brute force: ~' + (years > 1e6
  ? (years / 1e6).toPrecision(3) + ' million years'
  : years.toPrecision(3) + ' years') +
  ' expected, at ' + RATE.toExponential(0) + ' guesses/sec\n');
