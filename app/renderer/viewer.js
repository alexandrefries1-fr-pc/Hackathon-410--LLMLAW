// Visionneuse de sources : affiche la page exacte de la pièce citée et surligne le passage.
// C'est le mécanisme de traçabilité : toute alerte renvoie à son texte d'origine.

import { icon } from './icons.js';

let pdfjsLib = null;
const fileCache = new Map();   // fileId -> Uint8Array
const pdfCache = new Map();    // fileId -> PDFDocumentProxy
let state = null;              // { ctx, doc, page, quote }

export function initViewer(lib) { pdfjsLib = lib; }
export function clearViewerCache() { fileCache.clear(); for (const d of pdfCache.values()) d.destroy?.(); pdfCache.clear(); }

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const normQ = (s) => String(s || '').replace(/\s…$/, '').replace(/…/g, '').normalize('NFC').replace(/[\s ]+/g, '').replace(/[’‘]/g, "'").toLowerCase();

export async function openSource(ctx, src) {
  // ctx : { caseId, documents, files, getFile }
  const doc = ctx.documents.find((d) => d.id === src.docId);
  if (!doc) return;
  state = { ctx, doc, page: Math.min(Math.max(1, src.page || 1), doc.pageCount), quote: src.quote || '' };
  const el = document.getElementById('drawer');
  el.innerHTML = `
    <div class="dh">
      <div>
        <div class="faint small">Pièce ${esc(doc.id)} · ${esc(doc.typeLabel)}${doc.date ? ' · ' + esc(doc.date.split('-').reverse().join('/')) : ''}</div>
        <h3>${esc(doc.subtitle || doc.typeLabel)}</h3>
        <div class="faint small">Fichier : ${esc(doc.fileName)} · stocké chiffré sur ce poste</div>
      </div>
      <button class="btn sm x" data-act="close-src">${icon('x')} Fermer</button>
    </div>
    ${state.quote ? `<div class="quote"><b>Passage cité</b>« ${esc(state.quote.replace(/\s…$/, ''))} »</div>` : ''}
    <div class="pv" id="pv"><div class="empty"><span class="spinner"></span> Ouverture de la pièce…</div></div>
    <div class="pnav">
      <button class="btn sm" data-act="src-page" data-d="-1">${icon('left')}</button>
      <span id="pnum" class="num"></span>
      <button class="btn sm" data-act="src-page" data-d="1">${icon('right')}</button>
      <span class="spacer" style="flex:1"></span>
      <span class="faint small" id="hlinfo"></span>
    </div>`;
  el.classList.add('open');
  document.getElementById('scrim').classList.add('on');
  await renderPage();
}

export function closeSource() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('scrim').classList.remove('on');
}

export async function turnPage(delta) {
  if (!state) return;
  const p = state.page + delta;
  if (p < 1 || p > state.doc.pageCount) return;
  state.page = p;
  await renderPage();
}

async function renderPage() {
  const { ctx, doc } = state;
  const pv = document.getElementById('pv');
  document.getElementById('pnum').textContent = `Page ${state.page} / ${doc.pageCount}`;
  const file = ctx.files.find((f) => f.fileId === doc.fileId);
  try {
    if (file?.kind === 'text') {
      const page = doc.pages[state.page - 1];
      pv.innerHTML = `<div class="pagebox" style="padding:28px 32px;max-width:680px;white-space:pre-wrap;font-size:13px">${highlightText(esc(page.text), state.quote)}</div>`;
      return;
    }
    let bytes = fileCache.get(doc.fileId);
    if (!bytes) { bytes = await ctx.getFile(doc.fileId); fileCache.set(doc.fileId, bytes); }
    let pdf = pdfCache.get(doc.fileId);
    if (!pdf) { pdf = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false, standardFontDataUrl: './vendor/pdfjs/standard_fonts/' }).promise; pdfCache.set(doc.fileId, pdf); }
    const filePage = doc.filePages[state.page - 1];
    const page = await pdf.getPage(filePage);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.6, (pv.clientWidth - 52) / base.width);
    const vp = page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
    const box = document.createElement('div');
    box.className = 'pagebox';
    box.style.width = `${vp.width}px`; box.style.height = `${vp.height}px`;
    box.appendChild(canvas);
    pv.innerHTML = '';
    pv.appendChild(box);
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    const tc = await page.getTextContent();
    const rects = matchQuote(tc.items, state.quote, vp);
    for (const r of rects) {
      const d = document.createElement('div');
      d.className = 'hl';
      Object.assign(d.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      box.appendChild(d);
    }
    document.getElementById('hlinfo').textContent = state.quote ? (rects.length ? 'Passage surligné sur la page' : 'Passage non localisé sur cette page') : '';
    if (rects.length) pv.scrollTop = Math.max(0, rects[0].y - 120);
  } catch (e) {
    pv.innerHTML = `<div class="empty">Impossible d'afficher la pièce : ${esc(e.message)}</div>`;
  }
}

function highlightText(html, quote) {
  if (!quote) return html;
  const q = esc(quote.replace(/\s…$/, '')).slice(0, 80);
  const i = html.indexOf(q);
  return i < 0 ? html : html.slice(0, i) + '<mark>' + html.slice(i, i + q.length) + '</mark>' + html.slice(i + q.length);
}

// Retrouve la citation dans les fragments de texte de la page (comparaison sans espaces ni casse)
function matchQuote(items, quote, vp) {
  if (!quote) return [];
  let big = '';
  const map = [];
  items.forEach((it, i) => {
    const s = it.str || '';
    for (let k = 0; k < s.length; k++) {
      if (/\s/.test(s[k])) continue;
      big += s[k].replace(/[’‘]/g, "'").toLowerCase();
      map.push([i, k]);
    }
  });
  let q = normQ(quote);
  let pos = big.indexOf(q);
  if (pos < 0 && q.length > 60) { const q2 = q.slice(0, 60); pos = big.indexOf(q2); if (pos >= 0) q = q2; }
  if (pos < 0 && q.length > 30) { const q3 = q.slice(-40); pos = big.indexOf(q3); if (pos >= 0) q = q3; }
  if (pos < 0) return [];
  const ranges = new Map();
  for (let j = pos; j < pos + q.length && j < map.length; j++) {
    const [i, k] = map[j];
    const r = ranges.get(i) || [k, k];
    r[0] = Math.min(r[0], k); r[1] = Math.max(r[1], k);
    ranges.set(i, r);
  }
  const out = [];
  for (const [i, [a, b]] of ranges) {
    const it = items[i];
    const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
    const fh = Math.hypot(tx[2], tx[3]);
    const w = it.width * vp.scale;
    const len = Math.max(1, it.str.length);
    out.push({ x: tx[4] + (w * a) / len - 1, y: tx[5] - fh * 0.92, w: (w * (b - a + 1)) / len + 2, h: fh * 1.22 });
  }
  return out;
}

export { esc };
