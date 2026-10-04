// LLM agents (Mistral, local through Ollama).
// Each agent is a Mistral call with: a mission, the structured case facts, the results of deterministic
// tools (date calculator, cross-reference scanner, contradiction pre-detector, checklist) and the legal
// articles retrieved by the RAG. The LLM decides which flags to raise, their severity, who must act and why.
// A validation layer then checks every output against the file: existing documents, quotes found in the
// text, articles present in the knowledge base, dates coming from the calculator. No verdicts, only flags.

import { AGENTS as TOOL_AGENTS, DOC_TYPE_EN, HUMAN_REVIEW } from './agents.js';
import { LegalRag } from './legalRag.js';
import { promptKey, parseJson } from '../engine/llm.js';
import { daysBetween } from '../engine/rules.js';
import { fmtDate, fmtTime, clip } from '../engine/text.js';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const SEV = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));
const FORBIDDEN_EN = [/\b(is|was|seems|appears) guilty\b/gi, /\bguilt (is|seems) (established|proven|likely)\b/gi, /\b(he|she) (lied|is lying)\b/gi, /\bliar\b/gi,
  /\b(is|was) the (killer|murderer|perpetrator)\b/gi, /\bshould be (convicted|prosecuted|sentenced)\b/gi, /\bproves? (that )?(he|she) (killed|murdered)\b/gi];

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    flags: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: SEVERITIES },
          title: { type: 'string' },
          detail: { type: 'string' },
          who_must_act: { type: 'string' },
          action_for_prosecutor: { type: 'string' },
          documents: { type: 'array', items: { type: 'string' } },
          evidence_quote: { type: 'string' },
          legal: { type: 'array', items: { type: 'string' } },
          due_date: { type: 'string' },
        },
        required: ['severity', 'title', 'detail', 'who_must_act', 'action_for_prosecutor', 'documents', 'legal', 'due_date'],
      },
    },
  },
  required: ['summary', 'flags'],
};

// ------------------------------------------------------------------ case context helpers (English, compact)
const nameOf = (A, id) => A.persons.find((p) => p.id === id)?.name || id;
const docLine = (d) => `${d.id} | ${d.date ? fmtDate(d.date) : '-'} | ${DOC_TYPE_EN[d.type] || d.typeLabel}`;
const q = (s, n = 220) => `"${clip(String(s || '').replace(/\s+/g, ' '), n)}"`;
const toolFlags = (r, n = 12) => r.flags.slice(0, n).map((f) => `- [${f.severity}] ${f.title}. ${clip(f.detail, 260)}${f.sources?.length ? ` (docs: ${[...new Set(f.sources.map((s) => s.docId))].join(', ')})` : ''}${f.legal?.length ? ` (law: ${f.legal.map((l) => l.id).join(', ')})` : ''}`).join('\n');

