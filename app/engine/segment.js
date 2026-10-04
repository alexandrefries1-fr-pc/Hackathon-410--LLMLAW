// Découpage des fichiers importés en pièces logiques (cotes).
// Un PDF "bundle" contenant plusieurs cotes est scindé grâce au tampon "Cote D05" présent en marge de chaque page.

import { flatText } from './pdftext.js';

const COTE_RE = /\bCote\s+([A-Z]{1,2}\d{1,3})\b/;

export function segmentFiles(files, log = () => {}) {
  const docs = [];
  for (const f of files) {
    let cur = null;
    for (const p of f.pages) {
      const m = (p.margin || []).join(' ').match(COTE_RE) || p.text.slice(0, 400).match(COTE_RE);
      const cote = m ? m[1] : null;
      if (!cur || (cote && cote !== cur.cote)) {
        cur = { cote, fileId: f.fileId, fileName: f.name, pages: [] };
        docs.push(cur);
      }
      cur.pages.push({ n: cur.pages.length + 1, filePage: p.n, lines: p.lines, text: p.text, flat: flatText(p), margin: p.margin || [] });
    }
  }
  // Identifiants : la cote si elle existe, sinon X01, X02...
  const seen = new Map();
  const out = [];
  let x = 0;
  for (const d of docs) {
    const sig = d.pages.map((p) => p.flat.slice(0, 200)).join('|');
    if (d.cote && seen.has(d.cote)) {
      if (seen.get(d.cote) === sig) {
        log(`Doublon ignoré : cote ${d.cote} (${d.fileName})`);
        continue;
      }
      d.cote = `${d.cote}bis`;
    }
    d.id = d.cote || `X${String(++x).padStart(2, '0')}`;
    seen.set(d.cote || d.id, sig);
    out.push(d);
  }
  return out.sort((a, b) => coteOrder(a.id) - coteOrder(b.id));
}

function coteOrder(id) {
  const m = /^([A-Z]+)(\d+)/.exec(id);
  if (!m) return 9e6;
  const rank = { D: 1, C: 2, B: 3, X: 9 }[m[1]] ?? 5;
  return rank * 10000 + +m[2];
}

// Texte continu d'une pièce avec correspondance offset -> page (pour citer la page exacte)
export function docText(doc) {
  let text = '';
  const marks = [];
  for (const p of doc.pages) {
    marks.push({ start: text.length, page: p.n });
    text += p.flat + ' ';
  }
  return {
    text,
    pageAt(offset) {
      let pg = 1;
      for (const m of marks) if (offset >= m.start) pg = m.page;
      return pg;
    },
  };
}
