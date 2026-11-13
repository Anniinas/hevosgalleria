// Lataa gallerian alkuperäiset kuvat ja pikkukuvat Azure Blob Storageen Azure CLI:llä.
//
//   node scripts/upload-images.mjs <gallerian-id> [<gallerian-id> …]
//   node scripts/upload-images.mjs --all
//   valinnaiset: --account tilliphotogallery  --container images
//
// Vaatii: az login (Azure CLI). Tilin avain haetaan az:lla eikä sitä tallenneta mihinkään.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { localSources, sourceDir } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : def; };
const account = opt('--account', 'tilliphotogallery');
const container = opt('--container', 'images');
const all = args.includes('--all');
const src = localSources();
const ids = all ? Object.keys(src.galleries) : args.filter(a => !a.startsWith('--'));
if (!ids.length) {
  console.error('Anna gallerian tunnus: node scripts/upload-images.mjs <gallerian-id>  (tai --all)');
  process.exit(1);
}

const q = s => `"${String(s).replace(/"/g, '\\"')}"`;
function az(cmd, env, capture) {
  const r = spawnSync(`az ${cmd}`, { shell: true, env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  if (r.error || r.status !== 0) {
    console.error(`az-komento epäonnistui${r.error ? ': ' + r.error.message : ''}. Onko Azure CLI asennettu ja az login tehty?`);
    process.exit(r.status || 1);
  }
  return (r.stdout || '').trim();
}

const key = az(`storage account keys list -n ${q(account)} --query "[0].value" -o tsv`, process.env, true);
const env = { ...process.env, AZURE_STORAGE_ACCOUNT: account, AZURE_STORAGE_KEY: key };
// Kuvat eivät muutu samalla nimellä, joten selain saa säilyttää ne vuoden.
const common = '--pattern "*.jpg" --content-type image/jpeg --content-cache-control "public, max-age=31536000, immutable" '
  + '--max-connections 8 --overwrite true --only-show-errors -o none';

for (const gid of ids) {
  const dir = sourceDir(src, gid);
  if (!dir) { console.error(`${gid}: ei local-sources.json:ssa`); process.exit(1); }
  for (const [kind, from] of [['thumbs', path.join(src.thumbsDir, gid)], ['originals', dir]]) {
    console.log(`${new Date().toLocaleTimeString('fi')} ${kind}/${gid}`);
    az(`storage blob upload-batch -d ${q(container)} --destination-path ${q(`${kind}/${gid}`)} -s ${q(from)} ${common}`, env);
  }
}
console.log('Valmis.');
