// Yhteiset toiminnot: hakemiston lataus, kuvaosoitteet, lightbox ja lisenssi.
import { IMAGE_BASE } from '../config.js';

export const GAITS = { t: 'Tölt', r: 'Ravi', k: 'Käynti', l: 'Laukka', h: 'Hyppy', p: 'Passi', '-': 'Lähikuva' };
export const GAIT_ORDER = Object.keys(GAITS);
export const LICENSE_NAME = 'CC BY-NC 4.0';
export const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc/4.0/deed.fi';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

// Vertailuun: pienet kirjaimet, ei aksentteja (Ljóma → ljoma)
export const fold = s => String(s).replace(/[ðÐ]/g, 'd').replace(/[þÞ]/g, 'th').replace(/[æÆ]/g, 'ae')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const formatDate = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}.${m}.${y}`;
};

const enc = s => encodeURIComponent(s);
export const thumbUrl = (gid, file) => `${IMAGE_BASE}/thumbs/${enc(gid)}/${enc(file)}`;
export const fullUrl = (gid, file) => `${IMAGE_BASE}/originals/${enc(gid)}/${enc(file)}`;
export const galleryHref = (gid, horseId) => `galleria.html?g=${enc(gid)}${horseId ? '#h-' + enc(horseId) : ''}`;
export const galleryAbsUrl = gid => new URL(galleryHref(gid), location.href).href;
export const heppaUrl = id => `https://heppa.hippos.fi/heppa2/fi/horses/${enc(id)}`;

export const breedLabel = h => h.breed + (h.breedUncertain ? ' (todennäköinen)' : '');

// Lataa catalog.json ja liittää viittaukset valmiiksi.
export async function loadCatalog() {
  const res = await fetch('data/catalog.json');
  if (!res.ok) throw new Error(`catalog.json: ${res.status}`);
  const c = await res.json();
  c.galleries.forEach((g, i) => { g.index = i; g.year = g.date.slice(0, 4); g.entries = []; });
  c.horses.forEach((h, i) => { h.index = i; h.entries = []; });
  c.imageEntry = new Uint32Array(c.files.length);
  c.entries.forEach((e, i) => {
    e.index = i;
    e.gallery = c.galleries[e.g];
    e.horse = c.horses[e.h];
    e.gallery.entries.push(e);
    e.horse.entries.push(e);
    e.gaitCounts = {};
    for (let k = e.start; k < e.start + e.count; k++) {
      c.imageEntry[k] = i;
      e.gaitCounts[c.gaits[k]] = (e.gaitCounts[c.gaits[k]] || 0) + 1;
    }
  });
  c.image = k => {
    const e = c.entries[c.imageEntry[k]];
    return { k, file: c.files[k], gait: c.gaits[k], portrait: c.orient?.[k] === 'v', entry: e, gallery: e.gallery, horse: e.horse };
  };
  c.galleryById = Object.fromEntries(c.galleries.map(g => [g.id, g]));
  c.horseById = Object.fromEntries(c.horses.map(h => [h.id, h]));
  return c;
}

export function badge(gait, text) {
  const span = document.createElement('span');
  span.className = 'badge g-' + (gait === '-' ? 'x' : gait);
  span.textContent = text ?? GAITS[gait];
  return span;
}

// Pikkukuvanappi; label näytetään haussa kuvan alareunassa
export function thumbButton(catalog, k, { label, showFile } = {}) {
  const img = catalog.image(k);
  const btn = document.createElement('button');
  btn.className = img.portrait ? 'thumb portrait' : 'thumb';
  btn.type = 'button';
  btn.title = `${img.horse.name} – ${GAITS[img.gait]} – ${img.file}`;
  btn.innerHTML = `<img src="${esc(thumbUrl(img.gallery.id, img.file))}" alt="${esc(img.horse.name)}, ${esc(img.horse.color)}, ${esc(GAITS[img.gait])}" loading="lazy" decoding="async">`
    + (showFile ? `<span class="fname">${esc(img.file.replace(/\.jpe?g$/i, ''))}</span>` : '')
    + (label ? `<span class="label">${esc(label)}</span>` : '');
  btn.appendChild(badge(img.gait));
  return btn;
}