const CONTEXT = {
  DOC(A, tool) {
    const req = A.missing.map((m) => `- ${m.label} | status: ${m.status}${m.deadline ? ` (due ${fmtDate(m.deadline)})` : ''} | referenced in ${m.sources.slice(0, 3).map((s) => `${s.docId}: ${q(s.quote, 160)}`).join(' ; ') || 'checklist only'}`);
    const found = A.matched.map((m) => `- ${m.label}: requested in ${m.requestedIn.join(', ') || '-'}, found in ${m.foundIn.join(', ')}`);
    return { facts: `Documents in the file:\n${A.documents.filter((d) => d.type !== 'INVENTAIRE').map(docLine).join('\n')}\n\nRequested or announced items NOT found in the file:\n${req.join('\n')}\n\nRequested items that WERE found:\n${found.join('\n')}`,
      tools: toolFlags(tool), queries: ['missing report expert analysis transmitted laboratory', 'documents required judicial investigation personality inquiry criminal record', 'dependency nullity custody acts annulled'] };
  },
  DEADLINE(A, tool) {
    const g = A.procedural.gav || {};
    const at = (x) => (x ? `${fmtDate(x.date)} ${fmtTime(x.minutes)}` : '-');
    const facts = [`Date of the facts: ${fmtDate(A.factsDate)}`, `Apprehension: ${at(g.interpellation)} (${g.interpellation?.src.docId || '-'})`, `Custody start recorded: ${at(g.declaredStart)}`,
      `Custody extension authorised: ${at(g.prolongation)} (${g.prolongation?.src.docId || '-'})`, `Custody ended: ${at(g.end)}`, `Pre-trial detention ordered: ${at(A.procedural.detention)} (${A.procedural.detention?.src.docId || '-'})`,
      `Release request received: ${at(A.procedural.dml?.received)}; communicated to the prosecutor: ${at(A.procedural.dml?.communicated)} (${A.procedural.dml?.docId || '-'})`,
      `Defence request for acts received: ${at(A.procedural.demandeActes?.received)} (${A.procedural.demandeActes?.docId || '-'})`,
      ...A.cameras.filter((c) => c.retention).map((c) => `${c.label}: recordings kept ${c.retention.raw} according to ${c.retention.src.docId}`)];
    const calc = tool.data.deadlines.map((d) => `- ${d.title} | due: ${d.dueDate ? `${d.dueDate} (${d.daysLeft} days left)` : '-'} | status: ${d.status} | actor: ${d.actor} | law: ${d.legal.map((l) => l.id).join(', ')}${d.computation ? ` | computation: ${d.computation.join(' / ')}` : ''}`);
    return { facts: facts.join('\n'), tools: `Date calculator (Art. 801 applied, reliable):\n${calc.join('\n')}`, allowedDates: tool.data.deadlines.map((d) => d.dueDate).filter(Boolean),
      queries: ['deadline release request JLD', 'custody duration extension start time', 'pre-trial detention felony duration', 'nullity time limit', 'return of the body autopsy'] };
  },
  QUALITY(A, tool) {
    const docs = tool.data.docs.map((d) => `- ${d.docId} | ${d.typeEn} | score ${d.score} | ${d.reasons.join('; ')}`);
    const imgs = tool.data.images.map((i) => `- ${i.docId} p.${i.page} ${i.ref}: ${q(i.caption, 120)} (pre-sorted: ${i.tier})`);
    return { facts: `Documents with usefulness signals:\n${docs.join('\n')}\n\nPhotographs:\n${imgs.join('\n')}`, tools: toolFlags(tool), queries: [] };
  },
  INCONSISTENCY(A, tool) {
    const KEEP = ['AT_HOME', 'NO_PHONE', 'NOT_AT_PLACE', 'SEEN', 'HEARD', 'VOICE_ID', 'VOICE_UNKNOWN', 'MESSAGE_SENT'];
    const st = A.statements.filter((s) => KEEP.includes(s.kind)).map((s) => `- ${s.docId} p.${s.page} | ${nameOf(A, s.speakerId)} | ${s.kind}${s.at ? ` at ${s.at.approx ? '~' : ''}${fmtTime(s.at.minutes)}` : ''}${s.window ? ` (${s.window.label})` : ''}${s.hedged ? ' | hedged' : ''} | ${q(s.quote, 200)}`);
    const ph = A.phone.flatMap((p) => p.rows.filter((r) => r.date === A.factsDate && r.minutes >= 18 * 60).map((r) => `- ${p.docId} p.${r.page} | line of ${p.owner?.name} | ${r.time} ${r.type} ${r.dir} ${p.directory[r.corr]?.name || r.corr} ${r.dur}`));
    const arr = A.timeline.facts.filter((e) => e.kind === 'ARRIVAL').map((e) => `- arrival of ${e.actor}: ${e.sources.map((s) => `${s.docId} ${s.minutes != null ? fmtTime(s.minutes) : ''}`).join(', ')}`);
    const seals = A.seals.filter((s) => s.object).map((s) => `- ${s.docId}: seal ${s.number} = ${s.object}`);
    return { facts: `Statements (speaker, type, time, quote):\n${st.join('\n')}\n\nPhone records of the evening:\n${ph.join('\n')}\n\nArrival times by source:\n${arr.join('\n')}\n\nSeals by document:\n${[...new Set(seals)].join('\n')}`,
      tools: `Contradiction pre-detector and custody checker:\n${toolFlags(tool)}`, queries: ['chain of custody seal numbering', 'custody start time extension nullity', 'witness statements contradiction'] };
  },
  PROGRESS(A, tool) {
    const ph = tool.data.phases.map((p) => `${p.name}: ${p.reached ? `${p.percent}%` : 'not started'}\n${p.items.map((i) => `  - ${i.label}: ${i.status}${i.found.length ? ` (${i.found.join(', ')})` : ''} | by ${i.producedBy}`).join('\n')}`);
    return { facts: `Procedure checklist (computed from the documents):\n${ph.join('\n')}\nOverall: ${tool.data.overall}%`, tools: '', queries: ['end of investigation notice final submissions', 'judicial investigation mandatory felony'] };
  },
};

