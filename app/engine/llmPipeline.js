// LLM analysis pipeline (Mistral, cloud API or local Ollama).
//
//   ✦ Stage A  Document reader: one call per document -> type, summary, persons, events, statements, exhibits,
//              requests, procedural dates, usefulness.
//   ✦ Stage B  Case agents reading all Stage A outputs (+ legal RAG):
//              Chronology, Inconsistency, Document (missing pieces + progress), Deadline.
//   ⚙ Checks   Deterministic verification only: quotes must exist in the document text (page located),
//              documents must exist, legal ids must be in the knowledge base, deadline dates are recomputed
//              by the calendar (Art. 801) and any difference is shown.
//
// The output uses the same structures as the rules engine so that every screen can display it,
// with provenance = 'llm' (screens then show the ✦ Mistral badge).

import { DOC_TYPES } from './classify.js';
import { buildActions } from './actions.js';
import { promptKey, parseJson, parseJsonStrict } from './llm.js';
import { addDays, addMonths, daysBetween, art801 } from './rules.js';
import { fmtDate, clip } from './text.js';
import { LegalRag } from '../agents/legalRag.js';
import { DOC_TYPE_EN, HUMAN_REVIEW } from '../agents/agents.js';

const TYPE_KEYS = Object.keys(DOC_TYPES);
const SEVS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const ROLE_MAP = { VICTIM: 'VICTIME', SUSPECT: 'MIS_EN_CAUSE', WITNESS: 'TEMOIN', INVESTIGATOR: 'ENQUETEUR', MAGISTRATE: 'MAGISTRAT', LAWYER: 'AVOCAT', EXPERT: 'EXPERT', RELATIVE: 'PROCHE', OTHER: 'AUTRE' };
const ROLE_RANK = ['VICTIME', 'MIS_EN_CAUSE', 'TEMOIN', 'AVOCAT', 'MAGISTRAT', 'ENQUETEUR', 'EXPERT', 'PROCHE', 'AUTRE'];
const FORBIDDEN_EN = [/\b(is|was|seems|appears) guilty\b/gi, /\b(he|she) (lied|is lying)\b/gi, /\bliar\b/gi, /\b(is|was) the (killer|murderer|perpetrator)\b/gi, /\bshould be (convicted|prosecuted|sentenced)\b/gi];

const str = { type: 'string' };
const arr = (items, max) => ({ type: 'array', maxItems: max, items });
const obj = (props, req = Object.keys(props)) => ({ type: 'object', properties: props, required: req });

// ------------------------------------------------------------------ schemas
const READER_SCHEMA = obj({
  doc_type: { type: 'string', enum: TYPE_KEYS }, title: str, date: str, author: str, summary: str,
  usefulness: { type: 'string', enum: ['ESSENTIAL', 'USEFUL', 'LOW_VALUE'] }, usefulness_reason: str,
  persons: arr(obj({ name: str, role: { type: 'string', enum: Object.keys(ROLE_MAP) }, relation: str }), 12),
  events: arr(obj({ date: str, time: str, approx: { type: 'boolean' }, description: str, according_to: str, quote: str }), 14),
  statements: arr(obj({ speaker: str, about: str, claim: str, time_from: str, time_to: str, quote: str }), 10),
  exhibits: arr(obj({ seal: str, object: str, quote: str }), 8),
  requests: arr(obj({ what: str, requested_by: str, addressed_to: str, status: { type: 'string', enum: ['REQUESTED', 'PENDING', 'DONE'] }, due_date: str, quote: str }), 8),
  procedural_dates: arr(obj({ act: str, date: str, time: str, quote: str }), 8),
});
const CHRONO_SCHEMA = obj({
  summary: str,
  events: arr(obj({ date: str, time: str, approx: { type: 'boolean' }, label: str, category: { type: 'string', enum: ['WITNESS', 'SUSPECT', 'TECHNICAL', 'POLICE', 'MEDICAL'] },
    sources: arr(obj({ doc: str, time: str }), 6), conflict: { type: 'boolean' } }), 30),
});
const INC_SCHEMA = obj({
  summary: str,
  contradictions: arr(obj({ title: str, category: { type: 'string', enum: ['FACTUAL', 'TEMPORAL', 'TECHNICAL', 'STATEMENT_CHANGE', 'EXHIBIT', 'PROCEDURAL'] },
    strength: { type: 'string', enum: ['STRONG', 'TO_CHECK'] }, explanation: str,
    sides: arr(obj({ label: str, items: arr(obj({ doc: str, quote: str }), 4) }), 3), why_it_matters: str, check_to_do: str, legal: arr(str, 4) }), 10),
});
const DOC_SCHEMA = obj({
  summary: str,
  missing: arr(obj({ label: str, status: { type: 'string', enum: ['MISSING', 'PENDING', 'TO_PLAN', 'NOT_FOLLOWED_UP'] }, severity: { type: 'string', enum: SEVS },
    why: str, referenced_in: arr(obj({ doc: str, quote: str }), 4), who_must_send: str, due_date: str, legal: arr(str, 3) }), 10),
  progress: obj({ current_stage: str, percent: { type: 'number' }, next_steps: arr(str, 6) }),
});
const DL_SCHEMA = obj({
  summary: str,
  deadlines: arr(obj({ label: str, kind: { type: 'string', enum: ['CALCULATED', 'DATE_IN_DOCUMENT', 'CONTROL'] }, legal_id: str, trigger_act: str, trigger_date: str, trigger_doc: str,
    rule: str, due_date: str, who_must_act: str, action_for_prosecutor: str, control_status: { type: 'string', enum: ['OK', 'TO_CHECK', 'NA'] }, control_finding: str }), 14),
});

