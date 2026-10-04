// Test de bout en bout du moteur sur le dossier fictif, sans Electron.
// Usage : node scripts/test-engine.mjs [bundle|pieces] [AAAA-MM-JJ]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPdfjs } from './node-pdfjs.mjs';
import { analyzeCase } from '../engine/pipeline.js';
import { fmtDate } from '../engine/text.js';

const mode = process.argv[2] || 'pieces';
const refDate = process.argv[3] || '2026-10-04';
const root = path.resolve(import.meta.dirname, '..', '..', 'dossier_fictif');
const files = (mode === 'bundle'
  ? [path.join(root, 'DOSSIER_COMPLET_Affaire_Martin_Dubois.pdf')]
  : fs.readdirSync(path.join(root, 'pieces')).filter((f) => f.endsWith('.pdf')).map((f) => path.join(root, 'pieces', f))
).map((p, i) => ({ fileId: `F${i + 1}`, name: path.basename(p), kind: 'pdf', data: new Uint8Array(fs.readFileSync(p)) }));

const pdfjs = await loadPdfjs();
const rules = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'rules', 'cpp_rules.json'), 'utf8'));
const checklist = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'rules', 'checklist_homicide.json'), 'utf8'));
const res = await analyzeCase({ files, pdfjs: pdfjs.lib, docOptions: pdfjs.docOptions, rules, checklist, refDate });

const out = (s = '') => console.log(s);
out(`# ${res.stats.files} fichiers · ${res.stats.documents} pièces · ${res.stats.pages} pages · ${res.stats.ms} ms · faits du ${res.factsDate} · réf. ${refDate}`);
out(JSON.stringify(res.stats.timings));
out('\n## Classification');
for (const d of res.documents) out(`${d.id.padEnd(5)} ${d.typeLabel.padEnd(44)} ${String(d.confidence).padEnd(5)} ${d.date ?? ''}`);
out('\n## Personnes');
for (const p of res.persons) out(`${p.role.padEnd(13)} ${p.name.padEnd(24)} ${p.mentionCount} mentions · ${p.docs.join(',')}`);
out('\n## Déclarations qualifiées');
for (const s of res.statements) out(`${s.docId} p${s.page} ${s.kind.padEnd(13)} spk=${s.speakerId} subj=${s.subjectId ?? ''} ${s.window ? `[${s.window.label}]` : ''}${s.at ? ` @${s.at.minutes}` : ''}${s.hedged ? ' (hésitant)' : ''} « ${s.quote.slice(0, 90)} »`);
out('\n## Chronologie des faits');
for (const e of res.timeline.facts) out(`${e.date} ${e.timeLabel.padEnd(14)} ${e.importance === 'key' ? '*' : ' '} [${e.kind}] ${e.label.slice(0, 110)}  <${e.sources.map((s) => s.docId + ' p' + s.page).join(', ')}> ${e.flags.join(',')}`);
out('\n## Incohérences');
for (const c of res.contradictions) { out(`${c.id} [${c.level}] (${c.category}) ${c.title}`); out(`   ${c.summary}`); for (const s of c.sides) out(`   - ${s.label}: ${s.items.map((i) => i.docId + ' p' + i.page).join(', ')}`); for (const n of c.notes || []) out(`   · ${n}`); }
out('\n## Pièces manquantes');
for (const m of res.missing) out(`${m.id} [${m.level}/${m.status}] ${m.label} (${m.basis.join('+')}) <${m.sources.map((s) => s.docId).join(',')}>\n   ${m.why}${m.note ? '\n   · ' + m.note : ''}`);
out('\n## Attendues et retrouvées');
for (const m of res.matched) out(`✓ ${m.label} : demandée ${m.requestedIn.join(',')} → ${m.foundIn.join(',')}`);
out('\n## Échéances et contrôles');
for (const d of res.deadlines) { out(`${d.kind.padEnd(9)} [${d.priority}] ${d.dueDate ? fmtDate(d.dueDate) : '—'} (${d.daysLeft ?? ''} j) ${d.label} · ${d.ruleId ?? ''}`); for (const s of d.steps) out(`      ${s}`); }
out('\n## Actions');
for (const a of res.actions) out(`${a.id} [${a.priority}] ${a.label}`);
out(`\n## Graphe : ${res.graph.nodes.length} nœuds, ${res.graph.edges.length} relations · ${res.chunks.length} passages indexés`);
if (res.log.length) out('\n## Journal\n' + res.log.join('\n'));
const dump = path.join(os.tmpdir(), 'lccc_analyse_test.json');
fs.writeFileSync(dump, JSON.stringify(res, null, 1));
out(`\nAnalyse complète (JSON) : ${dump}`);
