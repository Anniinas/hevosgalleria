// Lataa alkuperäiset kuvat ja pikkukuvat Azure Blob Storageen AzCopylla.
//
//   node scripts/upload-images.mjs --account <tilinnimi> [--container images] [--sas "<sas-token>"] [gallerian-id …]
//
// Tunnistautuminen: joko `azcopy login` (Entra ID, tarvitsee roolin Storage Blob Data Contributor)
// tai --sas, jossa on kirjoitusoikeus säiliöön. Ilman gallerioita ladataan kaikki local-sources.json:n galleriat.
// Jo ladattuja kuvia ei ladata uudelleen (--overwrite=ifSourceNewer).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { localSources, sourceDir } from './lib.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const account = opt('--account');
const container = opt('--container') || 'images';
let sas = opt('--sas') || '';
if (sas && !sas.startsWith('?')) sas = '?' + sas;
if (!account) {
  console.error('Anna tilin nimi: node scripts/upload-images.mjs --account <tilinnimi>');
  process.exit(1);
}

const src = localSources();
const ids = args.length ? args : Object.keys(src.galleries);
const base = `https://${account}.blob.core.windows.net/${container}`;
// Kuvat eivät muutu samalla nimellä, joten selain ja CDN saavat säilyttää ne pitkään.
const common = ['--overwrite=ifSourceNewer', '--include-pattern=*.jpg;*.JPG;*.jpeg', '--cache-control=public, max-age=31536000, immutable', '--log-level=WARNING'];

function copy(from, to) {
  console.log(`→ ${to}`);
  const r = spawnSync('azcopy', ['copy', path.join(from, '*'), `${base}/${to}${sas}`, ...common], { stdio: 'inherit', shell: false });
  if (r.error) {
    console.error('AzCopya ei löytynyt. Asenna: winget install Microsoft.Azure.AZCopy.10');
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status);
}

for (const gid of ids) {
  const dir = sourceDir(src, gid);
  if (!dir) { console.error(`${gid}: ei local-sources.json:ssa`); process.exit(1); }
  copy(dir, `originals/${gid}`);
  copy(path.join(src.thumbsDir, gid), `thumbs/${gid}`);
}
console.log('Valmis.');
