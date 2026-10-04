// Couche LLM (Mistral local via Ollama) : construction des prompts, sorties structurées, garde-fous.
// Le LLM n'est jamais la source de vérité : il reformule, explique et répond À PARTIR de passages cités.
// Toute sortie passe par guard() (formulations interdites) et citationsCheck() (traçabilité).

import { FORBIDDEN } from './lexicon.js';
import { clip } from './text.js';

export const SYSTEM_RULES = `Tu es un assistant d'analyse de dossier pénal destiné à des magistrats et à leurs greffiers, en France.
Règles impératives :
- Tu travailles UNIQUEMENT à partir des extraits fournis. Si l'information n'y figure pas, dis-le.
- Tu ne te prononces jamais sur la culpabilité, la sincérité ou le mensonge d'une personne, ni sur l'opportunité des poursuites ou d'une décision.
- Tu n'emploies aucun jugement de valeur ("suspect", "coupable", "ment", "aveu implicite").
- Tu attribues toujours une information à sa source (« selon M. X », « d'après le relevé de l'opérateur ») : une déclaration n'est jamais présentée comme un fait établi.
- Tu cites chaque affirmation factuelle avec sa référence entre crochets, par exemple [D06 p.1].
- Tu écris en français juridique sobre, phrases courtes.`;

// Formulations interdites supplémentaires (jugements de valeur)
const EXTRA = [/comportement suspect/i, /attitude suspecte/i, /aveu implicite/i, /\bmanifestement coupable\b/i, /prouve que .{0,40}(a tu|est coupable)/i];

export function guard(text) {
  let out = text;
  const flagged = [];
  for (const re of [...FORBIDDEN, ...EXTRA]) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    out = out.replace(g, (m) => { flagged.push(m); return '[formulation retirée : appréciation réservée au magistrat]'; });
  }
  return { text: out, flagged };
}

const CIT = /\[([A-Z]{1,2}\d{1,3}(?:bis)?)\s*(?:p\.?\s*(\d+))?\]/g;
export function citations(text) {
  return [...text.matchAll(CIT)].map((m) => ({ docId: m[1], page: m[2] ? +m[2] : 1, raw: m[0] }));
}

// Une réponse est "traçable" si chaque paragraphe factuel porte au moins une citation valide
export function citationsCheck(text, validDocIds) {
  const paras = text.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 40);
  const unsourced = paras.filter((p) => !citations(p).length && !/non trouv|ne figure pas|aucun extrait/i.test(p));
  const invalid = citations(text).filter((c) => !validDocIds.has(c.docId));
  return { ok: !unsourced.length && !invalid.length, unsourced, invalid };
}

// ---------- 1. Lecture neutre d'une incohérence + vérifications proposées ----------
export const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    lecture_neutre: { type: 'string' },
    hypotheses_de_compatibilite: { type: 'array', items: { type: 'string' } },
    verifications: { type: 'array', items: { type: 'string' } },
  },
  required: ['lecture_neutre', 'hypotheses_de_compatibilite', 'verifications'],
};

export function explainPrompt(inc) {
  const blocks = inc.sides.map((s) => `${s.label} :\n${s.items.slice(0, 3).map((i) => `- [${i.docId} p.${i.page}] « ${clip(i.quote, 300)} »`).join('\n')}`).join('\n\n');
  return [
    { role: 'system', content: SYSTEM_RULES },
    { role: 'user', content: `Le moteur de règles a signalé l'incohérence suivante : « ${inc.title} ».

Constat établi par le moteur (exact, à reprendre sans le modifier) : ${inc.summary}
${(inc.notes || []).map((n) => `Précision : ${n}`).join('\n')}

Extraits sources :
${blocks}

Réponds en JSON :
- lecture_neutre : 2 phrases maximum décrivant factuellement en quoi ces extraits divergent, avec les références entre crochets ;
- hypotheses_de_compatibilite : 1 à 3 hypothèses factuelles dans lesquelles les deux versions pourraient être conciliées (erreur d'heure, confusion de personne, etc.) ;
- verifications : 2 à 3 actes ou vérifications concrètes permettant au magistrat de lever l'incertitude.
N'émets aucune appréciation sur la culpabilité ou la sincérité.` },
  ];
}

// ---------- 2. Question libre sur le dossier (RAG local) ----------
export function askPrompt(question, passages) {
  const ctx = passages.map((p) => `[${p.docId} p.${p.page}] (${p.typeLabel ?? ''}) ${clip(p.text, 700)}`).join('\n\n');
  return [
    { role: 'system', content: SYSTEM_RULES },
    { role: 'user', content: `Extraits du dossier (seules sources autorisées) :

${ctx}

Question : ${question}

Réponds en 3 à 6 phrases, chaque phrase factuelle suivie de sa référence entre crochets [Dxx p.y]. Si les extraits ne permettent pas de répondre, écris exactement : « Information non trouvée dans les extraits analysés. »` },
  ];
}

// ---------- 3. Résumé neutre d'une pièce ----------
export function summarizePrompt(doc) {
  const text = doc.pages.map((p) => p.text).join('\n').slice(0, 5000);
  return [
    { role: 'system', content: SYSTEM_RULES },
    { role: 'user', content: `Pièce ${doc.id} (${doc.typeLabel}). Texte :\n${text}\n\nRésume cette pièce en 3 puces factuelles (qui, quoi, quand), sans appréciation. Termine chaque puce par [${doc.id}].` },
  ];
}

// ---------- 4. Classification d'une pièce non reconnue par les règles ----------
export function classifyPrompt(doc, types) {
  const text = doc.pages.map((p) => p.text).join('\n').slice(0, 2500);
  return {
    messages: [
      { role: 'system', content: 'Tu classes des pièces de procédure pénale française. Réponds uniquement en JSON.' },
      { role: 'user', content: `Types possibles : ${types.join(', ')}.\n\nDébut de la pièce :\n${text}\n\nDonne le type le plus probable et ta confiance (0 à 1).` },
    ],
    format: { type: 'object', properties: { type: { type: 'string', enum: types }, confiance: { type: 'number' } }, required: ['type', 'confiance'] },
  };
}

// Empreinte stable d'une requête (clé de cache des résultats LLM)
export async function promptKey(model, messages, format) {
  const s = JSON.stringify({ model, messages, format: format ?? null });
  const data = new TextEncoder().encode(s);
  const h = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export function parseJson(content) {
  try { return JSON.parse(content); } catch { const m = /\{[\s\S]*\}/.exec(content); return m ? JSON.parse(m[0]) : null; }
}