const SYSTEM_BASE = `You assist a French public prosecutor (parquet) on a homicide case file. The source documents are in French; you write in English.
Rules: use ONLY the material provided; copy quotes verbatim from the documents (max 200 characters); dates YYYY-MM-DD, times HH:MM (24h), "" when unknown;
attribute statements to their author; give indications for human review only, never a conclusion on guilt, credibility or the outcome. Return JSON only.`;

// ------------------------------------------------------------------ helpers
const nq = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, '');
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;

function locate(doc, quote) {
  if (!doc || !quote || quote.length < 10) return null;
  const q = nq(quote).slice(0, 70);
  const pg = doc.pages.find((p) => nq(p.text).includes(q));
  return pg ? { docId: doc.id, page: pg.n, quote } : null;
}
function cleanText(t) { let s = String(t || ''); for (const re of FORBIDDEN_EN) s = s.replace(re, '[removed: assessment reserved to the magistrate]'); return s; }

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

function docInput(d, maxChars) {
  let t = d.pages.map((p) => `[page ${p.n}]\n${p.text}`).join('\n');
  if (t.length > maxChars) t = `${t.slice(0, Math.floor(maxChars * 0.7))}\n[... middle pages omitted ...]\n${t.slice(-Math.floor(maxChars * 0.3))}`;
  return t;
}

async function call(chat, cache, model, messages, format, opts) {
  const key = await promptKey(model, messages, format);
  const hit = opts.fresh ? null : cache?.get(key);
  if (hit) return { ...hit, cached: true };
  const r = await chat({ messages, format, ...opts });
  const res = { content: r.content, ms: r.ms, model: r.model || model, finish: r.finish || null, cached: !!r.cached, at: new Date().toISOString() };
  cache?.set(key, res);
  return res;
}

// One LLM call with its JSON: a cached answer that is cut or invalid is asked again (fresh);
// an answer cut by the token limit is repaired (the last incomplete item is dropped) and marked.
async function ask(llm, cache, messages, format, opts) {
  let r = await call(llm.chat, cache, llm.model, messages, format, opts);
  if (r.cached && (r.finish === 'length' || !parseJsonStrict(r.content))) r = await call(llm.chat, cache, llm.model, messages, format, { ...opts, fresh: true });
  const strict = parseJsonStrict(r.content);
  const j = strict ?? parseJson(r.content);
  return { r, j, repaired: !strict && !!j, err: j ? null : `unreadable JSON${r.finish === 'length' ? ' (answer cut by the token limit)' : ''}` };
}

// ------------------------------------------------------------------ main
/**
 * llm: { chat({messages, format, maxTokens, numCtx}) -> {content, ms, model}, model, backend: 'cloud'|'local', concurrency }
 * base: analysis produced by analyzeCase (documents with page text, chunks) used as the text source.
 */
