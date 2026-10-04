// Legal RAG: local retrieval over the criminal-procedure knowledge base (knowledge/legal_kb.json).
// Agents ground every flag in the relevant articles; the same index serves free-text legal questions.
// Fully local: BM25 over English paraphrases, no network.

import { Bm25 } from '../engine/search.js';

const EN_STOP = new Set(('a an the of to in and or is are be been by for on with as at from that this it its which who whom when where may can must not no any all '
  + 'other than then their they them has have had was were will shall into under within before after such each per also only one more most there these those '
  + 'what how does do did if so out up about over between same both his her he she').split(' '));

export function enTokens(text) {
  const f = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const out = [];
  for (let t of f.split(/[^a-z0-9-]+/)) {
    if (!t || t.length < 2 || EN_STOP.has(t)) continue;
    if (/^\d/.test(t)) { out.push(t); continue; }
    t = t.replace(/(ings?|ions?|ed|es|s)$/, '');
    if (t.length >= 2) out.push(t);
  }
  return out;
}

export class LegalRag {
  constructor(kb) {
    this.kb = kb;
    this.byId = Object.fromEntries(kb.entries.map((e) => [e.id, e]));
    this.docs = kb.entries.map((e) => ({ id: e.id, text: `${e.article} ${e.title}. ${e.text} ${(e.keywords || []).join(' ')} ${e.risk || ''}` }));
    this.bm = new Bm25(this.docs, 1.2, 0.6, enTokens);
  }

  get(id) { return this.byId[id] || null; }

  // Top-k articles for a free-text query
  retrieve(query, k = 3) {
    return this.bm.search(query, k).map((h) => ({ ...this.ref(h.id), score: h.score }));
  }

  // Compact reference attached to a flag
  ref(id) {
    const e = this.byId[id];
    if (!e) return null;
    return { id: e.id, article: `${e.code === 'CP' ? 'Criminal Code' : 'Code of Criminal Procedure'}, ${e.article}`, title: e.title, verification: e.verification, url: this.kb.sources[e.code] };
  }

  // Explicit references first, then retrieved ones (deduplicated, only clearly relevant hits)
  ground(ids = [], query = '', k = 3, minScore = 6) {
    const out = [];
    for (const id of ids) { const r = this.ref(id); if (r && !out.some((o) => o.id === r.id)) out.push(r); }
    if (query && out.length < k) {
      for (const r of this.retrieve(query, k)) if (r.score >= minScore && !out.some((o) => o.id === r.id) && out.length < k) out.push({ ...r, retrieved: true });
    }
    return out;
  }
}

// Prompt for a free legal question answered by the local Mistral model from retrieved articles only
export function lawPrompt(question, refs, rag) {
  const ctx = refs.map((r) => `[${r.id}] ${r.article} - ${r.title}: ${rag.get(r.id).text}`).join('\n\n');
  return [
    { role: 'system', content: 'You assist a French public prosecutor. Answer ONLY from the legal extracts provided, in plain English, citing each rule as [ID]. If the extracts do not answer, say so. Never give an opinion on guilt.' },
    { role: 'user', content: `Legal extracts:\n${ctx}\n\nQuestion: ${question}` },
  ];
}
