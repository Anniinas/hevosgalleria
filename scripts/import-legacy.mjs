// Kertaluonteinen muunnos: vanhat galleriakansiot (data.js) → data/galleries/*.json + data/horses.json.
// Käyttö: node scripts/import-legacy.mjs [gallerian-id ...]
// Ilman argumentteja tuodaan kaikki local-sources.json:n galleriat, joilla ei vielä ole JSON-tiedostoa.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { GALLERY_DIR, localSources, slugify, loadHorses, saveHorses, saveGallery } from './lib.mjs';

// Gallerioiden perustiedot (vanhasta etusivusta).
const META = {
  '2009-03-15-islanninhevoskilpailut': { title: 'Islanninhevoskilpailut', date: '2009-03-15', discipline: 'Islanninhevoset', place: '', cover: 'DSC08225.jpg' },
  '2009-05-02-esteratsastus-laakso': { title: 'Esteratsastuskilpailut, Laakso', date: '2009-05-02', discipline: 'Esteratsastus', place: 'Laakso', cover: 'DSC09661.jpg' },
  '2014-05-25-lannenratsastus-hyvinkaa': { title: 'Lännenratsastus, Hyvinkää', date: '2014-05-25', discipline: 'Lännenratsastus', place: 'Hyvinkää', cover: 'DSC03491.jpg' },
  '2014-08-02-kouluratsastus-tuomarinkyla': { title: 'Kouluratsastus, Tuomarinkylä', date: '2014-08-02', discipline: 'Kouluratsastus', place: 'Tuomarinkylä', cover: 'DSC07122.jpg' },
  '2014-09-13-kouluratsastus-laakso': { title: 'Kouluratsastus, Laakso', date: '2014-09-13', discipline: 'Kouluratsastus', place: 'Laakso', cover: 'DSC02851.jpg' },
};

const UNNAMED = /^(Hevonen \d+|Tunnistamaton\b.*)$/;
const UNCERTAIN = /^(.*?)\s*\((todennäköinen|rotu epävarma|rotu tuntematon|epävarma)\)$/;
const GENDERS = { Ori: 'Ori', Ruuna: 'Ruuna', Tamma: 'Tamma' };

const src = localSources();
const wanted = process.argv.slice(2);
const horses = loadHorses();

for (const [gid, source] of Object.entries(src.galleries)) {
  if (wanted.length ? !wanted.includes(gid) : fs.existsSync(path.join(GALLERY_DIR, `${gid}.json`))) continue;
  // Uudet galleriat: local-sources.json:ssa { "dir": …, "title": …, "discipline": …, "place": …, "cover": … }
  const dir = typeof source === 'string' ? source : source.dir;
  const meta = META[gid] || (typeof source === 'object' && {
    title: source.title, date: gid.slice(0, 10), discipline: source.discipline,
    place: source.place || '', cover: source.cover || '',
  });
  if (!meta?.title || !meta?.discipline) {
    throw new Error(`${gid}: anna local-sources.json:ssa objekti, jossa on dir, title ja discipline`);
  }

  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(src.imagesRoot, dir, 'data.js'), 'utf8').replace(/^const /gm, 'var '),
    ctx,
  );

  const entries = [];
  for (const h of ctx.HORSES) {
    const named = !UNNAMED.test(h.name);
    const hid = named ? slugify(h.name) : `${gid}-${(h.key || String(h.id)).toLowerCase()}`;

    // Lännengallerian muistiinpanoihin on lisätty Heppa-tiedot; ne siirtyvät hevosen tietoihin.
    let notes = h.notes || '';
    let heppaReg = '';
    const hm = notes.match(/\s*Heppa: rek\.nro (\S+?),.*$/s);
    if (hm) { heppaReg = hm[1]; notes = notes.slice(0, hm.index); }

    const bm = (h.breed || '').match(UNCERTAIN);
    const horse = {
      name: h.name,
      breed: bm ? bm[1] : (h.breed || 'Ei tiedossa'),
      ...(bm ? { breedUncertain: true } : {}),
      color: h.color,
      ...(GENDERS[h.gender] ? { gender: GENDERS[h.gender] } : {}),
      ...(h.born ? { born: Number(h.born) } : {}),
      ...(heppaReg ? { heppa: { reg: heppaReg } } : {}),
    };
    if (!named) horse.unnamed = true;
    if (horses[hid] && named) {
      console.warn(`Huom: hevonen ${hid} on jo olemassa (toisesta galleriasta) – yhdistetään samaksi hevoseksi.`);
    } else {
      horses[hid] = horse;
    }

    entries.push({
      horse: hid,
      number: h.number || '',
      colorDesc: h.colorDesc || '',
      notes,
      images: h.images.map(i => [i.file, i.gait]),
    });
  }

  const g = {
    id: gid,
    ...meta,
    credit: ctx.GALLERY_LICENSE?.credit || 'Tilli (VRL-00406)',
    entries,
  };
  saveGallery(g);
  const n = entries.reduce((s, e) => s + e.images.length, 0);
  console.log(`${gid}: ${entries.length} hevosta, ${n} kuvaa`);
}

saveHorses(horses);
console.log(`Hevosia yhteensä: ${Object.keys(horses).length}`);
