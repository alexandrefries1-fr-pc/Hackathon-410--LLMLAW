// Runs the engine and the five agents on a case folder and prints the agents' report (English).
// Usage: node scripts/run-agents.mjs [pieces|bundle] [YYYY-MM-DD] [--md out.md] [--daily YYYY-MM-DD] [--llm [model]] [--no-cache]
//   --llm   the agents are Mistral calls (local Ollama); without it, the deterministic tools only.
import fs from 'node:fs';
import path from 'node:path';
import { loadPdfjs } from './node-pdfjs.mjs';
import { analyzeCase } from '../engine/pipeline.js';
import { runAgents } from '../agents/agents.js';
import { runLlmAgents } from '../agents/llmAgents.js';
import { LegalRag } from '../agents/legalRag.js';
import { fmtDate } from '../engine/text.js';

const args = process.argv.slice(2);
const mode = args[0] || 'pieces';
const refDate = /^\d{4}-\d{2}-\d{2}$/.test(args[1] || '') ? args[1] : '2026-10-04';
const mdOut = args.includes('--md') ? args[args.indexOf('--md') + 1] : null;
const daily = args.includes('--daily') ? args[args.indexOf('--daily') + 1] : null;
const here = import.meta.dirname;
const root = path.resolve(here, '..', '..', 'dossier_fictif');
const files = (mode === 'bundle' ? [path.join(root, 'DOSSIER_COMPLET_Affaire_Martin_Dubois.pdf')]
  : fs.readdirSync(path.join(root, 'pieces')).filter((f) => f.endsWith('.pdf')).map((f) => path.join(root, 'pieces', f)))
  .map((p, i) => ({ fileId: `F${i + 1}`, name: path.basename(p), kind: 'pdf', data: new Uint8Array(fs.readFileSync(p)) }));
