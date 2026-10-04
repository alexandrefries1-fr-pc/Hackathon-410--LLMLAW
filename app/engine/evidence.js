// Vue "Preuves" : statut de chaque objet saisi (analyses disponibles, attendues, manquantes, incohérences)
// et éléments n'apportant pas de confirmation (résultats négatifs ou non concluants), utiles à charge et à décharge.

import { fold, sentences, clip } from './text.js';
import { docText } from './segment.js';

const ANALYSIS_TYPES = new Set(['RAPPORT_LABO', 'RAPPORT_TRACES', 'EXPERTISE_GENETIQUE', 'RAPPORT_EXTRACTION_TEL', 'RAPPORT_TOXICO', 'VIDEO']);
const PENDING_KIND = { telephone: 'EXTRACTION_TEL', marteau: 'GENETIQUE', ongles: 'GENETIQUE', toxico: 'TOXICO', buccal: 'GENETIQUE' };
const RESULT = /(positive|negative|non concluant|ni identifiee ni exclue|ne peut etre ni|aucune trace|compatible|absence de tache)/;

export function buildEvidence({ seals, docs, types, missing, contradictions }) {
  const byObj = new Map();
  for (const s of seals) {
    if (!s.object) continue;
    if (!byObj.has(s.object)) byObj.set(s.object, { object: s.object, label: s.objectLabel, numbers: new Set(), mentions: [] });
    const e = byObj.get(s.object);
    if (/^\d+$/.test(s.number) || /ADN/.test(s.number)) e.numbers.add(s.number);
    e.mentions.push(s);
  }
  const docById = Object.fromEntries(docs.map((d) => [d.id, d]));
  const out = [];
  for (const e of byObj.values()) {
    const seizedIn = e.mentions.find((m) => ['PERQUISITION', 'PV_CONSTATATIONS', 'AUTOPSIE', 'PV_GAV', 'VIDEO'].includes(types[m.docId])) || e.mentions[0];
    const analyses = [];
    for (const m of e.mentions) {
      if (!ANALYSIS_TYPES.has(types[m.docId]) || analyses.some((a) => a.docId === m.docId)) continue;
      const d = docById[m.docId];
      const concl = d ? conclusionFor(d, e.object) : null;
      analyses.push({ docId: m.docId, type: types[m.docId], result: concl?.quote ?? null, page: concl?.page ?? m.page });
    }
    const pending = missing.filter((x) => x.kind === PENDING_KIND[e.object]);
    const conflicts = contradictions.filter((c) => c.key === `scelle-${e.object}`).map((c) => c.id);
    const transmitted = e.mentions.find((m) => types[m.docId] === 'TRANSMISSION_SCELLE');
    out.push({
      object: e.object, label: e.label, numbers: [...e.numbers], seizedIn: { docId: seizedIn.docId, page: seizedIn.page, quote: seizedIn.quote },
      analyses, pending: pending.map((p) => ({ id: p.id, label: p.label, status: p.status, deadline: p.deadline })), conflicts,
      transmitted: transmitted ? { docId: transmitted.docId, page: transmitted.page, quote: transmitted.quote } : null,
      docs: [...new Set(e.mentions.map((m) => m.docId))],
    });
  }
  const rank = (x) => (x.conflicts.length ? 0 : x.pending.some((p) => p.status === 'MANQUANT') ? 1 : x.pending.length ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}

function conclusionFor(doc, object) {
  const t = docText(doc);
  const all = sentences(t.text).filter((s) => RESULT.test(fold(s.text)));
  const own = all.filter((s) => fold(s.text).includes(object.slice(0, 5)));
  const s = own[own.length - 1] || all.find((x) => /conclusion/.test(fold(x.text))) || all[0];
  return s ? { quote: clip(s.text, 260), page: t.pageAt(s.start) } : null;
}

// Résultats négatifs, non concluants ou recherches infructueuses
const NEUTRAL = /(negative|ni identifiee ni exclue|ne peut etre ni|non identifi|ne permet(tent)? ni|aucun(e)? [^.]{0,60}(n'est|ne sont|n'a ete)\s+(decouvert|mis en evidence|visible|observee?)|aucune trace|aucun sac|ni d'etablir ni d'exclure|ne peuvent etre exclues)/;

export function neutralFindings(docs, types) {
  const out = [];
  for (const d of docs) {
    if (!['RAPPORT_TRACES', 'RAPPORT_LABO', 'PERQUISITION', 'VIDEO'].includes(types[d.id])) continue;
    const t = docText(d);
    for (const s of sentences(t.text)) {
      if (s.text.length < 40 || /^(CSU|Image \d)/.test(s.text) || out.some((o) => o.quote === clip(s.text, 300))) continue;
      if (NEUTRAL.test(fold(s.text))) out.push({ docId: d.id, page: t.pageAt(s.start), quote: clip(s.text, 300) });
    }
  }
  return out;
}

export function victimInfo(docs, types, victim) {
  if (!victim) return null;
  const info = { cause: null, birth: null };
  for (const d of docs) {
    const t = docText(d);
    for (const s of sentences(t.text)) {
      const f = fold(s.text);
      if (!info.cause && types[d.id] === 'AUTOPSIE' && /deces .{0,60}consecutif a/.test(f)) info.cause = { docId: d.id, page: t.pageAt(s.start), quote: clip(s.text, 300) };
      if (!info.birth && f.includes(fold(victim.last)) && /ne le (\d{2}\/\d{2}\/\d{4})/.test(f)) info.birth = { date: /ne le (\d{2}\/\d{2}\/\d{4})/.exec(f)[1], docId: d.id, page: t.pageAt(s.start) };
    }
  }
  return info;
}
