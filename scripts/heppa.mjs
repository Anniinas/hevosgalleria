// Hakee nimettyjen hevosten rodun, värin, sukupuolen ja syntymäajan Hippoksen Heppa-rekisteristä.
//
//   node scripts/heppa.mjs                 näyttää löydökset, ei muuta mitään
//   node scripts/heppa.mjs --apply         tallentaa varmat osumat data/horses.json:iin
//   node scripts/heppa.mjs --apply <id>…   vain nämä hevoset (myös jo haetut päivitetään)
//   node scripts/heppa.mjs --pick <id>=<rekisterinumero>   valitse oikea, kun nimellä on monta osumaa
//
// Varma osuma = täsmälleen yksi hevonen samalla nimellä, tai rekisterinumero (heppa.reg) täsmää.
// Omistajien ja kasvattajien nimiä ei tallenneta.
import { loadHorses, saveHorses, slugify } from './lib.mjs';

const API = 'https://heppa.hippos.fi/rest/public/horse/';
const GENDER = { O: 'Ori', R: 'Ruuna', T: 'Tamma' };
// Heppassa nimen perässä voi olla maa- tai rekisteriliite: "Ylur fra Akranesi 59 ISL", "Spaka Fra Bakkakoti Ice", "JJ Big Sky SWE".
const SUFFIX = /\s+(\d+\s+)?(isl|ice|swe|usa|ger|dk|nor|fin|nl|be|fr|gb|ee|lt)$/i;
const clean = s => s.replace(/\(\?\)/g, '').trim();
const norm = s => slugify(clean(s).replace(SUFFIX, '')).replace(/-/g, '');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const picks = {};
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--apply') continue;
  if (args[i] === '--pick') { const [k, v] = args[++i].split('='); picks[k] = v; continue; }
  ids.push(args[i]);
}

async function get(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// Haku koko nimellä; jos ei täsmällistä osumaa, haetaan ensimmäisellä sanalla (erikoismerkit ja liitteet sotkevat hakua).
async function findExact(name) {
  const terms = [clean(name), clean(name).split(/\s+/)[0]];
  for (const term of terms) {
    const res = await get(`${API}search?pageSize=100&term=${encodeURIComponent(term)}`);
    const exact = (res.horses || []).filter(x => norm(x.name) === norm(name));
    if (exact.length) return exact;
  }
  return [];
}

const horses = loadHorses();
const targets = ids.length ? ids : Object.keys(horses).filter(id => !horses[id].unnamed && !horses[id].heppa?.id);
let changed = 0;

for (const id of targets) {
  const h = horses[id];
  if (!h) { console.log(`? ${id}: ei löydy horses.json:sta`); continue; }
  const exact = await findExact(h.name);
  const wantReg = picks[id] || h.heppa?.reg;
  let match = null;
  if (wantReg) match = exact.find(x => x.registerNo === wantReg) || null;
  else if (exact.length === 1) match = exact[0];

  if (!match) {
    if (!exact.length) console.log(`– ${id} (${h.name}): ei Hepassa`);
    else {
      console.log(`? ${id} (${h.name}): ${exact.length} osumaa, valitse --pick ${id}=<rek.nro>`);
      for (const x of exact) console.log(`     ${x.registerNo}  ${GENDER[x.gender] || x.gender}  s. ${x.birthYear}`);
    }
    continue;
  }

  const d = await get(API + match.id);
  const color = d.color ? d.color[0].toUpperCase() + d.color.slice(1) : h.color;
  const update = {
    breed: d.breed || (h.breed && h.breed !== 'Ei tiedossa' ? h.breed : 'Ei tiedossa'),
    color,
    gender: GENDER[d.gender] || h.gender,
    born: d.birthDate?.date ? Number(d.birthDate.date.slice(0, 4)) : h.born,
    heppa: {
      id: d.id,
      reg: match.registerNo,
      ...(d.father?.name ? { sire: d.father.name } : {}),
      ...(d.mother?.name ? { dam: d.mother.name } : {}),
    },
  };
  if (d.breed) delete h.breedUncertain;
  console.log(`✓ ${id}: ${update.breed} · ${update.color} · ${update.gender} · s. ${update.born} · ${match.registerNo}`);
  if (apply) { Object.assign(h, update); changed++; }
}

if (apply) { saveHorses(horses); console.log(`Päivitetty ${changed} hevosta.`); }
else console.log('\nMitään ei tallennettu. Lisää --apply tallentaaksesi varmat osumat.');
