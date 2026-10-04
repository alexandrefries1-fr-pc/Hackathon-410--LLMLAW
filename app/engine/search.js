// Index local BM25 (aucune donnée ne quitte la machine). Découpage par passages de quelques phrases,
// chaque passage conservant sa pièce et sa page pour permettre une citation exacte.

import { sentences, tokens, fold } from './text.js';

// Recherche augmentée par le Case Graph : si la question nomme un protagoniste, on ajoute ses déclarations
// structurées, celles qui le concernent, et les éléments techniques des incohérences qui le visent.
const FACT_KINDS = ['SEEN', 'AT_HOME', 'NO_PHONE', 'NOT_AT_PLACE', 'VOICE_ID', 'HEARD', 'MESSAGE_SENT', 'CLAIM'];
export function factPassages(data, question, k = 5) {
  const f = fold(question);
  const ids = new Set(data.persons.filter((p) => ['MIS_EN_CAUSE', 'TEMOIN', 'VICTIME'].includes(p.role) && f.includes(fold(p.last))).map((p) => p.id));
  if (!ids.size) return [];
  const out = [];
  const push = (x) => { if (!out.some((o) => o.docId === x.docId && o.text === x.text)) out.push(x); };
  const st = data.statements.filter((s) => FACT_KINDS.includes(s.kind) && (ids.has(s.subjectId) || ids.has(s.speakerId)))
    .sort((a, b) => FACT_KINDS.indexOf(a.kind) - FACT_KINDS.indexOf(b.kind));
  for (const s of st) push({ docId: s.docId, page: s.page, text: s.quote, score: 'fait' });
  for (const c of data.contradictions.filter((c) => ids.has(c.subjectId))) {
    for (const side of c.sides.filter((x) => x.role === 'TECHNIQUE')) for (const i of side.items) push({ docId: i.docId, page: i.page, text: `${side.label} : ${i.quote}`, score: 'fait' });
  }
  return out.slice(0, k);
}

export function askPassages(data, bm25, question) {
  const facts = factPassages(data, question);
  const hits = bm25.search(question, 6 - Math.min(3, facts.length)).filter((h) => !facts.some((x) => x.docId === h.docId && h.text.includes(x.text.slice(0, 40))));
  return [...facts, ...hits];
}

export function buildChunks(docs, maxLen = 650) {
  const chunks = [];
  for (const d of docs) {
    for (const p of d.pages) {
      let buf = '';
      for (const s of sentences(p.flat)) {
        if (buf && buf.length + s.text.length > maxLen) { chunks.push({ id: `${d.id}-${p.n}-${chunks.length}`, docId: d.id, page: p.n, text: buf }); buf = ''; }
        buf += (buf ? ' ' : '') + s.text;
      }
      if (buf) chunks.push({ id: `${d.id}-${p.n}-${chunks.length}`, docId: d.id, page: p.n, text: buf });
    }
  }
  return chunks;
}

export class Bm25 {
  constructor(chunks, k1 = 1.3, b = 0.72, tok = tokens) {
    this.chunks = chunks;
    this.k1 = k1; this.b = b; this.tok = tok;
    this.docs = chunks.map((c) => { const t = tok(c.text); const tf = new Map(); for (const x of t) tf.set(x, (tf.get(x) || 0) + 1); return { len: t.length, tf }; });
    this.avg = this.docs.reduce((a, d) => a + d.len, 0) / Math.max(1, this.docs.length);
    this.df = new Map();
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
  }
  search(query, k = 8, filter = null) {
    const q = [...new Set(this.tok(query))];
    const N = this.docs.length;
    const res = [];
    this.docs.forEach((d, i) => {
      if (filter && !filter(this.chunks[i])) return;
      let s = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (N - this.df.get(t) + 0.5) / (this.df.get(t) + 0.5));
        s += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * d.len / this.avg));
      }
      if (s > 0) res.push({ ...this.chunks[i], score: +s.toFixed(3) });
    });
    return res.sort((a, b) => b.score - a.score).slice(0, k);
  }
}
