// Lisää uuden gallerian ryhmittelystä (horse-gallery-taidon assignments.tsv + horses.json).
//
//   node scripts/add-gallery.mjs --id 2015-06-14-esteratsastus-ypaja \
//     --dir "2015/2015-06-14 Esteratsastus, Ypäjä" --title "Esteratsastus, Ypäjä" \
//     --discipline Esteratsastus --place Ypäjä --cover DSC01234.jpg \
//     --assignments assignments.tsv --horses horses.json [--force]
//
// assignments.tsv: tiedosto<TAB>hevosavain<TAB>askellaji  (#-rivit ohitetaan)
// horses.json:     { "credit": "…" (valinnainen),
//                    "horses": { "A": { "name": "…" (jos tiedossa), "color": "…", "colorDesc": "…",
//                                       "breed": "…", "notes": "…", "number": "…", "gender": "…", "born": 2004 } } }
//
// Tarkistaa, että jokainen kansion kuva on ryhmittelyssä täsmälleen kerran, kirjoittaa
// data/galleries/<id>.json, lisää uudet hevoset data/horses.json:iin ja gallerian local-sources.json:iin.
// Nimetty hevonen, joka on jo horses.json:ssa (esim. toisesta kilpailusta), yhdistetään siihen.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, GALLERY_DIR, GAIT_CODES, localSources, slugify, loadHorses, saveHorses, saveGallery, readJson } from './lib.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const force = args.includes('--force');
const need = ['id', 'dir', 'title', 'discipline', 'assignments', 'horses'];
const missing = need.filter(k => !opt(k));
if (missing.length) {
  console.error(`Puuttuu: ${missing.map(k => '--' + k).join(', ')}\nKatso käyttö skriptin alusta.`);
  process.exit(1);
}
const id = opt('id');
if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(id)) {
  console.error(`Tunnuksen pitää olla muotoa VVVV-KK-PP-laji-paikka (pienet kirjaimet, ei ääkkösiä): ${id}`);
  process.exit(1);
}
const outFile = path.join(GALLERY_DIR, `${id}.json`);
if (fs.existsSync(outFile) && !force) {
  console.error(`${outFile} on jo olemassa. Käytä --force korvataksesi (käsin tehdyt korjaukset häviävät).`);
  process.exit(1);
}

const src = localSources();
const dir = opt('dir').replace(/\\/g, '/');
const absDir = path.join(src.imagesRoot, dir);
if (!fs.existsSync(absDir)) { console.error(`Kansiota ei ole: ${absDir}`); process.exit(1); }

const meta = readJson(opt('horses'));
const hmeta = meta.horses || {};
const errors = [];

// Ryhmittely
const onDisk = new Set(fs.readdirSync(absDir).filter(f => /\.jpe?g$/i.test(f)));
const seen = new Map();
const byKey = new Map();
fs.readFileSync(opt('assignments'), 'utf8').split(/\r?\n/).forEach((line, i) => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const parts = line.includes('\t') ? line.split('\t') : line.split(/\s+/);
  if (parts.length !== 3) { errors.push(`rivi ${i + 1}: odotettiin 3 saraketta: ${line}`); return; }
  const [file, key, gait] = parts;
  if (seen.has(file)) errors.push(`${file} on ryhmittelyssä kahdesti (rivit ${seen.get(file)} ja ${i + 1})`);
  seen.set(file, i + 1);
  if (!onDisk.has(file)) errors.push(`rivi ${i + 1}: ${file} ei ole kansiossa`);
  if (!GAIT_CODES.includes(gait)) errors.push(`rivi ${i + 1}: tuntematon askellaji "${gait}" (${file})`);
  if (!hmeta[key]) errors.push(`rivi ${i + 1}: hevosavaimelle "${key}" ei ole tietoja horses.json:ssa`);
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push([file, gait]);
});
for (const f of onDisk) if (!seen.has(f)) errors.push(`${f} puuttuu ryhmittelystä`);
for (const [k, h] of Object.entries(hmeta)) {
  for (const field of ['color', 'breed']) if (!h[field]) errors.push(`hevonen ${k}: kenttä "${field}" puuttuu`);
  if (!byKey.has(k)) errors.push(`hevonen ${k}: ei yhtään kuvaa`);
}
const cover = opt('cover');
if (cover && !seen.has(cover)) errors.push(`kansikuva ${cover} ei ole ryhmittelyssä`);
if (errors.length) {
  for (const e of errors) console.error('Virhe: ' + e);
  console.error(`\n${errors.length} virhettä – mitään ei kirjoitettu.`);
  process.exit(1);
}

// Rivit kuvausjärjestyksessä (ensimmäisen kuvan mukaan)
const sortFiles = (a, b) => a[0].localeCompare(b[0], 'en', { numeric: true });
const keys = [...byKey.keys()].map(k => [k, byKey.get(k).sort(sortFiles)])
  .sort((a, b) => sortFiles(a[1][0], b[1][0]));

const UNNAMED = /^(Hevonen \d+|Tunnistamaton\b.*)?$/;
const UNCERTAIN = /^(.*?)\s*\((todennäköinen|rotu epävarma|rotu tuntematon|epävarma)\)$/;
const horses = loadHorses();
const entries = [];
let n = 0;
for (const [key, images] of keys) {
  n++;
  const h = hmeta[key];
  const named = h.name && !UNNAMED.test(h.name);
  const hid = named ? slugify(h.name) : `${id}-${key.toLowerCase()}`;
  if (named && horses[hid]) {
    const old = horses[hid];
    console.log(`Yhdistetty: ${h.name} on jo rekisterissä (${old.breed}, ${old.color}).` +
      (old.color !== h.color ? ` Huom: kuvista arvioitu väri "${h.color}" eroaa.` : ''));
  } else {
    const bm = h.breed.match(UNCERTAIN);
    horses[hid] = {
      name: named ? h.name : `Hevonen ${n}`,
      breed: bm ? bm[1] : h.breed,
      ...(bm ? { breedUncertain: true } : {}),
      color: h.color,
      ...(h.gender ? { gender: h.gender } : {}),
      ...(h.born ? { born: Number(h.born) } : {}),
      ...(named ? {} : { unnamed: true }),
    };
  }
  entries.push({
    horse: hid,
    number: h.number ? String(h.number) : '',
    colorDesc: h.colorDesc || '',
    notes: h.notes || '',
    images,
  });
}

saveGallery({
  id,
  title: opt('title'),
  date: id.slice(0, 10),
  discipline: opt('discipline'),
  place: opt('place') || '',
  cover: cover || entries[0].images[0][0],
  credit: meta.credit || 'Tilli (VRL-00406)',
  entries,
});
saveHorses(horses);

// Kuvakansio local-sources.json:iin
const lsFile = path.join(ROOT, 'local-sources.json');
const ls = readJson(lsFile);
ls.galleries[id] = dir;
fs.writeFileSync(lsFile, JSON.stringify(ls, null, 2) + '\n');

const total = entries.reduce((s, e) => s + e.images.length, 0);
console.log(`\n${id}: ${entries.length} hevosta, ${total} kuvaa → data/galleries/${id}.json`);
console.log(`Seuraavaksi:
  npm run heppa                        (näyttää Heppa-löydökset)
  npm run heppa -- --apply             (tallentaa varmat osumat)
  npm run thumbs -- ${id}
  npm run check
  npm run serve                        (esikatselu: http://localhost:8080)
  npm run upload -- ${id}
  git add -A && git commit && git push (julkaisu)`);
