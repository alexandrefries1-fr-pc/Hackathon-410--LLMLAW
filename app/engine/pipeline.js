// Orchestrateur : Documents -> texte -> pièces -> classification -> extraction -> graphe -> détection -> règles -> actions.
// S'exécute entièrement en local (renderer Electron ou Node). Le LLM est optionnel et injecté.

import { extractPdf } from './pdftext.js';
import { segmentFiles } from './segment.js';
import { classifyDoc, typeLabel, DOC_TYPES } from './classify.js';
import {
  docMeta, extractPersons, finalizePersons, makeResolver, findDeponent, extractStatements, extractPhone, extractSeals,
  extractProcedural, extractCameras, extractValuables, extractExpectations,
} from './extract.js';
import { buildFactsTimeline, buildProcedureTimeline } from './timeline.js';
import { detectContradictions, detectMissing } from './detect.js';
import { evaluateRules } from './rules.js';
import { buildActions } from './actions.js';
import { buildGraph } from './graph.js';
import { buildChunks } from './search.js';
import { buildEvidence, neutralFindings, victimInfo } from './evidence.js';
import { runAgents } from '../agents/agents.js';

export const ENGINE_VERSION = '0.1.0';

export const STEPS = [
  ['extract', 'Extraction du texte (pdf.js, local)'],
  ['segment', 'Découpage du dossier en pièces (cotes)'],
  ['classify', 'Classification des pièces'],
  ['facts', 'Extraction structurée : personnes, déclarations, scellés, téléphonie, actes'],
  ['timeline', 'Construction des chronologies'],
  ['detect', 'Détection des incohérences et des pièces manquantes'],
  ['rules', 'Moteur de règles procédurales (échéances, contrôles)'],
  ['graph', 'Case Graph, actions et index de recherche'],
  ['agents', "Agents' tools (the Mistral agents follow in the background)"],
];

