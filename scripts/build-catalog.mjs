// Kokoaa data/galleries/*.json + data/horses.json → site/data/catalog.json ja tarkistaa datan.
// Käyttö: node scripts/build-catalog.mjs [--check-files]
//   --check-files  tarkistaa myös, että jokainen kuva löytyy omalta koneelta (local-sources.json)
//                  ja että jokainen kansion kuva on jossain galleriassa.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, GAIT_CODES, loadGalleries, loadHorses, localSources, sourceDir } from './lib.mjs';

const errors = [];
const warnings = [];
const galleries = loadGalleries().sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
const horseData = loadHorses();

// Väriryhmät hakusuodattimeen: tarkat värit pysyvät, mutta "kaikki ruunikot" löytyvät kerralla.
function colorGroup(color) {
  const c = (color || '').toLowerCase();
  if (c.includes('kirjava')) return 'Kirjavat';
  if (c.includes('kimo')) return 'Kimot';
  if (/(voikko|hallakko|hiirakko|liinakko|cremello|perlino|päistärik)/.test(c)) return 'Voikot, hallakot, hiirakot ja liinakot';
  if (c.includes('ruunikko')) return 'Ruunikot';
  if (c.includes('rautias')) return 'Rautiaat';
  if (c.includes('musta')) return 'Mustat';
  return 'Muut värit';
}

const horseIds = [];
const horseIndex = new Map();
const useHorse = id => {
  if (!horseIndex.has(id)) {
    if (!horseData[id]) errors.push(`Hevosta "${id}" ei ole data/horses.json:ssa`);
    horseIndex.set(id, horseIds.length);
    horseIds.push(id);
  }
  return horseIndex.get(id);
};

const outGalleries = [];
const entries = [];
const files = [];
let gaits = '';
let orient = ''; // h = vaaka, v = pysty

for (const [gi, g] of galleries.entries()) {
  for (const k of ['id', 'title', 'date', 'discipline', 'entries']) {
    if (!g[k]) errors.push(`${g.id || '?'}: kenttä "${k}" puuttuu`);
  }
  const seen = new Set();
  let count = 0;
  for (const e of g.entries) {
    const start = files.length;
    for (const [file, gait, o] of e.images) {
      if (o !== undefined && o !== 'v') errors.push(`${g.id}: ${file} tuntematon suunta "${o}" (vain "v" = pystykuva)`);
      orient += o === 'v' ? 'v' : 'h';
      if (seen.has(file)) errors.push(`${g.id}: ${file} on kahdesti`);
      seen.add(file);
      if (!GAIT_CODES.includes(gait)) errors.push(`${g.id}: ${file} tuntematon askellaji "${gait}"`);
      files.push(file);
      gaits += gait;
    }
    if (!e.images.length) warnings.push(`${g.id}: hevosella ${e.horse} ei ole kuvia`);
    count += e.images.length;
    entries.push({
      g: gi,
      h: useHorse(e.horse),
      number: e.number || '',
      colorDesc: e.colorDesc || '',
      notes: e.notes || '',
      start,
      count: e.images.length,
    });
  }
  if (g.cover && !seen.has(g.cover)) warnings.push(`${g.id}: kansikuva ${g.cover} ei ole gallerian kuvissa`);
  outGalleries.push({
    id: g.id, title: g.title, date: g.date, discipline: g.discipline, place: g.place || '',
    cover: g.cover || g.entries[0]?.images[0]?.[0] || '',
    credit: g.credit || 'Tilli (VRL-00406)',
    horses: g.entries.length, photos: count,
  });

  // Sama kilpailunumero kahdella rivillä viittaa yleensä samaan hevoseen.
  const byNum = {};
  for (const e of g.entries) if (e.number) (byNum[e.number] ||= []).push(e.horse);
  for (const [n, hs] of Object.entries(byNum)) {
    if (new Set(hs).size > 1) warnings.push(`${g.id}: numero ${n} usealla hevosella (${hs.join(', ')}) – sama hevonen?`);
  }
}

const outHorses = horseIds.map(id => {
  const h = horseData[id] || { name: id };
  return {
    id,
    name: h.name,
    breed: h.breed || 'Ei tiedossa',
    ...(h.breedUncertain ? { breedUncertain: true } : {}),
    color: h.color || 'Ei tiedossa',
    colorGroup: colorGroup(h.color),
    ...(h.gender ? { gender: h.gender } : {}),
    ...(h.born ? { born: h.born } : {}),
    ...(h.unnamed ? { unnamed: true } : {}),
    ...(h.heppa?.id ? { heppa: { id: h.heppa.id, reg: h.heppa.reg, sire: h.heppa.sire, dam: h.heppa.dam } } : {}),
  };
});
const unused = Object.keys(horseData).filter(id => !horseIndex.has(id));
if (unused.length) warnings.push(`horses.json: ${unused.length} hevosta ei ole missään galleriassa (${unused.slice(0, 5).join(', ')}…)`);

if (process.argv.includes('--check-files')) {
  const src = localSources();
  for (const g of galleries) {
    const dir = sourceDir(src, g.id);
    if (!dir) { warnings.push(`${g.id}: ei paikallista kansiota local-sources.json:ssa`); continue; }
    const onDisk = new Set(fs.readdirSync(dir).filter(f => /\.jpe?g$/i.test(f)));
    const inData = new Set(g.entries.flatMap(e => e.images.map(i => i[0])));
    for (const f of inData) if (!onDisk.has(f)) errors.push(`${g.id}: ${f} puuttuu kansiosta`);
    for (const f of onDisk) if (!inData.has(f)) errors.push(`${g.id}: ${f} on kansiossa mutta ei datassa`);
  }
}

for (const w of warnings) console.warn('Varoitus: ' + w);
if (errors.length) {
  for (const e of errors) console.error('Virhe: ' + e);
  console.error(`\n${errors.length} virhettä – catalog.json jäi tekemättä.`);
  process.exit(1);
}

const catalog = { version: 1, built: new Date().toISOString(), galleries: outGalleries, horses: outHorses, entries, files, gaits, orient };
const out = path.join(ROOT, 'site', 'data', 'catalog.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(catalog));
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`catalog.json: ${outGalleries.length} galleriaa, ${outHorses.length} hevosta, ${files.length} kuvaa (${kb} kt)`);
