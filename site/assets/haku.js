import {
  loadCatalog, GAITS, GAIT_ORDER, esc, fold, formatDate, thumbButton, createLightbox,
  renderLicense, galleryHref, heppaUrl, breedLabel, showError,
} from './common.js';

const PAGE = 60;
const COLOR_GROUPS = ['Rautiaat', 'Ruunikot', 'Mustat', 'Kimot', 'Voikot, hallakot, hiirakot ja liinakot', 'Kirjavat', 'Muut värit'];

const form = document.getElementById('filters');
const nameInput = document.getElementById('f-nimi');
const info = document.getElementById('result-info');
const grid = document.getElementById('results');
const moreBtn = document.getElementById('more');
const chips = document.getElementById('chips');
const horseCard = document.getElementById('horse-card');

// Suodattimet. value(e) palauttaa rivin (hevonen gallerian sisällä) arvon; askellaji on kuvakohtainen.
const FACETS = {
  laji: { value: e => e.gallery.discipline },
  vuosi: { value: e => e.gallery.year, sort: (a, b) => b.localeCompare(a) },
  galleria: { value: e => e.gallery.id },
  rotu: { value: e => e.horse.breed },
  vari: { value: e => e.horse.color },
  sukupuoli: { value: e => e.horse.gender || 'Ei tiedossa' },
  askellaji: { image: true },
};

let c, lightbox;
let state = {};
let results = [];
let shown = 0;

try {
  c = await loadCatalog();
  lightbox = createLightbox(c);
  FACETS.galleria.label = id => `${c.galleryById[id].title} ${formatDate(c.galleryById[id].date)}`;
  FACETS.galleria.sort = (a, b) => c.galleryById[b].date.localeCompare(c.galleryById[a].date);
  FACETS.askellaji.label = k => GAITS[k];
  FACETS.askellaji.sort = (a, b) => GAIT_ORDER.indexOf(a) - GAIT_ORDER.indexOf(b);
  readUrl();
  bind();
  update();
  renderLicense(document.getElementById('license'), c.galleries[0]?.credit || '', '');
} catch (err) {
  showError(grid, err);
  info.textContent = '';
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  state = {};
  for (const k of [...Object.keys(FACETS), 'nimi', 'hevonen']) if (p.get(k)) state[k] = p.get(k);
  nameInput.value = state.nimi || '';
}

function writeUrl() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v) p.set(k, v);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function bind() {
  form.addEventListener('change', e => {
    if (e.target.tagName !== 'SELECT') return;
    state[e.target.name] = e.target.value;
    update();
  });
  let t;
  nameInput.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.nimi = nameInput.value.trim(); update(); }, 200);
  });
  form.addEventListener('submit', e => e.preventDefault());
  document.getElementById('reset').addEventListener('click', () => {
    state = {};
    nameInput.value = '';
    update();
  });
  moreBtn.addEventListener('click', renderMore);
  // Lataa lisää automaattisesti, kun sivun loppu tulee näkyviin
  new IntersectionObserver(es => {
    if (es.some(x => x.isIntersecting) && !moreBtn.hidden) renderMore();
  }, { rootMargin: '600px' }).observe(moreBtn);
}

// Onko rivi mukana, kun suodatin `skip` jätetään huomiotta (vaihtoehtojen lukumääriä varten)
function entryPasses(e, skip) {
  for (const [k, f] of Object.entries(FACETS)) {
    if (f.image || k === skip || !state[k]) continue;
    if (k === 'vari') {
      const v = state.vari;
      if (v.startsWith('g:') ? e.horse.colorGroup !== v.slice(2) : e.horse.color !== v) return false;
    } else if (f.value(e) !== state[k]) return false;
  }
  if (state.hevonen && e.horse.id !== state.hevonen) return false;
  if (state.nimi && !fold(e.horse.name).includes(fold(state.nimi))) return false;
  return true;
}

function imageCount(e, skip) {
  return state.askellaji && skip !== 'askellaji' ? (e.gaitCounts[state.askellaji] || 0) : e.count;
}

function facetCounts(key) {
  const counts = {};
  const add = (v, n) => { counts[v] = (counts[v] || 0) + n; };
  for (const e of c.entries) {
    if (!entryPasses(e, key)) continue;
    if (key === 'askellaji') {
      for (const [g, n] of Object.entries(e.gaitCounts)) add(g, n);
      continue;
    }
    const n = imageCount(e, key);
    if (!n) continue;
    add(FACETS[key].value(e), n);
    if (key === 'vari') add('g:' + e.horse.colorGroup, n);
  }
  return counts;
}

