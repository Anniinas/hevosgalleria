// Merkitsee pystykuvat galleria-JSONiin (kuvan kolmas kenttä "v"), jotta sivusto osaa
// varata pystykuvalle oikean muotoisen paikan jo ennen kuin kuva latautuu.
// Lukee koot pikkukuvista (thumbsDir), joissa EXIF-kierto on jo huomioitu.
// Käyttö: node scripts/orientation.mjs [gallerian-id …]   (make_thumbs.py ajaa tämän automaattisesti)
import fs from 'node:fs';
import path from 'node:path';
import { localSources, loadGalleries, saveGallery } from './lib.mjs';

// JPEG-tiedoston leveys ja korkeus SOF-lohkosta
function jpegSize(file) {
  const buf = fs.readFileSync(file);
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error(`Kokoa ei löytynyt: ${file}`);
}

const src = localSources();
const wanted = process.argv.slice(2);
for (const g of loadGalleries()) {
  if (wanted.length && !wanted.includes(g.id)) continue;
  const dir = path.join(src.thumbsDir, g.id);
  if (!fs.existsSync(dir)) { console.warn(`${g.id}: ei pikkukuvia, ohitetaan`); continue; }
  let portraits = 0, changed = 0;
  for (const e of g.entries) {
    for (const img of e.images) {
      const { width, height } = jpegSize(path.join(dir, img[0]));
      const want = height > width ? 'v' : undefined;
      if (want) portraits++;
      if (img[2] !== want) {
        changed++;
        if (want) img[2] = want; else img.length = 2;
      }
    }
  }
  if (changed) saveGallery(g);
  console.log(`${g.id}: ${portraits} pystykuvaa${changed ? `, ${changed} muutosta` : ''}`);
}
