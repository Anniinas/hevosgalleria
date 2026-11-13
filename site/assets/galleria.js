import {
  loadCatalog, GAITS, GAIT_ORDER, esc, badge, thumbButton, createLightbox, renderLicense,
  formatDate, galleryAbsUrl, breedLabel, showError,
} from './common.js';

const main = document.getElementById('gallery');
const colorSelect = document.getElementById('filter-color');
const gaitSelect = document.getElementById('filter-gait');

try {
  const c = await loadCatalog();
  const gid = new URLSearchParams(location.search).get('g');
  const g = c.galleryById[gid];
  if (!g) {
    main.innerHTML = '<p class="empty">Galleriaa ei löytynyt. <a href="./">Takaisin etusivulle</a></p>';
  } else {
    init(c, g);
  }
} catch (err) {
  showError(main, err);
}

function init(c, g) {
  const title = `${g.title} ${formatDate(g.date)}`;
  document.title = `${title} – Hevosgalleriat`;
  document.getElementById('title').textContent = title;

  const breeds = [...new Set(g.entries.map(e => e.horse.breed))];
  const breedText = breeds.length === 1 ? breeds[0] : `${breeds.length} rotua`;
  document.getElementById('summary').textContent =
    `${g.discipline} · ${g.horses} hevosta · ${g.photos.toLocaleString('fi')} kuvaa · ${breedText}`;

  const colors = [...new Set(g.entries.map(e => e.horse.color))].sort((a, b) => a.localeCompare(b, 'fi'));
  for (const col of colors) colorSelect.add(new Option(col, col));
  const used = new Set(g.entries.flatMap(e => Object.keys(e.gaitCounts)));
  for (const k of GAIT_ORDER) if (used.has(k)) gaitSelect.add(new Option(GAITS[k], k));

  const lightbox = createLightbox(c);

  function render() {
    const color = colorSelect.value;
    const gait = gaitSelect.value;
    main.innerHTML = '';
    for (const e of g.entries) {
      const h = e.horse;
      if (color && h.color !== color) continue;
      const ks = [];
      for (let k = e.start; k < e.start + e.count; k++) if (!gait || c.gaits[k] === gait) ks.push(k);
      if (!ks.length) continue;

      const row = document.createElement('section');
      row.className = 'horse-row';
      row.id = 'h-' + h.id;

      const otherGalleries = h.entries.filter(x => x.gallery !== g).length;
      const info = document.createElement('div');
      info.className = 'horse-info';
      info.innerHTML = `
        <h2>${esc(h.name)}${e.number ? ` <span class="num">#${esc(e.number)}</span>` : ''}</h2>
        <dl>
          <dt>Rotu</dt><dd>${esc(breedLabel(h))}</dd>
          <dt>Väri</dt><dd>${esc(h.color)}</dd>
          ${h.gender ? `<dt>Sukupuoli</dt><dd>${esc(h.gender)}</dd>` : ''}
          ${h.born ? `<dt>Syntynyt</dt><dd>${esc(h.born)}</dd>` : ''}
          <dt>Kuvia</dt><dd>${e.count}</dd>
        </dl>
        <p class="desc">${esc(e.colorDesc)}${e.colorDesc && e.notes ? '<br>' : ''}${esc(e.notes)}</p>
        ${h.unnamed ? '' : `<a class="more" href="haku.html?hevonen=${encodeURIComponent(h.id)}">Kaikki kuvat hevosesta${otherGalleries ? ` (${otherGalleries + 1} galleriaa)` : ''} →</a>`}`;
      const counts = document.createElement('div');
      counts.className = 'gait-counts';
      for (const k of GAIT_ORDER) if (e.gaitCounts[k]) counts.appendChild(badge(k, `${GAITS[k]} ${e.gaitCounts[k]}`));
      info.appendChild(counts);

      const strip = document.createElement('div');
      strip.className = 'strip';
      ks.forEach((k, i) => {
        const btn = thumbButton(c, k, { showFile: true });
        btn.addEventListener('click', () => lightbox.open(ks, i));
        strip.appendChild(btn);
      });

      row.append(info, strip);
      main.appendChild(row);
    }
    if (!main.children.length) main.innerHTML = '<p class="empty">Ei kuvia valituilla suodattimilla.</p>';
  }

  colorSelect.addEventListener('change', render);
  gaitSelect.addEventListener('change', render);
  render();
  renderLicense(document.getElementById('license'), g.credit, galleryAbsUrl(g.id));

  // Linkki suoraan hevosen riville (#h-<id>)
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}
