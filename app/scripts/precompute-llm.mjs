// Pré-calcule, avec le Mistral local, les lectures d'incohérences et les réponses aux questions suggérées
// de la démonstration, et les enregistre dans app/demo/llm-cache.json (clé = empreinte du prompt).
// L'application utilise ce cache si la même requête est rejouée : la démo reste fluide sur une machine lente.
// Usage : node scripts/precompute-llm.mjs [modele]   (par défaut : ministral-3:3b)
import fs from 'node:fs';
import path from 'node:path';
import { loadPdfjs } from './node-pdfjs.mjs';
import { analyzeCase } from '../engine/pipeline.js';
import { Bm25, askPassages } from '../engine/search.js';
import { explainPrompt, askPrompt, EXPLAIN_SCHEMA, promptKey } from '../engine/llm.js';

const model = process.argv[2] || 'ministral-3:3b';
const OLLAMA = process.env.LCCC_OLLAMA || 'http://127.0.0.1:11434';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(OLLAMA)) throw new Error('Seul un Ollama local est autorisé.');
const here = import.meta.dirname;
const root = path.resolve(here, '..', '..', 'dossier_fictif', 'pieces');
const out = path.resolve(here, '..', 'demo', 'llm-cache.json');
const QUESTIONS = ['Où se trouvait M. DUBOIS entre 22h et 23h selon les pièces ?', 'Qui a entendu ou vu quelque chose entre 22h et 22h45 ?',
  'Quelles expertises ont été demandées et lesquelles ont abouti ?', 'Que sait-on de la caméra du hall ?'];

const files = fs.readdirSync(root).filter((f) => f.endsWith('.pdf')).map((f, i) => ({ fileId: `F${i + 1}`, name: f, kind: 'pdf', data: new Uint8Array(fs.readFileSync(path.join(root, f))) }));
const pdfjs = await loadPdfjs();
const rules = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'rules', 'cpp_rules.json'), 'utf8'));
const checklist = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'rules', 'checklist_homicide.json'), 'utf8'));
const res = await analyzeCase({ files, pdfjs: pdfjs.lib, docOptions: pdfjs.docOptions, rules, checklist, refDate: '2026-10-04' });
const cache = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};

const used = new Set();
async function run(label, messages, format) {
  const key = await promptKey(model, messages, format);
  used.add(key);
  if (cache[key]) { console.log(`= ${label} (déjà en cache)`); return; }
  const t0 = Date.now();
  const body = { model, messages, stream: false, options: { temperature: 0.1, num_ctx: 8192 }, keep_alive: '30m' };
  if (format) body.format = format;
  const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const j = await r.json();
  cache[key] = { content: j.message?.content ?? '', ms: Date.now() - t0, model, at: new Date().toISOString(), label };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(cache, null, 1));
  console.log(`+ ${label} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

for (const c of res.contradictions) await run(`${c.id} ${c.title}`, explainPrompt(c), EXPLAIN_SCHEMA);
const bm = new Bm25(res.chunks);
const label = (id) => res.documents.find((d) => d.id === id)?.typeLabel;
for (const q of QUESTIONS) await run(q, askPrompt(q, askPassages(res, bm, q).map((p) => ({ ...p, typeLabel: label(p.docId) }))));
// Purge des entrées devenues obsolètes pour ce modèle (prompts modifiés depuis)
for (const [k, v] of Object.entries(cache)) if (v.model === model && !used.has(k)) delete cache[k];
fs.writeFileSync(out, JSON.stringify(cache, null, 1));
console.log(`Cache : ${Object.keys(cache).length} entrées -> ${out}`);