const read = (p) => JSON.parse(fs.readFileSync(path.resolve(here, '..', p), 'utf8'));
const kb = read('knowledge/legal_kb.json');
const pdfjs = await loadPdfjs();
const A = await analyzeCase({ files, pdfjs: pdfjs.lib, docOptions: pdfjs.docOptions, rules: read('rules/cpp_rules.json'), checklist: read('rules/checklist_homicide.json'), kb, refDate });
let R = A.agents;
const useLlm = args.includes('--llm') || args.includes('--cloud');
if (useLlm) {
  // --cloud [model]: Mistral API (key in MISTRAL_API_KEY) ; --llm [model]: Ollama on this computer
  const cloud = args.includes('--cloud');
  const flag = cloud ? '--cloud' : '--llm';
  const next = args[args.indexOf(flag) + 1];
  const model = next && !next.startsWith('--') ? next : cloud ? 'mistral-large-latest' : 'ministral-3:3b';
  const OLLAMA = 'http://127.0.0.1:11434';
  const cacheFile = path.resolve(here, '..', 'demo', 'llm-cache.json');
  const store = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
  const cache = args.includes('--no-cache') ? null : { get: (k) => store[k], set: (k, v) => { store[k] = v; fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(store, null, 1)); } };
  const chat = cloud ? async ({ model: m, messages, format }) => {
    if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY is not set');
    const t0 = Date.now();
    const call = (rf) => fetch('https://api.mistral.ai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      body: JSON.stringify({ model: m, messages, temperature: 0.1, max_tokens: 2500, response_format: rf }) });
    let r = await call({ type: 'json_schema', json_schema: { name: 'lccc_output', schema: format, strict: false } });
    if (r.status === 400) r = await call({ type: 'json_object' });
    if (!r.ok) throw new Error(`Mistral API ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    return { content: j.choices?.[0]?.message?.content ?? '', ms: Date.now() - t0 };
  } : async ({ model: m, messages, format }) => {
    const t0 = Date.now();
    const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: m, messages, format, stream: false, options: { temperature: 0.1, num_ctx: 8192, num_predict: 1400 }, keep_alive: '30m' }) });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return { content: j.message?.content ?? '', ms: Date.now() - t0 };
  };
  const run = (trigger, now, previous) => runLlmAgents(A, { kb, chat, model, trigger, now, previous, cache,
    onProgress: (id, s) => console.error(`[${new Date().toLocaleTimeString()}] ${id}: ${s}`) });
  R = await run('upload', refDate, null);
  if (daily) R = await run('daily', daily, R);
} else if (daily) R = runAgents(A, { kb, trigger: 'daily', now: daily, previous: R });

const L = [];
const out = (s = '') => L.push(s);
out(`# LCCC agents report`);
out(`Case analysed on ${fmtDate(refDate)}${daily ? ` · daily re-run on ${fmtDate(daily)}` : ''} · trigger: ${R.trigger} · knowledge base ${R.kbVersion} (${kb.entries.length} articles)`);
out(`Flags: ${Object.entries(R.counts).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}`);
out(`> ${R.disclaimer}`);
for (const a of R.agents) {
  out(`\n## ${a.name} (${a.triggers.join(' + ')}) · ${a.flags.length} flag(s) · ${a.ms} ms${a.escalated?.length ? ` · escalated since last run: ${a.escalated.join(', ')}` : ''}`);
  out(`_${a.purpose}_`);
  if (a.engine) out(`Engine: **${a.engine === 'llm' ? `Mistral (${a.model}), ${a.llm.cached ? 'cached result' : `${Math.round(a.llm.llmMs / 1000)} s`}` : `deterministic tools (fallback: ${a.llm?.error})`}**${a.llm?.lawConsulted ? ` · legal RAG: ${a.llm.lawConsulted.join(', ')}` : ''}`);
  if (a.llm?.summary) out(`> Agent summary: ${a.llm.summary}`);
  if (a.llm?.rejected?.length) out(`Rejected by validation: ${a.llm.rejected.map((r) => `"${r.title}" (${r.reason})`).join('; ')}`);
  for (const f of a.flags) {
    out(`\n- **[${f.severity}] ${f.title}** (${f.id}, ${f.category})${f.checks ? ` · quote ${f.checks.quoteVerified ? 'verified in the file' : 'not provided or not found'}` : ''}`);
    out(`  ${f.detail}`);
    if (f.actor?.who) out(`  - Who: ${f.actor.who}${f.actor.requestedBy ? ` · requested by: ${f.actor.requestedBy}` : ''}`);
    if (f.prosecutorAction) out(`  - For the prosecutor: ${f.prosecutorAction}`);
    if (f.risk) out(`  - Risk: ${f.risk}`);
    if (f.sources?.length) out(`  - Sources: ${f.sources.map((s) => `${s.docId} p.${s.page}`).join(', ')}`);
    if (f.legal?.length) out(`  - Law: ${f.legal.map((l) => `${l.article} (${l.verification})`).join('; ')}`);
  }
}
const prog = R.agents.find((a) => a.id === 'PROGRESS').data;
out('\n## Procedure checklist');
for (const p of prog.phases) { out(`\n**${p.name}**: ${p.reached ? `${p.percent}%` : 'not started'}`); for (const i of p.items) out(`- [${i.status === 'DONE' ? 'x' : ' '}] ${i.label} · ${i.status}${i.found.length ? ` (${i.found.join(', ')})` : ''}`); }
const dl = R.agents.find((a) => a.id === 'DEADLINE').data.deadlines;
out('\n## Deadline table');
out('| Scope | Deadline | Due | Status | Actor | Law |');
out('|---|---|---|---|---|---|');
for (const d of dl) out(`| ${d.scope} | ${d.title} | ${d.dueDate ? `${fmtDate(d.dueDate)} (${d.daysLeft} d)` : '-'} | ${d.status} | ${d.actor} | ${d.legal.map((l) => l.id).join(', ')} |`);
const rag = new LegalRag(kb);
out('\n## Legal RAG check');
for (const q of ['how long can police custody last for a murder', 'deadline to appeal to the court of cassation', 'is a personality inquiry mandatory', 'what happens if the chain of custody of seals is broken']) {
  out(`- "${q}" -> ${rag.retrieve(q, 2).map((r) => `${r.id} (${r.score})`).join(', ')}`);
}
const text = L.join('\n');
console.log(text);
if (mdOut) { fs.writeFileSync(mdOut, text); console.error(`\nReport written to ${mdOut}`); }
