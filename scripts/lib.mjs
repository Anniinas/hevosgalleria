// Yhteiset apufunktiot skripteille.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data');
export const GALLERY_DIR = path.join(DATA, 'galleries');
export const HORSES_FILE = path.join(DATA, 'horses.json');

export const GAIT_CODES = ['t', 'r', 'k', 'l', 'h', 'p', '-'];

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Paikalliset polut (ei repoon): kuvien sijainti omalla koneella.
export function localSources() {
  const file = path.join(ROOT, 'local-sources.json');
  if (!fs.existsSync(file)) {
    throw new Error('local-sources.json puuttuu. Kopioi local-sources.example.json ja täytä polut.');
  }
  return readJson(file);
}

export function slugify(s) {
  return s
    .replace(/[ðÐ]/g, 'd').replace(/[þÞ]/g, 'th').replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'o').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function loadGalleries() {
  return fs.readdirSync(GALLERY_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => readJson(path.join(GALLERY_DIR, f)));
}

export function loadHorses() {
  return fs.existsSync(HORSES_FILE) ? readJson(HORSES_FILE) : {};
}

export function saveHorses(horses) {
  const sorted = Object.fromEntries(Object.keys(horses).sort().map(k => [k, horses[k]]));
  fs.writeFileSync(HORSES_FILE, JSON.stringify(sorted, null, 2) + '\n');
}

// Galleria-JSON kirjoitetaan niin, että jokainen kuva on omalla rivillään:
// käsin korjaaminen ja git-diffit pysyvät selkeinä.
export function saveGallery(g) {
  const { entries, ...meta } = g;
  const lines = [];
  lines.push('{');
  for (const [k, v] of Object.entries(meta)) lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  lines.push('  "entries": [');
  entries.forEach((e, ei) => {
    const { images, ...rest } = e;
    lines.push('    {');
    for (const [k, v] of Object.entries(rest)) lines.push(`      ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    lines.push('      "images": [');
    images.forEach((img, ii) => {
      lines.push(`        ${JSON.stringify(img)}${ii < images.length - 1 ? ',' : ''}`);
    });
    lines.push('      ]');
    lines.push(`    }${ei < entries.length - 1 ? ',' : ''}`);
  });
  lines.push('  ]');
  lines.push('}');
  fs.writeFileSync(path.join(GALLERY_DIR, `${g.id}.json`), lines.join('\n') + '\n');
}

// local-sources.json: galleries-arvo on joko kansiopolku tai objekti { dir, title, … }
export function sourceDir(src, gid) {
  const v = src.galleries[gid];
  if (!v) return null;
  return path.join(src.imagesRoot, typeof v === 'string' ? v : v.dir);
}
