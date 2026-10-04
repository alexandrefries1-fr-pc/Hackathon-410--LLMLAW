// Extraction du texte d'un PDF avec pdf.js, page par page, en reconstruisant les lignes
// (y compris les lignes de tableaux) à partir des positions des fragments.
// La bibliothèque pdf.js est injectée : build navigateur dans Electron, build "legacy" sous Node.

import { norm } from './text.js';

export async function extractPdf(pdfjsLib, data, opts = {}) {
  const task = pdfjsLib.getDocument({ data, isEvalSupported: false, useSystemFonts: false, ...opts });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    pages.push(buildPage(i, tc.items, vp.width, vp.height));
    page.cleanup();
  }
  await task.destroy();
  return pages;
}

export function buildPage(n, rawItems, width, height) {
  const items = rawItems
    .filter((it) => typeof it.str === 'string' && it.str.length)
    .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) || 10 }));
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35));
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);
  const out = [];
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd = null;
    for (const it of l.items) {
      if (prevEnd !== null) {
        const gap = it.x - prevEnd;
        if (gap > 1.2 && !text.endsWith(' ') && !it.s.startsWith(' ')) text += gap > 14 ? '  ' : ' ';
      }
      text += it.s;
      prevEnd = it.x + it.w;
    }
    const t = text.replace(/ /g, ' ').replace(/[ \t]{3,}/g, '  ').trimEnd();
    const lastIt = l.items[l.items.length - 1];
    if (t.trim()) out.push({ y: l.y, x: l.items[0].x, right: lastIt.x + lastIt.w, text: t.trim(), fs: Math.round(l.items[0].h) });
  }
  // Marges : en-tête (11 % haut) et pied de page (7 % bas)
  const top = height * 0.89;
  const bottom = height * 0.07;
  const margin = out.filter((l) => l.y > top || l.y < bottom);
  const body = out.filter((l) => !(l.y > top || l.y < bottom));
  return {
    n, width, height,
    lines: body.map((l) => l.text),
    paras: paragraphs(body),
    margin: margin.map((l) => l.text),
    text: body.map((l) => l.text).join('\n'),
  };
}

// Regroupe les lignes en paragraphes : un saut d'interligne plus grand que l'interligne courant,
// ou une ligne courte terminée par une ponctuation forte, marque la fin d'un paragraphe.
function paragraphs(lines) {
  if (!lines.length) return [];
  const gaps = lines.slice(0, -1).map((l, i) => l.y - lines[i + 1].y).filter((g) => g > 0).sort((a, b) => a - b);
  // interligne de référence : 1er quartile des écarts (les écarts entre paragraphes sont plus grands)
  const median = gaps.length ? gaps[Math.floor(gaps.length * 0.25)] : 12;
  const maxRight = Math.max(...lines.map((l) => l.right));
  const paras = [];
  let cur = '';
  lines.forEach((l, i) => {
    cur += (cur ? (cur.endsWith('-') && /^[a-zà-ÿ]/.test(l.text) ? '' : ' ') : '') + l.text;
    const next = lines[i + 1];
    const gap = next ? l.y - next.y : 99;
    const shortEnd = l.right < maxRight - 30 && /[.:!?»)]$/.test(l.text);
    // titre court (ex. "4. Mesures prises") suivi d'une ligne commençant par une majuscule
    const heading = next && l.right < maxRight - 120 && !/[,;]$/.test(l.text) && /^[A-ZÀ-ÝÉ«(]/.test(next.text);
    if (!next || gap > median * 1.3 || shortEnd || heading || Math.abs(next.x - l.x) > 6 && /[.:;!?»]$/.test(l.text)) { paras.push(cur); cur = ''; }
  });
  if (cur) paras.push(cur);
  return paras;
}

// Texte "à plat" d'une page : un paragraphe par ligne (les retours à la ligne internes sont supprimés).
export function flatText(page) {
  if (page.paras) return page.paras.map((p) => norm(p)).filter(Boolean).join('\n');
  return norm(page.lines.join('\n').replace(/-\n(?=[a-zà-ÿ])/g, '-').replace(/\n/g, ' '));
}