const MISSION = {
  DOC: 'Document agent. Identify documents that are referenced but missing (say WHO must produce or send them), documents required at the current procedural stage, and dependencies between documents (what cannot be done or relied on until something else arrives or is fixed).',
  DEADLINE: 'Deadline agent. Turn the dated facts and the calculator results into deadline flags: say what must be done, by whom, by when, and whether it is an action for the prosecutor or something to monitor. Prioritise imminent and irreversible deadlines. Use ONLY dates given by the calculator.',
  QUALITY: 'Quality agent. Sort the reports and photographs into essential, useful and low value for a busy prosecutor; flag documents that can be set aside, photographs without evidential content, missing images and data-quality problems.',
  INCONSISTENCY: 'Inconsistency agent. Find contradictions between documents (statements of the suspect and witnesses, times, technical records, exhibit numbers) and procedural irregularities that could ground a nullity request. Say why each point matters and what check would clarify it.',
  PROGRESS: 'Progress agent. Assess how far the procedure has progressed against the steps of French criminal procedure, state the current stage and list the next milestones that are missing or pending.',
};

function buildMessages(spec, A, ctx, law, now) {
  const lawText = law.map((r) => `[${r.id}] ${r.article} - ${r.title}: ${clip(ctx.rag.get(r.id).text, 420)}`).join('\n');
  return [
    { role: 'system', content: `You are the ${MISSION[spec.id]}
You work for a French public prosecutor (parquet) on a homicide case. The goal is to avoid procedural defects (vices de procedure) and missed deadlines.
Rules:
- Use ONLY the case data, tool results and legal extracts below. Source documents are in French; write in English.
- Every flag cites at least one document id from the case (e.g. D06) and, when relevant, legal ids from the extracts (e.g. CPP-63).
- Flags are indications for human review: never conclude on guilt, credibility or the outcome. Attribute statements to their author ("according to ...").
- severity: CRITICAL = irreversible loss or deadline within 3 days; HIGH = important risk; MEDIUM; LOW; INFO.
- due_date: YYYY-MM-DD only if it appears in the data or tool results, otherwise "".
- At most 8 flags, most important first. Return JSON.` },
    { role: 'user', content: `Today: ${now}

## Case data
${ctx.facts}
${ctx.tools ? `\n## Tool results (deterministic, reliable)\n${ctx.tools}\n` : ''}
## Legal extracts (retrieved from the knowledge base)
${lawText}` },
  ];
}

// ------------------------------------------------------------------ validation of the LLM output
function normQ(s) { return String(s || '').normalize('NFC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ''); }

function validate(raw, spec, A, ctx, law, now) {
  const docs = Object.fromEntries(A.documents.map((d) => [d.id, d]));
  const lawIds = new Set(law.map((r) => r.id));
  const allowedDates = new Set(ctx.allowedDates || []);
  const accepted = [], rejected = [];
  let n = 0;
  for (const f of raw?.flags || []) {
    const ids = [...new Set((f.documents || []).map((x) => String(x).toUpperCase().trim()).filter((x) => docs[x]))];
    if (!ids.length) { rejected.push({ title: f.title, reason: 'no valid document reference' }); continue; }
    let quote = '', page = 1, quoteVerified = false;
    if (f.evidence_quote && f.evidence_quote.length > 12) {
      const nq = normQ(f.evidence_quote).slice(0, 60);
      for (const id of ids) {
        const pg = docs[id].pages.find((p) => normQ(p.text).includes(nq));
        if (pg) { quote = f.evidence_quote; page = pg.n; quoteVerified = true; break; }
      }
    }
    let text = `${f.title}\n${f.detail}`;
    const removed = [];
    for (const re of FORBIDDEN_EN) text = text.replace(re, (m) => { removed.push(m); return '[removed: assessment reserved to the magistrate]'; });
    const [title, ...rest] = text.split('\n');
    const due = /^\d{4}-\d{2}-\d{2}$/.test(f.due_date || '') ? f.due_date : '';
    const dateOk = !due || !ctx.allowedDates || allowedDates.has(due);
    accepted.push({
      id: `${spec.prefix}-${String(++n).padStart(2, '0')}`, agent: spec.prefix, engine: 'llm', status: 'OPEN',
      severity: SEVERITIES.includes(f.severity) ? f.severity : 'MEDIUM', category: spec.category,
      title: clip(title, 160), detail: clip(rest.join(' '), 700), actor: { who: clip(f.who_must_act || '', 160) }, prosecutorAction: clip(f.action_for_prosecutor || '', 300),
      dueDate: due && dateOk ? due : null, daysLeft: due && dateOk ? daysBetween(now, due) : null,
      sources: ids.map((id, i) => ({ docId: id, page: i === 0 ? page : 1, quote: i === 0 ? quote : '' })),
      legal: (f.legal || []).map((x) => String(x).toUpperCase().trim()).filter((x) => lawIds.has(x)).map((x) => ctx.rag.ref(x)),
      checks: { quoteVerified, dateVerified: !due || dateOk, removedPhrases: removed },
    });
    if (due && !dateOk) rejected.push({ title: f.title, reason: `date ${due} not produced by the calculator (dropped)` });
  }
  accepted.sort((a, b) => SEV[a.severity] - SEV[b.severity]);
  return { accepted, rejected };
}

// ------------------------------------------------------------------ runtime
const SPECS = [
  { id: 'DOC', tool: 'DOC', prefix: 'DOC', category: 'DOCUMENT', name: 'Document agent' },
  { id: 'DEADLINE', tool: 'DEADLINE', prefix: 'DL', category: 'DEADLINE', name: 'Deadline agent' },
  { id: 'QUALITY', tool: 'QUALITY', prefix: 'QA', category: 'QUALITY', name: 'Quality agent' },
  { id: 'INCONSISTENCY', tool: 'INCONSISTENCY', prefix: 'INC', category: 'INCONSISTENCY', name: 'Inconsistency agent' },
  { id: 'PROGRESS', tool: 'PROGRESS', prefix: 'PRG', category: 'PROGRESS', name: 'Progress agent' },
];

/**
 * Runs the five Mistral agents.
 * chat({ model, messages, format }) -> { content } is injected (Electron IPC in the app, Ollama fetch in Node).
 * cache: { get(key), set(key, value) } (optional). onProgress(agentId, status) (optional).
 */
export async function runLlmAgents(A, { kb, chat, model, trigger = 'upload', now = new Date().toISOString().slice(0, 10), previous = null, cache = null, onProgress = () => {} }) {
  const rag = new LegalRag(kb);
  const runAt = new Date().toISOString();
  const agents = [];
  for (const spec of SPECS) {
    const toolAgent = TOOL_AGENTS.find((a) => a.id === spec.tool);
    if (!toolAgent.triggers.includes(trigger) && previous) {
      const prev = previous.agents.find((x) => x.id === spec.id);
      if (prev) { agents.push(prev); continue; }
    }
    onProgress(spec.id, 'running');
    const t0 = Date.now();
    const tool = toolAgent.run(A, { rag, now, trigger });           // deterministic tools
    const ctx = { ...CONTEXT[spec.id](A, tool), rag };
    const law = rag.ground([...new Set(tool.flags.flatMap((f) => (f.legal || []).map((l) => l.id)))].slice(0, 6), '', 6, 99);
    for (const qy of ctx.queries) for (const r of rag.retrieve(qy, 2)) if (!law.some((l) => l.id === r.id) && law.length < 9) law.push(r);
    const messages = buildMessages(spec, A, ctx, law, now);
    let entry;
    try {
      const key = await promptKey(model, messages, OUTPUT_SCHEMA);
      let res = cache?.get(key);
      const cached = !!res;
      if (!res) {
        res = await chat({ model, messages, format: OUTPUT_SCHEMA });
        res = { content: res.content, ms: res.ms ?? Date.now() - t0, model, at: new Date().toISOString(), label: `agent ${spec.id}` };
        cache?.set(key, res);
      }
      const raw = parseJson(res.content);
      if (!raw) throw new Error('unreadable JSON from the model');
      const { accepted, rejected } = validate(raw, spec, A, ctx, law, now);
      entry = { id: spec.id, name: spec.name, purpose: toolAgent.purpose, triggers: toolAgent.triggers, trigger, engine: 'llm', model, ranAt: runAt, ms: Date.now() - t0,
        llm: { cached, llmMs: res.ms, summary: clip(raw.summary || '', 600), rejected, lawConsulted: law.map((l) => l.id) }, flags: accepted, data: tool.data, toolFlags: tool.flags };
      onProgress(spec.id, 'done');
    } catch (e) {
      entry = { id: spec.id, name: spec.name, purpose: toolAgent.purpose, triggers: toolAgent.triggers, trigger, engine: 'rules-fallback', model, ranAt: runAt, ms: Date.now() - t0,
        llm: { error: String(e.message || e) }, flags: tool.flags, data: tool.data };
      onProgress(spec.id, 'fallback');
    }
    agents.push(entry);
  }
  const flags = agents.flatMap((a) => a.flags).sort((a, b) => SEV[a.severity] - SEV[b.severity]);
  const count = (s) => flags.filter((f) => f.severity === s).length;
  return { schema: 'lccc.agents/2', mode: 'llm', model, runAt, trigger, now, kbVersion: kb.version, agents, flags,
    counts: { CRITICAL: count('CRITICAL'), HIGH: count('HIGH'), MEDIUM: count('MEDIUM'), LOW: count('LOW'), INFO: count('INFO') }, disclaimer: HUMAN_REVIEW };
}