export async function analyzeCase({ files, pdfjs, docOptions = {}, rules, checklist, kb = null, refDate, onProgress = () => {}, llmClassify = null }) {
  const t0 = Date.now();
  const timings = {};
  const log = [];
  const step = async (id, fn) => {
    onProgress({ step: id, status: 'running' });
    const s = Date.now();
    const r = await fn();
    timings[id] = Date.now() - s;
    onProgress({ step: id, status: 'done', ms: timings[id] });
    return r;
  };

  // 1. Texte
  const extracted = await step('extract', async () => {
    const out = [];
    for (const f of files) {
      onProgress({ step: 'extract', status: 'running', detail: f.name });
      if (f.kind === 'pdf') out.push({ fileId: f.fileId, name: f.name, pages: await extractPdf(pdfjs, f.data.slice ? f.data.slice() : f.data, docOptions) });
      else if (f.kind === 'text') out.push({ fileId: f.fileId, name: f.name, pages: textPages(f.text) });
      else { out.push({ fileId: f.fileId, name: f.name, pages: [{ n: 1, lines: [`[Image ${f.name} : texte non extrait, OCR non activé dans le prototype]`], margin: [], text: '' }] }); log.push(`Image non analysée : ${f.name}`); }
    }
    return out;
  });
  const pageCount = extracted.reduce((a, f) => a + f.pages.length, 0);

  // 2. Pièces
  const docs = await step('segment', () => segmentFiles(extracted, (m) => log.push(m)));

  // 3. Classification
  const classes = await step('classify', async () => {
    const res = {};
    for (const d of docs) {
      let c = classifyDoc(d);
      if (c.type === 'AUTRE' && llmClassify) {
        try {
          const l = await llmClassify(d, Object.keys(DOC_TYPES));
          if (l?.type && DOC_TYPES[l.type]) c = { type: l.type, confidence: l.confidence ?? 0.6, method: 'Mistral (local)', candidates: c.candidates };
        } catch (e) { log.push(`Classification LLM indisponible : ${e.message}`); }
      }
      res[d.id] = c;
    }
    return res;
  });
  const types = Object.fromEntries(Object.entries(classes).map(([k, v]) => [k, v.type]));
  const analysable = docs.filter((d) => types[d.id] !== 'INVENTAIRE');

  // 4. Extraction structurée
  const facts = await step('facts', () => {
    const metas = Object.fromEntries(docs.map((d) => [d.id, docMeta(d)]));
    const pmap = extractPersons(analysable);
    const resolve = makeResolver(pmap);
    const deponents = {};
    for (const d of analysable) {
      const dep = findDeponent(d, types[d.id], resolve);
      if (dep) deponents[d.id] = dep;
    }
    const persons = finalizePersons(pmap, deponents);
    const statements = analysable.flatMap((d) => extractStatements(d, types[d.id], deponents[d.id], resolve, pmap));
    const phone = analysable.filter((d) => types[d.id] === 'TELEPHONIE').map((d) => extractPhone(d, resolve));
    const seals = analysable.flatMap((d) => extractSeals(d));
    const procedural = extractProcedural(analysable, types, metas);
    const cams = extractCameras(analysable, types);
    const valuables = extractValuables(analysable, types);
    const expectations = extractExpectations(analysable, types);
    return { metas, persons, deponents, statements, phone, seals, procedural, cams, valuables, expectations };
  });
  const personsById = Object.fromEntries(facts.persons.map((p) => [p.id, p]));
  const factsDate = guessFactsDate(analysable, types, facts.metas);
  refDate = refDate || new Date().toISOString().slice(0, 10);

  // 5. Chronologies
  const timeline = await step('timeline', () => ({
    facts: buildFactsTimeline({ docs: analysable, types, metas: facts.metas, statements: facts.statements, phone: facts.phone, factsDate, personsById, deponents: facts.deponents }),
    procedure: buildProcedureTimeline({ docs: analysable, types, metas: facts.metas, procedural: facts.procedural }),
  }));

  // 6. Détection
  const detection = await step('detect', () => {
    const contradictions = detectContradictions({ statements: facts.statements, phone: facts.phone, events: timeline.facts, seals: facts.seals, personsById, factsDate, types });
    const m = detectMissing({ docs: analysable, types, expectations: facts.expectations, cameras: facts.cams.cameras, generic: facts.cams.generic, valuables: facts.valuables,
      checklist, procedural: facts.procedural, refDate, contradictions, factsDate });
    // marque les événements concernés par une incohérence
    for (const c of contradictions) {
      const ids = new Set(c.sides.flatMap((s) => s.items.map((i) => i.docId + '|' + i.page)));
      for (const e of timeline.facts) if (e.sources.some((s) => ids.has(s.docId + '|' + s.page) && c.sides.some((sd) => sd.items.some((it) => it.quote === s.quote || it.quote.includes(s.quote) || s.quote.includes(it.quote))))) e.flags.push(c.id);
    }
    return { contradictions, ...m };
  });

  // 7. Règles
  const deadlines = await step('rules', () => evaluateRules(rules, { ...facts.procedural, cameras: facts.cams.cameras, factsDate }, refDate));

  // 8. Graphe, actions, index
  const { graph, actions, chunks, evidence, neutral, victim } = await step('graph', () => ({
    graph: buildGraph({ persons: facts.persons, statements: facts.statements, phone: facts.phone, seals: facts.seals, contradictions: detection.contradictions, missing: detection.missing, events: timeline.facts, docs: analysable, types }),
    actions: buildActions({ deadlines, missing: detection.missing, contradictions: detection.contradictions }),
    chunks: buildChunks(analysable),
    evidence: buildEvidence({ seals: facts.seals, docs: analysable, types, missing: detection.missing, contradictions: detection.contradictions }),
    neutral: neutralFindings(analysable, types),
    victim: victimInfo(analysable, types, facts.persons.find((p) => p.role === 'VICTIME')),
  }));

  const documents = docs.map((d) => ({
    id: d.id, cote: d.cote, fileId: d.fileId, fileName: d.fileName, pageCount: d.pages.length, filePages: d.pages.map((p) => p.filePage),
    type: types[d.id], typeLabel: typeLabel(types[d.id]), family: DOC_TYPES[types[d.id]]?.family, confidence: classes[d.id].confidence, method: classes[d.id].method,
    candidates: classes[d.id].candidates, date: facts.metas[d.id]?.date, author: facts.metas[d.id]?.author, subtitle: facts.metas[d.id]?.subtitle,
    pages: d.pages.map((p) => ({ n: p.n, filePage: p.filePage, text: p.text })),
  }));

  const result = {
    schema: 'lccc.analysis/1', engine: ENGINE_VERSION, analyzedAt: new Date().toISOString(), refDate, factsDate,
    stats: { files: files.length, documents: docs.length, pages: pageCount, statements: facts.statements.length, phoneRows: facts.phone.reduce((a, p) => a + p.rows.length, 0), ms: Date.now() - t0, timings },
    documents, persons: facts.persons, deponents: facts.deponents, statements: facts.statements, seals: facts.seals,
    phone: facts.phone.map((p) => ({ ...p, rows: p.rows.filter((r) => r.date >= addDaysIso(factsDate, -1) && r.date <= addDaysIso(factsDate, 1)), totalRows: p.rows.length })),
    procedural: facts.procedural, cameras: facts.cams.cameras, valuables: facts.valuables,
    timeline, contradictions: detection.contradictions, missing: detection.missing, matched: detection.matched, checklist: detection.checklist,
    deadlines, actions, graph, chunks, log, evidence, neutral, victim,
    rulesMeta: { name: rules.name, version: rules.version, disclaimer: rules.disclaimer, computation: rules.computation, rules: rules.rules.map((r) => ({ id: r.id, title: r.title, basis: r.basis, summary: r.summary, kind: r.kind })) },
    checklistMeta: { name: checklist.name, version: checklist.version },
  };
  // Agents: deployed on every upload (the deadline agent is also re-run daily by the app)
  if (kb) {
    onProgress({ step: 'agents', status: 'running' });
    const t = Date.now();
    result.agents = runAgents(result, { kb, trigger: 'upload', now: refDate });
    result.stats.timings.agents = Date.now() - t;
    onProgress({ step: 'agents', status: 'done', ms: Date.now() - t });
  }
  return result;
}

function textPages(text) {
  const parts = String(text).split(/\f/);
  return parts.map((t, i) => ({ n: i + 1, lines: t.split(/\r?\n/).filter((l) => l.trim()), margin: [], text: t }));
}

function guessFactsDate(docs, types, metas) {
  for (const t of ['FICHE_CIC', 'PV_INTERVENTION', 'PV_CONSTATATIONS']) {
    const d = docs.find((x) => types[x.id] === t && metas[x.id]?.date);
    if (d) return metas[d.id].date;
  }
  const dates = docs.map((d) => metas[d.id]?.date).filter(Boolean).sort();
  return dates[0] || new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