export function creditText(credit, url) {
  return `Kuva: ${credit}${url ? ', ' + url : ''} – ${LICENSE_NAME}`;
}

export function renderLicense(el, credit, url) {
  const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
  el.innerHTML = `
    <p>Kuvat: ${esc(credit)}. Kuvat on lisensoitu ${link(LICENSE_URL, LICENSE_NAME)} -lisenssillä.
      Saat käyttää, jakaa ja muokata kuvia ei-kaupallisiin tarkoituksiin, kun merkitset kuvan yhteyteen tekijän,
      linkin galleriaan ja lisenssin. Jos muokkaat kuvaa, mainitse se. Kaupallinen käyttö ei ole sallittua.</p>
    ${url ? `<p class="credit-example">Kuva: ${esc(credit)}, ${link(url, url)} – ${link(LICENSE_URL, LICENSE_NAME)}</p>` : ''}`;
  el.hidden = false;
}

// Iso kuva. open(lista kuvaindeksejä, aloituskohta, linkitetäänkö galleriaan)
export function createLightbox(catalog) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML = `
    <button class="lb-close" aria-label="Sulje">&times;</button>
    <button class="lb-nav lb-prev" aria-label="Edellinen">&#8249;</button>
    <figure><img alt=""><figcaption></figcaption></figure>
    <button class="lb-nav lb-next" aria-label="Seuraava">&#8250;</button>`;
  document.body.appendChild(box);
  const imgEl = box.querySelector('img');
  const cap = box.querySelector('figcaption');
  let list = [], pos = 0, linkGallery = false, lastFocus = null;

  function show() {
    const img = catalog.image(list[pos]);
    const h = img.horse, g = img.gallery, e = img.entry;
    imgEl.src = fullUrl(g.id, img.file);
    imgEl.alt = `${h.name}, ${h.color}, ${GAITS[img.gait]}`;
    const parts = [
      `<strong>${esc(h.name)}</strong>${e.number ? ' #' + esc(e.number) : ''}`,
      esc(breedLabel(h)), esc(h.color), esc(GAITS[img.gait]), esc(img.file),
      `${pos + 1}/${list.length}`,
    ];
    let html = parts.join(' · ');
    if (linkGallery) {
      html += `<br><a href="${esc(galleryHref(g.id, h.id))}">${esc(g.title)} ${esc(formatDate(g.date))}</a>`;
    }
    html += `<span class="lb-credit">${esc(creditText(g.credit, galleryAbsUrl(g.id)))}</span>`;
    cap.innerHTML = html;
    // Esilataa seuraava kuva
    if (list.length > 1) {
      const n = catalog.image(list[(pos + 1) % list.length]);
      new Image().src = fullUrl(n.gallery.id, n.file);
    }
  }
  function step(d) { pos = (pos + d + list.length) % list.length; show(); }
  function close() { box.hidden = true; imgEl.removeAttribute('src'); lastFocus?.focus(); }

  box.querySelector('.lb-close').addEventListener('click', close);
  box.querySelector('.lb-prev').addEventListener('click', () => step(-1));
  box.querySelector('.lb-next').addEventListener('click', () => step(1));
  box.addEventListener('click', e => { if (e.target === box) close(); });
  document.addEventListener('keydown', e => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  // Pyyhkäisy puhelimella
  let x0 = null;
  box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    x0 = null;
  });

  return {
    open(items, index, opts = {}) {
      list = items; pos = index; linkGallery = !!opts.linkGallery;
      lastFocus = document.activeElement;
      show();
      box.hidden = false;
      box.querySelector('.lb-close').focus();
    },
  };
}

export function showError(el, err) {
  console.error(err);
  el.innerHTML = `<p class="empty">Tietojen lataus epäonnistui. Yritä myöhemmin uudelleen.</p>`;
}