function fillSelect(key) {
  const sel = form.elements[key];
  const f = FACETS[key];
  const counts = facetCounts(key);
  const current = state[key] || '';
  sel.innerHTML = '';
  sel.add(new Option('Kaikki', ''));
  const opt = (value, text, n) => {
    const o = new Option(`${text} (${(n || 0).toLocaleString('fi')})`, value);
    if (!n && value !== current) o.disabled = true;
    return o;
  };

  if (key === 'vari') {
    // Ryhmät (esim. kaikki ruunikot) ja niiden alla tarkat värit
    const colors = [...new Set(c.horses.map(h => h.color))];
    for (const grp of COLOR_GROUPS) {
      const inGroup = colors.filter(col => c.horses.find(h => h.color === col).colorGroup === grp)
        .sort((a, b) => a.localeCompare(b, 'fi'));
      if (!inGroup.length) continue;
      const og = document.createElement('optgroup');
      og.label = grp;
      og.appendChild(opt('g:' + grp, `Kaikki: ${grp.toLowerCase()}`, counts['g:' + grp]));
      for (const col of inGroup) og.appendChild(opt(col, col, counts[col]));
      sel.appendChild(og);
    }
  } else {
    const all = new Set(f.image ? GAIT_ORDER.filter(g => c.gaits.includes(g)) : c.entries.map(e => f.value(e)));
    const values = [...all].sort(f.sort || ((a, b) => a.localeCompare(b, 'fi')));
    for (const v of values) sel.add(opt(v, f.label ? f.label(v) : v, counts[v]));
  }
  sel.value = current;
}

function update() {
  for (const k of Object.keys(FACETS)) fillSelect(k);
  writeUrl();
  renderHorse();

  results = [];
  const horses = new Set();
  for (const e of c.entries) {
    if (!entryPasses(e, null)) continue;
    let any = false;
    for (let k = e.start; k < e.start + e.count; k++) {
      if (state.askellaji && c.gaits[k] !== state.askellaji) continue;
      results.push(k);
      any = true;
    }
    if (any) horses.add(e.horse.id);
  }
  info.textContent = results.length
    ? `${results.length.toLocaleString('fi')} kuvaa · ${horses.size} hevosta`
    : 'Ei kuvia valituilla suodattimilla.';
  grid.innerHTML = '';
  shown = 0;
  renderMore();
}

function renderMore() {
  const end = Math.min(shown + PAGE, results.length);
  const frag = document.createDocumentFragment();
  for (let i = shown; i < end; i++) {
    const img = c.image(results[i]);
    const btn = thumbButton(c, results[i], { label: `${img.horse.name} · ${img.gallery.title}` });
    const pos = i;
    btn.addEventListener('click', () => lightbox.open(results, pos, { linkGallery: true }));
    frag.appendChild(btn);
  }
  grid.appendChild(frag);
  shown = end;
  moreBtn.hidden = shown >= results.length;
}

// Valitun hevosen tietokortti (?hevonen=<id>)
function renderHorse() {
  chips.innerHTML = '';
  horseCard.innerHTML = '';
  const h = state.hevonen && c.horseById[state.hevonen];
  if (!h) return;

  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.innerHTML = `Hevonen: ${esc(h.name)} <button type="button" aria-label="Poista hevosvalinta">&times;</button>`;
  chip.querySelector('button').addEventListener('click', () => { delete state.hevonen; update(); });
  chips.appendChild(chip);

  const galleries = h.entries.map(e =>
    `<li><a href="${esc(galleryHref(e.gallery.id, h.id))}">${esc(e.gallery.title)} ${esc(formatDate(e.gallery.date))}</a>`
    + `${e.number ? ` – nro ${esc(e.number)}` : ''} (${e.count} kuvaa)</li>`).join('');
  const hp = h.heppa;
  horseCard.innerHTML = `
    <section class="horse-card">
      <h2>${esc(h.name)}</h2>
      <dl>
        <dt>Rotu</dt><dd>${esc(breedLabel(h))}</dd>
        <dt>Väri</dt><dd>${esc(h.color)}</dd>
        ${h.gender ? `<dt>Sukupuoli</dt><dd>${esc(h.gender)}</dd>` : ''}
        ${h.born ? `<dt>Syntynyt</dt><dd>${esc(h.born)}</dd>` : ''}
        ${hp?.sire ? `<dt>Isä</dt><dd>${esc(hp.sire)}</dd>` : ''}
        ${hp?.dam ? `<dt>Emä</dt><dd>${esc(hp.dam)}</dd>` : ''}
        ${hp ? `<dt>Heppa</dt><dd><a href="${esc(heppaUrl(hp.id))}" rel="noopener">${esc(hp.reg || 'rekisteritiedot')}</a></dd>` : ''}
      </dl>
      <ul>${galleries}</ul>
    </section>`;
}
