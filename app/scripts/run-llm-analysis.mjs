// Full LLM analysis (document reader + case agents) from the command line.
// Usage: node scripts/run-llm-analysis.mjs [--cloud [model] | --llm [model]] [--docs D06,D09,C02] [--date YYYY-MM-DD] [--out file.json]
//   --cloud  Mistral API (key in MISTRAL_API_KEY) ; --llm  Ollama on this computer (default: ministral-3:3b)
import fs from 'node:fs';
import path from 'node:path';
import { loadPdfjs } from './node-pdfjs.mjs';
import { analyzeCase } from '../engine/pipeline.js';
import { analyzeWithLlm } from '../engine/llmPipeline.js';
import { fmtDate } from '../engine/text.js';

const args = process.argv.slice(2);
const opt = (k, d = null) => (args.includes(k) ? (args[args.indexOf(k) + 1] && !args[args.indexOf(k) + 1].startsWith('--') ? args[args.indexOf(k) + 1] : d) : null);
const cloud = args.includes('--cloud');
const model = (cloud ? opt('--cloud', 'mistral-large-latest') : opt('--llm', 'ministral-3:3b')) || (cloud ? 'mistral-large-latest' : 'ministral-3:3b');
const only = opt('--docs')?.split(',');
const refDate = opt('--date') || '2026-10-04';
const here = import.meta.dirname;
const dir = path.resolve(here, '..', '..', 'dossier_fictif', 'pieces');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf') && (!only || only.some((id) => f.startsWith(id + '_'))))
  .map((f, i) => ({ fileId: `F${i + 1}`, name: f, kind: 'pdf', data: new Uint8Array(fs.readFileSync(path.join(dir, f))) }));
const read = (p) => JSON.parse(fs.readFileSync(path.resolve(here, '..', p), 'utf8'));
const kb = read('knowledge/legal_kb.json');
const pdfjs = await loadPdfjs();
const base = await analyzeCase({ files, pdfjs: pdfjs.lib, docOptions: pdfjs.docOptions, rules: read('rules/cpp_rules.json'), checklist: read('rules/checklist_homicide.json'), refDate });

const cacheFile = path.resolve(here, '..', 'demo', 'llm-cache.json');
const store = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
const cache = { get: (k) => store[k], set: (k, v) => { store[k] = v; fs.writeFileSync(cacheFile, JSON.stringify(store, null, 1)); } };
const chat = cloud
  ? async ({ messages, format, maxTokens }) => {
    if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY is not set');
    const t0 = Date.now();
    const go = (rf) => fetch('https://api.mistral.ai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: maxTokens || 4000, response_format: rf }) });
    let r = await go({ type: 'json_schema', json_schema: { name: 'lccc_output', schema: format, strict: false } });
    if (r.status === 400) r = await go({ type: 'json_object' });
    if (!r.ok) throw new Error(`Mistral API ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    return { content: j.choices?.[0]?.message?.content ?? '', ms: Date.now() - t0, model };
  }
  : async ({ messages, format, numCtx, maxTokens }) => {
    const t0 = Date.now();
    // streamed: a non-streamed answer longer than 300 s hits Node's fetch headers timeout
    const r = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, format, stream: true, keep_alive: '30m', options: { temperature: 0.1, num_ctx: numCtx || 8192, num_predict: maxTokens || 2000 } }) });
    let full = '';
    for (const line of (await r.text()).split('\n')) {
      if (!line.trim()) continue;
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error);
      full += j.message?.content ?? '';
    }
    return { content: full, ms: Date.now() - t0, model };
  };

const A = await analyzeWithLlm(base, { llm: { chat, model, backend: cloud ? 'cloud' : 'local', concurrency: 4 }, kb, refDate, cache,
  onProgress: (p) => console.error(`[${new Date().toLocaleTimeString()}] ${p.step} ${p.status} ${p.detail || ''}`) });

const out = [];
const o = (s = '') => out.push(s);
o(`# LLM analysis · ${A.llm.backend} · ${A.llm.model} · ${A.llm.calls.length} calls · ${Math.round(A.llm.ms / 1000)} s`);
o(`Calls: ${A.llm.calls.map((c) => `${c.name} ${Math.round(c.ms / 1000)}s${c.cached ? ' (cache)' : ''}${c.error ? ` ERROR ${c.error}` : ''}`).join(' | ')}`);
o(`Quotes rejected by verification: ${A.llm.rejected.length}${A.llm.rejected.length ? ' · ' + A.llm.rejected.slice(0, 6).map((r) => `${r.where}: "${r.what}"`).join(' ; ') : ''}`);
o('\n## ✦ Documents');
for (const d of A.documents.filter((x) => x.llmSummary)) o(`- ${d.id} · ${d.type} · ${d.date || '-'} · ${d.usefulness}: ${d.llmSummary}`);
o('\n## ✦ Persons');
for (const p of A.persons) o(`- ${p.role} ${p.name} (${p.docs.join(', ')})`);
o('\n## ✦ Chronology');
for (const e of A.timeline.facts) o(`- ${e.date} ${e.timeLabel} [${e.category}${e.kind === 'CONFLICT' ? ', CONFLICT' : ''}] ${e.label} <${e.sources.map((s) => `${s.docId}${s.quote ? ' ✓quote' : ''}`).join(', ')}>`);
o('\n## ✦ Inconsistencies');
for (const c of A.contradictions) { o(`- ${c.id} [${c.level}] (${c.category}) ${c.title}`); o(`  ${c.summary}`); for (const s of c.sides) o(`  · ${s.label}: ${s.items.map((i) => `${i.docId} p.${i.page}${i.quote ? ' ✓' : ''}`).join(', ')}`); }
o('\n## ✦ Missing documents');
for (const m of A.missing) o(`- ${m.id} [${m.level}/${m.status}] ${m.label} · ${m.why} ${m.note ? `· ${m.note}` : ''}`);
if (A.progressLlm) o(`Progress: ${A.progressLlm.percent}% · ${A.progressLlm.current_stage} · next: ${(A.progressLlm.next_steps || []).join('; ')}`);
o('\n## ✦ Deadlines (⚙ calendar check)');
for (const d of A.deadlines) { o(`- ${d.id} [${d.priority}] ${d.kind} ${d.label} · due ${d.dueDate ? fmtDate(d.dueDate) : '-'} · ${d.ruleId || '-'}`); for (const s of d.steps) o(`    ${s}`); }
console.log(out.join('\n'));
const outFile = opt('--out');
if (outFile) fs.writeFileSync(outFile, JSON.stringify(A, null, 1));