export async function analyzeWithLlm(base, { llm, kb, refDate, cache = null, onProgress = () => {} }) {
  const t0 = Date.now();
  const rag = new LegalRag(kb);
  const docs = base.documents.filter((d) => d.type !== 'INVENTAIRE');
  const byId = Object.fromEntries(docs.map((d) => [d.id, d]));
  const local = llm.backend === 'local';
  const maxChars = local ? 7000 : 60000; // a 3B model on CPU reads ~45 tokens/s: long documents are cut (head + tail)
  const opts = local ? { numCtx: 12288, maxTokens: 2200 } : { maxTokens: 4000 };
  // the case agents write long lists (events, contradictions with quotes): larger output budget
  const agentOpts = local ? { numCtx: 16384, maxTokens: 3000 } : { maxTokens: 14000 };
  const calls = [];
  const rejected = [];
  const track = (name, r, err) => calls.push({ name, ms: r?.ms ?? 0, cached: !!r?.cached, error: err || null, model: r?.model || null });

  // ---------------- ✦ Stage A: document reader
  onProgress({ step: 'llm-read', status: 'running', detail: `0/${docs.length}` });
  let doneA = 0;
  const reads = await pool(docs, local ? 1 : llm.concurrency || 4, async (d) => {
    const messages = [{ role: 'system', content: `${SYSTEM_BASE}\nTask: read ONE document and extract its structured content. doc_type must be one of: ${TYPE_KEYS.map((k) => `${k} (${DOC_TYPE_EN[k] || DOC_TYPES[k].label})`).join(', ')}.` },
      { role: 'user', content: `Document id: ${d.id}\nFile name: ${d.fileName}\n<<<\n${docInput(d, maxChars)}\n>>>` }];
    let r = null, j = null, err = null;
    try { ({ r, j, err } = await ask(llm, cache, messages, READER_SCHEMA, opts)); } catch (e) { err = String(e.message || e); }
    track(`reader ${d.id}`, r, err);
    onProgress({ step: 'llm-read', status: 'running', detail: `${++doneA}/${docs.length}` });
    return { doc: d, j, err };
  });
  onProgress({ step: 'llm-read', status: 'done', detail: `${docs.length} documents` });

  // ⚙ verification of Stage A
  const X = {};
  for (const { doc, j, err } of reads) {
    if (!j) { X[doc.id] = { failed: err }; continue; }
    const ver = (arr) => (arr || []).map((x) => { const loc = locate(doc, x.quote); if (x.quote && !loc) rejected.push({ where: doc.id, what: clip(x.quote, 60), reason: 'quote not found in the document' }); return { ...x, src: loc || { docId: doc.id, page: 1, quote: '' }, verified: !!loc }; });
    X[doc.id] = { ...j, doc_type: TYPE_KEYS.includes(j.doc_type) ? j.doc_type : 'AUTRE', date: isDate(j.date) ? j.date : '', summary: cleanText(j.summary),
      events: ver(j.events), statements: ver(j.statements), exhibits: ver(j.exhibits), requests: ver(j.requests), procedural_dates: ver(j.procedural_dates) };
  }
  const ok = docs.filter((d) => X[d.id] && !X[d.id].failed);
  if (!ok.length) throw new Error(`the document reader failed on every document (${reads[0]?.err || 'unknown error'})`);

  // Compact digest of Stage A for the case agents
  const digest = (fields, n = 8) => ok.map((d) => {
    const x = X[d.id];
    const parts = [`### ${d.id} | ${x.doc_type} (${DOC_TYPE_EN[x.doc_type] || ''}) | ${x.date || '-'} | ${clip(x.summary, 260)}`];
    if (fields.includes('events')) x.events.slice(0, n).forEach((e) => parts.push(`- event ${e.date} ${e.time}${e.approx ? '~' : ''}: ${clip(e.description, 140)} (according to ${e.according_to || '?'})${e.quote ? ` "${clip(e.quote, 110)}"` : ''}`));
    if (fields.includes('statements')) x.statements.slice(0, n).forEach((s) => parts.push(`- statement by ${s.speaker} about ${s.about}: ${clip(s.claim, 150)}${s.time_from ? ` [${s.time_from}-${s.time_to}]` : ''}${s.quote ? ` "${clip(s.quote, 120)}"` : ''}`));
    if (fields.includes('exhibits')) x.exhibits.forEach((e) => parts.push(`- exhibit seal ${e.seal}: ${clip(e.object, 80)}`));
    if (fields.includes('requests')) x.requests.forEach((q) => parts.push(`- request: ${clip(q.what, 120)} | by ${q.requested_by} | to ${q.addressed_to} | ${q.status}${q.due_date ? ` | due ${q.due_date}` : ''}${q.quote ? ` "${clip(q.quote, 110)}"` : ''}`));
    if (fields.includes('procedural_dates')) x.procedural_dates.forEach((p) => parts.push(`- procedural date: ${clip(p.act, 110)} on ${p.date} ${p.time}${p.quote ? ` "${clip(p.quote, 100)}"` : ''}`));
    return parts.join('\n');
  }).join('\n');
  const lawBlock = (ids, queries) => {
    const refs = [];
    for (const id of ids) { const r = rag.ref(id); if (r && !refs.some((x) => x.id === r.id)) refs.push(r); }
    for (const qy of queries) for (const r of rag.retrieve(qy, 2)) if (!refs.some((x) => x.id === r.id)) refs.push(r);
    return { refs, text: refs.map((r) => { const e = rag.get(r.id); return `[${r.id}] ${r.article} - ${r.title}: ${clip(e.text, 380)}${e.deadline ? ` (deadline: ${e.deadline.n} ${e.deadline.unit} from ${e.deadline.trigger})` : ''}`; }).join('\n') };
  };
  const agent = async (name, schema, mission, material, law) => {
    onProgress({ step: `llm-${name}`, status: 'running' });
    const messages = [{ role: 'system', content: `${SYSTEM_BASE}\nYou are the ${mission}` },
      { role: 'user', content: `Today: ${refDate}\n\n## Case documents (extracted by the document reader)\n${material}\n\n## Legal extracts (knowledge base)\n${law.text}` }];
    let r = null, j = null, err = null;
    let repaired = false;
    try { ({ r, j, err, repaired } = await ask(llm, cache, messages, schema, agentOpts)); } catch (e) { err = String(e.message || e); }
    track(name, r, err);
    onProgress({ step: `llm-${name}`, status: err ? 'error' : 'done', detail: err || (repaired ? 'long answer cut: last item dropped' : '') });
    return { j, r, err, law };
  };

  // ---------------- ✦ Stage B: case agents
  const chrono = await agent('chronology', CHRONO_SCHEMA,
    'Chronology agent. Build the timeline of the night of the facts and of the following hours, merging the events reported by several documents. When documents give different times for the same event, list each source with its time and set conflict=true.',
    digest(['events', 'statements']), lawBlock([], []));
  const incon = await agent('inconsistency', INC_SCHEMA,
    'Inconsistency agent. Compare the documents and list the contradictions: statements of the suspect vs witnesses, technical records (phone, CCTV) vs statements, different times for the same event, a witness changing version, exhibit (seal) numbering, and procedural irregularities (custody start time, late extension) that could ground a nullity request. Each side quotes the documents. STRONG = clearly incompatible; TO_CHECK = may be reconcilable.',
    digest(['events', 'statements', 'exhibits', 'procedural_dates'], 10), lawBlock(['CPP-56', 'CPP-63', 'CPP-171'], ['witness statement contradiction', 'chain of custody seal']));
  const stageItems = rag.kb.stages.map((st) => `${st.name}: ${st.items.map((i) => `${i.label}${i.required ? ' (required)' : ''}${i.later ? ' (later stage)' : ''}`).join('; ')}`).join('\n');
  const docAg = await agent('documents', DOC_SCHEMA,
    `Document agent. Find (1) documents or results that a document announces or requests but that are not in the file (say who must send them), (2) items mentioned only once and never followed up (e.g. a camera, belongings), (3) documents required at the current stage of the procedure. Then assess the progress of the procedure.\nExpected documents per stage:\n${stageItems}`,
    `Documents present: ${ok.map((d) => `${d.id} (${X[d.id].doc_type})`).join(', ')}\n\n${digest(['requests', 'statements'])}`, lawBlock(['CPP-81', 'CPP-156', 'CP-132-8', 'CPP-60-1'], ['missing expert report', 'personality inquiry']));
  const dlLaw = lawBlock(['CPP-53', 'CPP-63', 'CPP-706-88', 'CPP-148', 'CPP-82-1', 'CPP-145-2', 'CPP-173-1', 'CPP-175', 'CPP-230-28', 'CPP-801', 'CPP-380-9', 'CPP-568'], []);
  const deadl = await agent('deadlines', DL_SCHEMA,
    'Deadline agent. From the procedural dates found in the documents and the legal extracts, list every deadline that applies (release request, defence requests, detention terms, custody limits, nullity window, return of the body, expert report, recordings that may be overwritten...). For each one give the triggering act, its date and document, the legal rule, the due date (apply Art. 801), who must act and what the prosecutor should do. Also check the custody (start time vs apprehension, extension before expiry) as CONTROL items.',
    digest(['procedural_dates', 'requests'], 10), dlLaw);

  // ---------------- adapters (+ ⚙ checks) -> engine structures
  const src = (doc, quote) => locate(byId[doc], quote) || (byId[doc] ? { docId: doc, page: 1, quote: '' } : null);

  // documents
  const documents = base.documents.map((d) => {
    const x = X[d.id];
    if (!x || x.failed) return { ...d, method: d.type === 'INVENTAIRE' ? d.method : 'règles (LLM failed)' };
    return { ...d, type: x.doc_type, typeLabel: DOC_TYPES[x.doc_type]?.label || x.doc_type, family: DOC_TYPES[x.doc_type]?.family || 'Autres', date: x.date || d.date,
      method: `Mistral (${llm.backend})`, confidence: 0.9, llmSummary: x.summary, usefulness: x.usefulness, usefulnessReason: x.usefulness_reason, subtitle: x.title || d.subtitle };
  });
  const types = Object.fromEntries(documents.map((d) => [d.id, d.type]));

  // persons (merged by name)
  const pmap = new Map();
  for (const d of ok) for (const p of X[d.id].persons || []) {
    const name = String(p.name || '').replace(/^(M\.|Mme|Mr|Mrs|Ms|Me|Dr)\s+/i, '').trim();
    if (!name) continue;
    const last = name.split(/\s+/).pop().toUpperCase();
    const id = `P-${last}-${name.split(/\s+/).length > 1 ? name.split(/\s+/)[0].toUpperCase() : 'X'}`;
    const key = [...pmap.keys()].find((k) => k.startsWith(`P-${last}-`) && (k === id || k.endsWith('-X') || id.endsWith('-X'))) || id;
    const e = pmap.get(key) || { id: key, name, first: name.split(/\s+/).length > 1 ? name.split(/\s+/)[0] : null, last, roles: {}, docs: new Set(), relation: p.relation };
    if (name.length > e.name.length) e.name = name;
    const role = ROLE_MAP[p.role] || 'AUTRE';
    e.roles[role] = (e.roles[role] || 0) + 1;
    e.docs.add(d.id);
    pmap.set(key, e);
  }
  const persons = [...pmap.values()].map((e) => {
    const role = Object.keys(e.roles).sort((a, b) => ROLE_RANK.indexOf(a) - ROLE_RANK.indexOf(b))[0] || 'AUTRE';
    return { id: e.id, name: e.name, first: e.first, last: e.last, gender: null, role, roles: e.roles, docs: [...e.docs].sort(), mentionCount: e.docs.size, mentions: [...e.docs].map((id) => ({ docId: id, page: 1, quote: '' })), relation: e.relation };
  }).sort((a, b) => ROLE_RANK.indexOf(a.role) - ROLE_RANK.indexOf(b.role) || b.mentionCount - a.mentionCount);
  const pid = (name) => { const last = String(name || '').trim().split(/\s+/).pop()?.toUpperCase(); return persons.find((p) => p.last === last)?.id || null; };

  // statements (claims) for the persons screen and the Q&A
  const statements = ok.flatMap((d) => X[d.id].statements.map((s) => ({ kind: 'CLAIM', claim: s.claim, about: s.about, docId: d.id, page: s.src.page, quote: s.src.quote || s.quote, verified: s.verified,
    speakerId: pid(s.speaker), subjectId: pid(s.about), speaker: s.speaker, at: toMin(s.time_from) != null ? { minutes: toMin(s.time_from), approx: false } : null, window: null })));

  // timeline
  const CAT = { WITNESS: 'TEMOIGNAGE', SUSPECT: 'MIS_EN_CAUSE', TECHNICAL: 'TECHNIQUE', POLICE: 'POLICE', MEDICAL: 'MEDICAL' };
  const facts = (chrono.j?.events || []).map((e, i) => {
    const sources = (e.sources || []).filter((s) => byId[s.doc]).map((s) => {
      const evs = X[s.doc]?.events || [];
      const m = toMin(s.time) ?? toMin(e.time);
      const near = evs.find((x) => toMin(x.time) === m) || evs.find((x) => m != null && Math.abs((toMin(x.time) ?? -999) - m) <= 3);
      return { docId: s.doc, page: near?.src.page || 1, quote: near?.src.quote || '', minutes: toMin(s.time) ?? m };
    });
    const minutes = toMin(e.time);
    const mins = [...new Set(sources.map((s) => s.minutes).filter((x) => x != null))].sort((a, b) => a - b);
    return { id: `EV-${String(i + 1).padStart(3, '0')}`, date: isDate(e.date) ? e.date : base.factsDate, minutes: minutes ?? 0, approx: !!e.approx, kind: e.conflict ? 'CONFLICT' : 'LLM',
      label: cleanText(e.label), category: CAT[e.category] || 'POLICE', sources, importance: 'key', flags: [], provenance: 'llm',
      timeLabel: mins.length > 1 ? `${fmtMin(mins[0])} – ${fmtMin(mins[mins.length - 1])}` : minutes != null ? `${e.approx ? 'vers ' : ''}${fmtMin(minutes)}` : '—' };
  }).sort((a, b) => (a.date + String(a.minutes).padStart(5, '0')).localeCompare(b.date + String(b.minutes).padStart(5, '0')));
  const procedure = ok.flatMap((d) => X[d.id].procedural_dates.filter((p) => isDate(p.date)).map((p) => ({ date: p.date, minutes: toMin(p.time), label: cleanText(p.act), kind: 'ACTE', sources: [p.src], timeLabel: toMin(p.time) != null ? fmtMin(toMin(p.time)) : '' })))
    .sort((a, b) => (a.date + String(a.minutes ?? 9999).padStart(5, '0')).localeCompare(b.date + String(b.minutes ?? 9999).padStart(5, '0'))).map((e, i) => ({ id: `PR-${String(i + 1).padStart(3, '0')}`, ...e }));

  // contradictions
  const CATC = { FACTUAL: 'FACTUELLE', TEMPORAL: 'TEMPORELLE', TECHNICAL: 'TECHNIQUE', STATEMENT_CHANGE: 'EVOLUTION', EXHIBIT: 'SCELLES', PROCEDURAL: 'PROCEDURE' };
  const contradictions = (incon.j?.contradictions || []).map((c, i) => {
    const sides = (c.sides || []).map((s) => ({ label: cleanText(s.label), role: 'LLM', items: (s.items || []).map((it) => src(it.doc, it.quote)).filter(Boolean) })).filter((s) => s.items.length);
    return { id: `INC-${String(i + 1).padStart(2, '0')}`, status: 'OUVERTE', provenance: 'llm', category: CATC[c.category] || 'FACTUELLE', level: c.strength === 'STRONG' ? 'FORTE' : 'A_VERIFIER', key: `llm-${i}`,
      title: cleanText(c.title), summary: `${cleanText(c.explanation)} ${HUMAN_REVIEW}`, sides, notes: [c.why_it_matters, c.check_to_do].filter(Boolean).map(cleanText),
      legal: (c.legal || []).filter((x) => rag.get(x)).map((x) => rag.ref(x)), verified: sides.every((s) => s.items.some((it) => it.quote)) };
  }).filter((c) => c.sides.length);

  // missing pieces
  const STM = { MISSING: 'MANQUANT', PENDING: 'EN_ATTENTE', TO_PLAN: 'A_PLANIFIER', NOT_FOLLOWED_UP: 'SANS_SUITE' };
  const LV = { CRITICAL: 'CRITIQUE', HIGH: 'IMPORTANT', MEDIUM: 'IMPORTANT', LOW: 'SUIVI', INFO: 'SUIVI' };
  const missing = (docAg.j?.missing || []).map((m, i) => ({ id: `MAN-${String(i + 1).padStart(2, '0')}`, kind: 'LLM', provenance: 'llm', label: cleanText(m.label), basis: ['✦ LLM'], status: STM[m.status] || 'MANQUANT',
    level: LV[m.severity] || 'IMPORTANT', why: cleanText(m.why), sources: (m.referenced_in || []).map((r) => src(r.doc, r.quote)).filter(Boolean), linked: [], note: m.who_must_send ? `Who must send it: ${m.who_must_send}` : null,
    deadline: isDate(m.due_date) ? m.due_date : null, legal: (m.legal || []).filter((x) => rag.get(x)).map((x) => rag.ref(x)) }));
  const progress = docAg.j?.progress || null;

  // deadlines + ⚙ calculator check
  const KIND = { CALCULATED: 'CALCULEE', DATE_IN_DOCUMENT: 'EXTRAITE', CONTROL: 'CONTROLE' };
  const deadlines = (deadl.j?.deadlines || []).map((x, i) => {
    const kind = KIND[x.kind] || 'CALCULEE';
    const steps = [`✦ Mistral: ${cleanText(x.trigger_act)}${x.trigger_date ? ` on ${x.trigger_date}` : ''}${x.trigger_doc ? ` (${x.trigger_doc})` : ''} → ${cleanText(x.rule)} → ${x.due_date || 'no date'}`];
    let due = isDate(x.due_date) ? x.due_date : null;
    const e = rag.get(x.legal_id);
    if (kind === 'CALCULEE' && e?.deadline && isDate(x.trigger_date) && ['day', 'month', 'year'].includes(e.deadline.unit)) {
      const d0 = e.deadline.unit === 'day' ? addDays(x.trigger_date, e.deadline.n) : addMonths(x.trigger_date, e.deadline.unit === 'year' ? 12 * e.deadline.n : e.deadline.n);
      const calc = x.legal_id === 'CPP-145-2' ? d0 : art801(d0).date;
      if (!due) { due = calc; steps.push(`⚙ Calculator: ${x.trigger_date} + ${e.deadline.n} ${e.deadline.unit} (${x.legal_id}) = ${fmtDate(calc)}`); }
      else if (calc === due) steps.push(`⚙ Calculator check: ${fmtDate(due)} confirmed (${x.trigger_date} + ${e.deadline.n} ${e.deadline.unit}, Art. 801)`);
      else { steps.push(`⚙ Calculator check: Mistral proposed ${fmtDate(due)}, the calendar gives ${fmtDate(calc)} (${x.trigger_date} + ${e.deadline.n} ${e.deadline.unit}, Art. 801): calendar date kept`); due = calc; }
    } else if (kind === 'CALCULEE') steps.push('⚙ Calculator check: no structured rule for this deadline in the knowledge base, date not verified');
    const daysLeft = due ? daysBetween(refDate, due) : null;
    const priority = kind === 'CONTROLE' ? (x.control_status === 'OK' ? 'CONFORME' : 'A_VERIFIER') : daysLeft == null ? 'SUIVI' : daysLeft < 0 ? 'DEPASSEE' : daysLeft <= 3 ? 'CRITIQUE' : daysLeft <= 14 ? 'IMPORTANT' : 'SUIVI';
    const trig = byId[x.trigger_doc] ? [{ docId: x.trigger_doc, page: 1, quote: '' }] : [];
    return { id: `DL-${String(i + 1).padStart(2, '0')}`, provenance: 'llm', kind, ruleId: rag.get(x.legal_id) ? x.legal_id : null, label: cleanText(x.label), action: cleanText(x.action_for_prosecutor || x.label),
      basis: e ? `${e.article}` : x.legal_id || '', summary: cleanText(x.rule), dueDate: kind === 'CONTROLE' ? null : due, daysLeft, priority, steps, sources: trig, notes: x.who_must_act ? [`Who must act: ${x.who_must_act}`] : [],
      checks: kind === 'CONTROLE' ? [{ status: x.control_status === 'OK' ? 'CONFORME' : 'A_VERIFIER', label: cleanText(x.label), text: cleanText(x.control_finding || x.rule) }] : undefined, indicative: false };
  });
  const order = { DEPASSEE: 0, CRITIQUE: 1, A_VERIFIER: 2, IMPORTANT: 3, SUIVI: 4, CONFORME: 5 };
  deadlines.sort((a, b) => order[a.priority] - order[b.priority] || (a.dueDate || '9').localeCompare(b.dueDate || '9'));

  // evidence (exhibits)
  const exMap = new Map();
  for (const d of ok) for (const e of X[d.id].exhibits) {
    const k = `${e.seal}|${String(e.object).toLowerCase().slice(0, 24)}`;
    const cur = exMap.get(k) || { object: k, label: e.object, numbers: [e.seal], seizedIn: e.src, analyses: [], pending: [], conflicts: [], transmitted: null, docs: [] };
    if (!cur.docs.includes(d.id)) cur.docs.push(d.id);
    exMap.set(k, cur);
  }
  const evidence = [...exMap.values()];

  const actions = buildActions({ deadlines, missing, contradictions });

  // the agents' screen: every Stage B agent with its own flags
  const usedModel = calls.filter((c) => c.model && !c.cached).pop()?.model || calls.find((c) => c.model)?.model || llm.model;
  const SEV = (lvl) => ({ CRITIQUE: 'CRITICAL', IMPORTANT: 'HIGH', A_VERIFIER: 'MEDIUM', SUIVI: 'LOW', FORTE: 'HIGH', DEPASSEE: 'CRITICAL', CONFORME: 'INFO' }[lvl] || 'MEDIUM');
  const F = (agentId, n, o) => ({ id: `${agentId}-${String(n + 1).padStart(2, '0')}`, agent: agentId, engine: 'llm', status: 'OPEN', ...o });
  const agentEntry = (id, name, purpose, res, flags) => ({ id, name, purpose, triggers: id === 'DEADLINE' ? ['upload', 'daily'] : ['upload'], trigger: 'upload', engine: res?.err ? 'llm-error' : 'llm', model: usedModel,
    ranAt: new Date().toISOString(), ms: res?.r?.ms || 0, llm: { cached: !!res?.r?.cached, llmMs: res?.r?.ms || 0, summary: cleanText(res?.j?.summary || ''), rejected: [], lawConsulted: res?.law?.refs.map((r) => r.id) || [], error: res?.err }, flags });
  const agents = [
    agentEntry('READER', 'Document reader', 'Reads every document: type, summary, persons, events, statements, exhibits, requests, procedural dates.', { r: { ms: calls.filter((c) => c.name.startsWith('reader')).reduce((a, c) => a + c.ms, 0) } },
      ok.filter((d) => X[d.id].usefulness === 'LOW_VALUE').map((d, n) => F('QA', n, { severity: 'INFO', title: `${d.id} can be set aside`, detail: cleanText(X[d.id].usefulness_reason), sources: [{ docId: d.id, page: 1, quote: '' }], legal: [] }))),
    agentEntry('CHRONOLOGY', 'Chronology agent', 'Builds the timeline from all documents and marks events reported with different times.', chrono,
      facts.filter((e) => e.kind === 'CONFLICT').map((e, n) => F('CHR', n, { severity: 'MEDIUM', title: `Different times for: ${e.label}`, detail: e.sources.map((s) => `${s.docId} ${s.minutes != null ? fmtMin(s.minutes) : ''}`).join(' · '), sources: e.sources, legal: [] }))),
    agentEntry('INCONSISTENCY', 'Inconsistency agent', 'Compares documents: statements, technical records, times, exhibits, procedural irregularities.', incon,
      contradictions.map((c, n) => F('INC', n, { severity: c.category === 'PROCEDURE' || c.category === 'SCELLES' ? 'HIGH' : SEV(c.level), title: c.title, detail: c.summary, risk: c.notes.join(' '), sources: c.sides.flatMap((s) => s.items).slice(0, 6), legal: c.legal }))),
    agentEntry('DOC', 'Document agent', 'Missing referenced documents, items never followed up, documents required at this stage, progress of the procedure.', docAg,
      [...missing.map((m, n) => F('DOC', n, { severity: SEV(m.level), title: m.label, detail: m.why, actor: { who: m.note?.replace('Who must send it: ', '') }, sources: m.sources, legal: m.legal })),
        ...(progress ? [F('PRG', 0, { severity: 'INFO', title: `Procedure about ${Math.round(progress.percent || 0)}% complete · ${progress.current_stage}`, detail: (progress.next_steps || []).join(' | '), sources: [], legal: [] })] : [])]),
    agentEntry('DEADLINE', 'Deadline agent', 'Deadlines from the documents and the Code of Criminal Procedure; every date is re-checked by the calendar.', deadl,
      deadlines.map((d, n) => F('DL', n, { severity: SEV(d.priority), title: d.dueDate ? `${d.label}: ${fmtDate(d.dueDate)}` : d.label, detail: [d.summary, ...d.steps].join(' · '), dueDate: d.dueDate, daysLeft: d.daysLeft,
        actor: { who: d.notes[0]?.replace('Who must act: ', '') }, prosecutorAction: d.action, sources: d.sources, legal: d.ruleId ? [rag.ref(d.ruleId)] : [] }))),
  ];
  const allFlags = agents.flatMap((a) => a.flags);
  const count = (s) => allFlags.filter((f) => f.severity === s).length;

  return {
    ...base, provenance: 'llm', rulesBaseline: base.rulesBaseline || { contradictions: base.contradictions.length, missing: base.missing.length, deadlines: base.deadlines.length },
    llm: { backend: llm.backend, model: usedModel, calls, rejected, ms: Date.now() - t0, failedDocs: docs.filter((d) => X[d.id]?.failed).map((d) => ({ id: d.id, error: X[d.id].failed })) },
    documents, persons, statements, timeline: { facts, procedure }, contradictions, missing, matched: [], deadlines, actions, evidence, progressLlm: progress,
    agents: { schema: 'lccc.agents/2', mode: 'llm', backend: llm.backend, model: usedModel, runAt: new Date().toISOString(), trigger: 'upload', now: refDate, kbVersion: kb.version, agents, flags: allFlags,
      counts: { CRITICAL: count('CRITICAL'), HIGH: count('HIGH'), MEDIUM: count('MEDIUM'), LOW: count('LOW'), INFO: count('INFO') }, disclaimer: HUMAN_REVIEW },
    types,
  };
}
