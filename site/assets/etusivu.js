import { loadCatalog, thumbUrl, galleryHref, formatDate, esc, renderLicense, showError } from './common.js';

const root = document.getElementById('years');

try {
  const c = await loadCatalog();
  const photos = c.files.length;
  document.getElementById('summary').textContent =
    `${c.galleries.length} galleriaa · ${c.horses.length} hevosta · ${photos.toLocaleString('fi')} kuvaa. ` +
    'Jokaisessa galleriassa sama hevonen on omalla rivillään.';

  // Pikalinkit lajeittain
  const quick = document.getElementById('quick');
  const disciplines = [...new Set(c.galleries.map(g => g.discipline))].sort((a, b) => a.localeCompare(b, 'fi'));
  quick.innerHTML = disciplines.map(d => `<a href="haku.html?laji=${encodeURIComponent(d)}">${esc(d)}</a>`).join('');

  const byYear = {};
  for (const g of c.galleries) (byYear[g.year] ||= []).push(g);
  for (const year of Object.keys(byYear).sort((a, b) => b - a)) {
    const section = document.createElement('section');
    section.className = 'year';
    section.innerHTML = `<h2>${esc(year)}</h2><div class="grid"></div>`;
    const grid = section.querySelector('.grid');
    for (const g of byYear[year]) {
      const a = document.createElement('a');
      a.className = 'card';
      a.href = galleryHref(g.id);
      a.innerHTML = `
        <img src="${esc(thumbUrl(g.id, g.cover))}" alt="" loading="lazy">
        <div class="body">
          <h3>${esc(g.title)}</h3>
          <p>${esc(formatDate(g.date))} · ${esc(g.discipline)}</p>
          <p>${g.horses} hevosta · ${g.photos.toLocaleString('fi')} kuvaa</p>
        </div>`;
      grid.appendChild(a);
    }
    root.appendChild(section);
  }
  renderLicense(document.getElementById('license'), c.galleries[0]?.credit || '', '');
} catch (err) {
  showError(root, err);
}
