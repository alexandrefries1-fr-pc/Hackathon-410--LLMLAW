// LCCC agents: five specialised agents that run on every upload (and daily for deadlines).
// Each agent reads the structured case analysis produced by the engine, consults the legal
// knowledge base through the local RAG, and returns FLAGS: indications for human review,
// never conclusions on guilt, credibility or the outcome of the case.
//
//   Document agent       missing referenced documents (and who must send them), missing necessary documents, dependencies
//   Deadline agent       global and individual deadlines, with the actor, the article and the source document
//   Quality agent        useful / low-value reports and images, data-quality issues
//   Inconsistency agent  contradictions between documents + procedural-defect risks
//   Progress agent       procedure x documents checklist, % completion per phase

import { addDays, addMonths, daysBetween, dayName, art801 } from '../engine/rules.js';
import { fmtDate, fmtTime, clip } from '../engine/text.js';
import { LegalRag } from './legalRag.js';

export const DOC_TYPE_EN = {
  FICHE_CIC: 'Control-room intervention log', PV_INTERVENTION: 'Patrol intervention report', PV_CONSTATATIONS: 'Scene examination report', PLANCHE_PHOTO: 'Photo board and scene plan',
  AUDITION_TEMOIN: 'Witness hearing', AUDITION_GAV: 'Suspect hearing in custody', PV_GAV: 'Arrest and custody notification', PROLONGATION_GAV: 'Custody extension authorisation',
  PERQUISITION: 'Search and seizure report', AUTOPSIE: 'Autopsy report', VIDEO: 'CCTV exploitation report', TELEPHONIE: 'Telephone records (operator)',
  RAPPORT_TRACES: 'Footprint comparison report', RAPPORT_LABO: 'Forensic laboratory report', TRANSMISSION_SCELLE: 'Exhibit transmission report', REQUISITOIRE: 'Introductory submission',
  IPC: 'First appearance before the judge', COMMISSION_ROGATOIRE: 'Rogatory commission', ORDONNANCE_EXPERTISE: 'Expert appointment order', SYNTHESE: 'Investigation summary report',
  MAIN_COURANTE: 'Prior police log entry', ORDONNANCE_DETENTION: 'Pre-trial detention order', DML: 'Request for release', DEMANDE_ACTES: 'Defence request for investigative acts',
  INVENTAIRE: 'Inventory of documents', AUTRE: 'Unclassified document',
};

const SEV = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
const LEVEL_SEV = { CRITIQUE: 'CRITICAL', IMPORTANT: 'HIGH', A_VERIFIER: 'MEDIUM', SUIVI: 'LOW', FORTE: 'HIGH' };
export const HUMAN_REVIEW = 'Indication for human review only: no conclusion on guilt, credibility or the outcome of the case.';

const docName = (A, id) => `${id} (${DOC_TYPE_EN[A.documents.find((d) => d.id === id)?.type] || 'document'})`;
const personName = (A, role) => A.persons.find((p) => p.role === role)?.name;
const src = (s) => s && ({ docId: s.docId, page: s.page || 1, quote: s.quote || '' });
const absMin = (x) => Date.UTC(...x.date.split('-').map((v, i) => (i === 1 ? +v - 1 : +v))) / 60000 + x.minutes;
const fromAbs = (t) => ({ date: new Date(Math.floor(t / 1440) * 86400000 + 43200000).toISOString().slice(0, 10), minutes: ((t % 1440) + 1440) % 1440 });
const at = (x) => `${fmtDate(x.date)} ${fmtTime(x.minutes).replace('h', ':')}`;
const daysSev = (d, monitorOnly = false) => {
  const s = d == null ? 'INFO' : d < 0 || d <= 3 ? 'CRITICAL' : d <= 10 ? 'HIGH' : d <= 30 ? 'MEDIUM' : 'LOW';
  return monitorOnly && s === 'CRITICAL' ? 'HIGH' : s;
};
const whenText = (d) => (d == null ? '' : d < 0 ? `overdue by ${-d} day(s)` : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);

function flagFactory(agentId) {
  let n = 0;
  return (o) => ({ id: `${agentId}-${String(++n).padStart(2, '0')}`, agent: agentId, status: 'OPEN', severity: 'MEDIUM', sources: [], legal: [], ...o });
}

// =====================================================================================
// 1. Document agent
// =====================================================================================
const MISSING_EN = {
  EXTRACTION_TEL: ['Phone extraction report referenced but missing', ['CPP-60-1', 'CPP-156'], ['RAPPORT_EXTRACTION_TEL']],
  TOXICO: ['Toxicology results announced but missing', ['CPP-230-28', 'CPP-156'], ['RAPPORT_TOXICO']],
  GENETIQUE: ['DNA expert report pending', ['CPP-156', 'CPP-167'], ['EXPERTISE_GENETIQUE']],
  CASIER: ['Criminal record (bulletin no.1) requested but not received', ['CP-132-8'], ['CASIER_B1']],
  PERSONNALITE: ['Mandatory personality inquiry not yet in the file', ['CPP-81'], ['ENQUETE_PERSONNALITE']],
  CAMERA: ['Building-hall CCTV mentioned once and never requisitioned', ['CPP-60-1', 'CPP-81'], []],
  BIENS: ["Victim's belongings (watch, cash) not located", ['CPP-81', 'CP-221-2'], []],
};

function responsibleFor(m, A) {
  const q = (m.sources || []).map((s) => s.quote).join(' ');
  const order = A.documents.find((d) => d.type === 'ORDONNANCE_EXPERTISE');
  const expert = order && A.persons.find((p) => p.role === 'EXPERT' && p.docs.includes(order.id));
  switch (m.kind) {
    case 'EXTRACTION_TEL': return { producer: /SNPS|national de police scientifique/i.test(q) ? 'National Forensic Science Service (SNPS), digital unit' : 'Digital forensics unit', requestedBy: 'Investigators acting under the rogatory commission', prosecutorAction: 'Ask the investigating judge to have the forensic unit chased; the report conditions an open inconsistency.' };
    case 'TOXICO': return { producer: 'Hospital toxicology laboratory (samples sent by the forensic pathologist)', requestedBy: 'Forensic pathologist, at the autopsy', prosecutorAction: 'Ask the investigators or the pathologist for the supplementary toxicology report.' };
    case 'GENETIQUE': return { producer: expert ? `Appointed DNA expert: ${expert.name}` : 'Appointed DNA expert', requestedBy: 'Investigating judge (expert appointment order)', prosecutorAction: 'Monitor the deadline set in the appointment order; no action before it expires.' };
    case 'CASIER': return { producer: 'National Criminal Records Office (bulletin no.1)', requestedBy: 'Investigators', prosecutorAction: 'The prosecution office can obtain bulletin no.1 directly; it is needed to assess legal recidivism.' };
    case 'PERSONNALITE': return { producer: 'Investigator or social inquirer appointed by the investigating judge', requestedBy: 'Requested in the introductory submission', prosecutorAction: 'Ask the investigating judge to order it: mandatory in felony cases (Art. 81).' };
    case 'CAMERA': return { producer: 'Building manager (syndic) holding the recordings', requestedBy: 'Not requested in any document', prosecutorAction: 'Ask for an immediate requisition and seizure of the recordings before they are overwritten.' };
    case 'BIENS': return { producer: 'Investigators', requestedBy: 'Not requested in any document', prosecutorAction: 'Ask investigators to trace the watch and cash (relevant for and against the suspect, and for a possible Art. 221-2 qualification).' };
    default: return { producer: 'To be identified', requestedBy: '-', prosecutorAction: 'Check with the investigating judge.' };
  }
}

const DocumentAgent = {
  id: 'DOC', name: 'Document agent', triggers: ['upload'],
  purpose: 'Finds documents referenced but missing (and who must send them), documents required at each procedural stage, and dependencies between documents.',
  run(A, { rag }) {
    const F = flagFactory('DOC');
    const flags = [];
    const present = new Set(A.documents.map((d) => d.type));
    const covered = new Set();
    // 1) Referenced but missing
    for (const m of A.missing) {
      const def = MISSING_EN[m.kind];
      if (!def) continue;
      def[2].forEach((t) => covered.add(t));
      const r = responsibleFor(m, A);
      const pending = m.status === 'EN_ATTENTE';
      const first = m.sources[0];
      flags.push(F({
        category: m.kind === 'CAMERA' || m.kind === 'BIENS' ? 'MENTIONED_NOT_FOLLOWED_UP' : pending ? 'PENDING_RESULT' : 'REFERENCED_MISSING',
        severity: pending ? 'LOW' : LEVEL_SEV[m.level] || 'MEDIUM',
        title: def[0],
        detail: `${first ? `Referenced in ${docName(A, first.docId)}. ` : ''}${pending ? `Report due before ${fmtDate(m.deadline)}: deadline not expired.` : 'No corresponding document was found among the uploaded files.'}${m.linked?.length ? ` Needed to resolve ${m.linked.join(', ')}.` : ''}`,
        actor: { who: r.producer, requestedBy: r.requestedBy }, prosecutorAction: r.prosecutorAction,
        sources: m.sources.slice(0, 4).map(src), legal: rag.ground(def[1], def[0], 3),
      }));
    }
    // 2) Necessary documents per procedural stage (knowledge base)
    const reached = new Set(rag.kb.stages.filter((st) => st.items.some((it) => it.docTypes.some((t) => present.has(t)))).map((st) => st.id));
    const necessary = [];
    for (const st of rag.kb.stages) {
      if (!reached.has(st.id)) continue;
      for (const it of st.items) {
        if (it.later || it.docTypes.some((t) => present.has(t))) continue;
        necessary.push({ stage: st.id, ...it });
        if (it.docTypes.some((t) => covered.has(t))) continue;
        flags.push(F({
          category: 'NECESSARY_MISSING', severity: it.required ? 'HIGH' : 'LOW',
          title: `${it.required ? 'Required' : 'Recommended'} at this stage: ${it.label}`,
          detail: `${st.name}: no such document in the file. Normally produced by: ${it.producedBy}.`,
          actor: { who: it.producedBy }, prosecutorAction: it.required ? 'Request it from the investigating judge.' : 'Consider requesting it.',
          legal: rag.ground([it.legal], it.label, 2),
        }));
      }
    }
    // 3) Dependencies
    const deps = [];
    for (const m of A.missing) for (const l of m.linked || []) deps.push({ from: MISSING_EN[m.kind]?.[0] || m.label, to: `resolving ${l}`, reason: `${l} cannot be resolved without this document.` });
    for (const e of A.evidence || []) {
      if (e.conflicts.length && e.pending.length) deps.push({ from: `${e.conflicts.join(', ')} (seal numbering)`, to: `expert results on the ${OBJ_EN[e.object] || e.label.toLowerCase()}`, reason: 'Results cannot be safely attributed to the exhibit until the seal-number discrepancy is explained.' });
    }
    const custodyIssue = A.deadlines.find((d) => d.kind === 'CONTROLE' && d.priority === 'A_VERIFIER');
    if (custodyIssue) {
      const custodyDocs = A.documents.filter((d) => ['AUDITION_GAV', 'PV_GAV', 'PERQUISITION'].includes(d.type)).map((d) => d.id);
      deps.push({ from: 'Regularity of the police custody', to: `acts carried out during custody (${custodyDocs.join(', ')})`, reason: 'If the custody is annulled, acts carried out during it (suspect hearings, search, buccal DNA sample) may fall with it.' });
    }
    const blockers = flags.filter((f) => ['REFERENCED_MISSING', 'PENDING_RESULT', 'NECESSARY_MISSING'].includes(f.category) && f.severity !== 'LOW' || f.category === 'PENDING_RESULT');
    if (blockers.length) deps.push({ from: blockers.map((b) => b.title).join(' ; '), to: 'Notice of end of investigation (Art. 175)', reason: 'The investigation should not be closed while these documents are outstanding.' });
    deps.forEach((d) => flags.push(F({ category: 'DEPENDENCY', severity: 'MEDIUM', title: `Dependency: ${d.to.charAt(0).toUpperCase() + d.to.slice(1)}`, detail: `${d.reason} Depends on: ${d.from}.`, legal: rag.ground(d.to.includes('175') ? ['CPP-175'] : d.from.startsWith('Regularity') ? ['CPP-171', 'CPP-173-1'] : [], d.reason, 2) })));
    return { flags, data: { necessary, dependencies: deps } };
  },
};

// =====================================================================================
// 2. Deadline agent (global = whole procedure, individual = one document / one actor)
// =====================================================================================
const RULE_EN = {
  'CPP-148-A': { title: 'Release request: judge must forward it to the JLD', actor: 'Investigating judge', role: 'ACT', action: 'The file is communicated to you for submissions: file written submissions now; the judge must then forward the request to the JLD by this date.', legal: ['CPP-148', 'CPP-801'] },
  'CPP-148-B': { title: 'Release request: JLD decision', actor: 'Liberty and detention judge (JLD)', role: 'MONITOR', action: 'Check that the JLD rules within 3 working days of the referral (latest date if referred on the last possible day).', legal: ['CPP-148', 'CPP-801'] },
  'CPP-82-1': { title: "Defence request for acts: judge's answer", actor: 'Investigating judge', role: 'MONITOR', action: 'Check that the judge grants the request or issues a reasoned refusal order.', legal: ['CPP-82-1', 'CPP-801'] },
  'TECH-VID-01': { title: 'Private CCTV recordings may be overwritten', actor: 'Investigators, on instruction', role: 'ACT', action: 'Ask for the recordings to be requisitioned and seized before this date (irreversible loss of evidence).', legal: ['CPP-60-1'] },
};

const DeadlineAgent = {
  id: 'DEADLINE', name: 'Deadline agent', triggers: ['upload', 'daily'],
  purpose: 'Computes global and individual deadlines from the documents and the Code of Criminal Procedure, with the actor responsible and the source document. Re-runs every day.',
  run(A, { rag, now }) {
    const F = flagFactory('DL');
    const items = [];
    const doc = (t) => A.documents.find((d) => d.type === t);
    const allText = A.documents.map((d) => d.pages.map((p) => p.text).join(' ')).join(' ');
    const add = (o) => {
      const daysLeft = o.dueDate ? daysBetween(now, o.dueDate) : null;
      items.push({ ...o, daysLeft, severity: o.severity || (o.status === 'NOT_YET_TRIGGERED' || o.status === 'MET' ? 'INFO' : daysSev(daysLeft, o.role === 'MONITOR')) });
    };

    // ---- Global ----
    const req = doc('REQUISITOIRE');
    const fl8 = addDays(A.factsDate, 8), fl16 = addDays(A.factsDate, 16);
    add({ scope: 'GLOBAL', key: 'flagrance', title: 'Flagrance investigation window (8 days, extendable to 16)', dueDate: req?.date && req.date <= fl8 ? null : fl8,
      status: req?.date && req.date <= fl8 ? 'MET' : 'UPCOMING', actor: 'Public Prosecutor (directs the judicial police)', role: 'ACT',
      detail: req?.date ? `Facts on ${fmtDate(A.factsDate)}; flagrance ends ${fmtDate(fl8)} (or ${fmtDate(fl16)} if extended). A judicial investigation was opened on ${fmtDate(req.date)}, within the window.` : `Flagrance ends ${fmtDate(fl8)} (or ${fmtDate(fl16)} if extended by the prosecutor).`,
      sources: req ? [{ docId: req.id, page: 1, quote: '' }] : [], legal: ['CPP-53', 'CPP-74'] });

    const g = A.procedural.gav || {};
    if (g.interpellation || g.declaredStart) {
      const start = g.interpellation || g.declaredStart;
      const exp24 = fromAbs(absMin(start) + 24 * 60), exp48 = fromAbs(absMin(start) + 48 * 60);
      const issues = [];
      if (g.interpellation && g.declaredStart && absMin(g.declaredStart) > absMin(g.interpellation)) issues.push(`start time recorded at ${at(g.declaredStart)} although the person was apprehended at ${at(g.interpellation)} (${absMin(g.declaredStart) - absMin(g.interpellation)} min later)`);
      if (g.prolongation && absMin(g.prolongation) > absMin(exp24)) issues.push(`extension authorised at ${at(g.prolongation)}, ${absMin(g.prolongation) - absMin(exp24)} min after the 24-hour limit counted from apprehension (${at(exp24)})`);
      const total = g.end ? absMin(g.end) - absMin(start) : null;
      const organised = /bande organis|organised gang/i.test(allText);
      add({ scope: 'GLOBAL', key: 'custody', title: 'Police custody: 24 h + 24 h ceiling', status: issues.length ? 'TO_CHECK' : 'MET', severity: issues.length ? 'HIGH' : 'INFO', actor: 'Judicial police officer, under your control', role: 'ACT',
        detail: `Apprehension ${at(start)}; 48-hour ceiling ${at(exp48)}.${total != null ? ` Custody ended ${at(g.end)} after ${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}: within 48 h.` : ''}${issues.length ? ' Points to check: ' + issues.join('; ') + '.' : ''} ${organised ? 'Organised-gang elements found: check whether the 96-hour regime was used lawfully.' : 'No organised-gang element in the file: the 96-hour regime (Art. 706-88) does not apply.'}`,
        sources: [g.interpellation?.src, g.declaredStart?.src, g.prolongation?.src, g.end?.src].filter(Boolean).map(src), legal: ['CPP-63', 'CPP-706-88', 'CPP-171'] });
    }

    const det = A.procedural.detention;
    if (det) {
      const initial = addMonths(det.date, 12);
      const heavy = /221-1|221-3|meurtre|murder/i.test(allText);
      const ceiling = addMonths(det.date, heavy ? 36 : 24);
      add({ scope: 'GLOBAL', key: 'detention', title: 'Pre-trial detention: initial one-year term', dueDate: initial, status: 'UPCOMING', actor: 'JLD, on referral by the investigating judge', role: 'ACT',
        detail: `Detention ordered on ${fmtDate(det.date)}. Initial term ends ${fmtDate(initial)}; extensions of up to 6 months require a reasoned order before expiry. Absolute ceiling: ${fmtDate(ceiling)} (${heavy ? '3 years, sentence incurred of 20 years or more' : '2 years'}). File your submissions on any extension well before the term.`,
        sources: [src(det.src)], legal: ['CPP-145-2', 'CPP-144'] });
    }

    const ipc = doc('IPC');
    if (ipc?.date) {
      const n6 = addMonths(ipc.date, 6), n4 = addMonths(ipc.date, 4);
      add({ scope: 'GLOBAL', key: 'nullity', title: 'Window for defence nullity requests (Art. 173-1)', dueDate: n6, status: 'UPCOMING', actor: 'Defence (you monitor the risk)', role: 'MONITOR',
        detail: `Placed under formal investigation on ${fmtDate(ipc.date)}: nullities of earlier acts (custody, search) can be raised until ${fmtDate(n6)} (${fmtDate(n4)} under the 4-month rule of the 2026 reform, date of entry into force to check).`,
        sources: [{ docId: ipc.id, page: 1, quote: '' }], legal: ['CPP-173-1', 'CPP-171'] });
      const w = addMonths(ipc.date, 4);
      add({ scope: 'GLOBAL', key: 'interrogation', title: 'Right to demand an interrogation after 4 months without appearance', dueDate: w, status: 'UPCOMING', severity: 'LOW', actor: 'Investigating judge (on written demand of the defence)', role: 'MONITOR',
        detail: `Last appearance: ${fmtDate(ipc.date)}. From ${fmtDate(w)}, the person may demand an interrogation; the judge must then carry it out within 30 days of receipt.`,
        sources: [{ docId: ipc.id, page: 1, quote: '' }], legal: ['CPP-82-1'] });
    }
    add({ scope: 'GLOBAL', key: 'end', title: 'End-of-investigation submissions (Art. 175)', status: 'NOT_YET_TRIGGERED', actor: 'Public Prosecutor, defence, civil parties', role: 'ACT',
      detail: 'Not triggered: no notice of end of investigation in the file. Once notified: 1 month for submissions (a person is detained), 3 months otherwise.', legal: ['CPP-175'] });
    add({ scope: 'GLOBAL', key: 'appeal', title: 'Appeals after the Assize verdict', status: 'NOT_YET_TRIGGERED', actor: 'Prosecution, defence, civil party', role: 'ACT',
      detail: 'Not triggered (no verdict yet). Appeal: 10 days from the verdict (Art. 380-9). Cassation: 5 clear days (Art. 568).', legal: ['CPP-380-9', 'CPP-568'] });

    // ---- Individual (one document, one actor) ----
    for (const d of A.deadlines) {
      if (d.kind === 'CONTROLE' || d.ruleId === 'CPP-145-2') continue;
      if (d.kind === 'CALCULEE' && RULE_EN[d.ruleId]) {
        const r = RULE_EN[d.ruleId];
        add({ scope: 'INDIVIDUAL', key: d.id, title: r.title, dueDate: d.dueDate, status: 'UPCOMING', actor: r.actor, role: r.role, detail: `${r.action} Computed: ${d.steps.length} steps (Art. 801 applied).`, computation: d.steps, sources: (d.sources || []).filter(Boolean).map(src), legal: r.legal });
      }
      if (d.kind === 'EXTRAITE') {
        const exp = A.documents.find((x) => x.id === d.sources?.[0]?.docId)?.type === 'ORDONNANCE_EXPERTISE';
        add({ scope: 'INDIVIDUAL', key: d.id, title: exp ? 'Expert report due (date written in the appointment order)' : 'Rogatory commission to be returned (date written in the order)', dueDate: d.dueDate, status: 'UPCOMING', role: 'MONITOR',
          actor: exp ? 'Appointed expert' : 'Investigators', detail: 'Date found in a document (no rule applied).', sources: (d.sources || []).map(src), legal: exp ? ['CPP-156'] : ['CPP-81'] });
      }
    }
    const aut = doc('AUTOPSIE');
    const autDate = aut && /Autopsie\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(aut.pages.map((p) => p.text).join(' '));
    if (autDate) {
      const iso = `${autDate[3]}-${autDate[2]}-${autDate[1]}`;
      add({ scope: 'INDIVIDUAL', key: 'body', title: 'Return of the body to the family (1 month after the autopsy)', dueDate: addMonths(iso, 1), status: 'UPCOMING', actor: 'Public Prosecutor / investigating judge', role: 'ACT',
        detail: `Autopsy on ${fmtDate(iso)}. Since the July 2026 reform, the body is in principle returned within one month unless the investigation requires otherwise: decide, or record the reasons for keeping it.`,
        sources: [{ docId: aut.id, page: 1, quote: '' }], legal: ['CPP-230-28'] });
    }

    items.sort((a, b) => SEV[a.severity] - SEV[b.severity] || (a.dueDate || '9').localeCompare(b.dueDate || '9'));
    const flags = items.filter((i) => i.status !== 'NOT_YET_TRIGGERED' && i.status !== 'MET').map((i) => F({
      category: i.scope === 'GLOBAL' ? 'GLOBAL_DEADLINE' : 'INDIVIDUAL_DEADLINE', severity: i.severity,
      title: i.dueDate ? `${i.title}: ${fmtDate(i.dueDate)} (${whenText(i.daysLeft)})` : i.title, detail: i.detail, dueDate: i.dueDate, daysLeft: i.daysLeft,
      actor: { who: i.actor }, prosecutorAction: i.role === 'ACT' ? 'Action for you' : 'Monitor', sources: i.sources || [], legal: rag.ground(i.legal, i.title, 3),
    }));
    return { flags, data: { deadlines: items.map((i) => ({ ...i, legal: rag.ground(i.legal, i.title, 3), dayName: i.dueDate ? dayName(i.dueDate) : null, adjusted801: i.dueDate ? art801(i.dueDate) .date !== i.dueDate : false })) } };
  },
};

// =====================================================================================
// 3. Quality agent: useful / low-value reports and images
// =====================================================================================
const CORE = new Set(['AUDITION_TEMOIN', 'AUDITION_GAV', 'AUTOPSIE', 'PERQUISITION', 'PV_CONSTATATIONS', 'TELEPHONIE', 'VIDEO', 'RAPPORT_LABO', 'RAPPORT_TRACES', 'PV_GAV', 'PROLONGATION_GAV',
  'DML', 'DEMANDE_ACTES', 'ORDONNANCE_DETENTION', 'ORDONNANCE_EXPERTISE', 'REQUISITOIRE', 'IPC', 'TRANSMISSION_SCELLE']);
const EVIDENTIAL_IMG = /(trace|semelle|sang|scell|porte|serrure|corps|arme|couteau|marteau|blessure|blood|knife|wound|print|seal|weapon|body|lock)/i;

const QualityAgent = {
  id: 'QUALITY', name: 'Quality agent', triggers: ['upload'],
  purpose: 'Sorts reports and images into essential, useful and low-value, and flags data-quality issues (unreadable scans, uncertain classification, missing images).',
  run(A, ctx) { return runQuality(A, ctx, flagFactory('QA'), []); },
};

function runQuality(A, { rag }, F, flags) {
  const cites = new Map();
  const cite = (id, why) => { if (!cites.has(id)) cites.set(id, new Set()); cites.get(id).add(why); };
  for (const c of A.contradictions) for (const s of c.sides) for (const i of s.items) cite(i.docId, c.id);
  for (const m of A.missing) for (const s of m.sources) cite(s.docId, m.id);
  for (const d of A.deadlines) for (const s of d.sources || []) if (s) cite(s.docId, d.ruleId || 'date');
  const key = new Set(A.persons.filter((p) => ['VICTIME', 'MIS_EN_CAUSE', 'TEMOIN'].includes(p.role)).map((p) => p.id));
  const docs = [];
  for (const d of A.documents) {
    if (d.type === 'INVENTAIRE') continue;
    const facts = A.statements.filter((s) => s.docId === d.id).length + A.timeline.facts.filter((e) => e.sources.some((s) => s.docId === d.id)).length + A.seals.filter((s) => s.docId === d.id).length;
    const people = A.persons.filter((p) => key.has(p.id) && p.docs.includes(d.id)).length;
    const text = d.pages.map((p) => p.text).join(' ');
    const refs = cites.get(d.id) ? [...cites.get(d.id)] : [];
    const evidentialImgs = d.type === 'PLANCHE_PHOTO' ? (text.match(/Photo \d+\s*:\s*[^\n]*/g) || []).filter((c) => EVIDENTIAL_IMG.test(c) && !/non reproduite/i.test(c)).length : 0;
    const score = refs.length * 3 + Math.min(facts, 10) + people * 2 + evidentialImgs + (CORE.has(d.type) ? 4 : 1);
    const tier = (refs.length && CORE.has(d.type)) || score >= 12 ? 'ESSENTIAL' : score >= 5 ? 'USEFUL' : 'LOW_VALUE';
    const reasons = [];
    if (refs.length) reasons.push(`cited by ${refs.length} alert(s): ${refs.slice(0, 4).join(', ')}`);
    if (facts) reasons.push(`${facts} extracted fact(s)`);
    if (evidentialImgs) reasons.push(`${evidentialImgs} evidential photo(s)`);
    reasons.push(people ? `mentions ${people} key person(s)` : 'no mention of the victim, suspect or witnesses');
    if (!CORE.has(d.type)) reasons.push('administrative or context document');
    const noText = text.replace(/\s/g, '').length < 150;
    if (noText) reasons.push('almost no text (scan: OCR needed)');
    docs.push({ docId: d.id, type: d.type, typeEn: DOC_TYPE_EN[d.type] || d.type, tier, score, reasons, confidence: d.confidence });
    if (d.confidence < 0.7) flags.push(F({ category: 'DATA_QUALITY', severity: 'MEDIUM', title: `Uncertain classification for ${d.id}`, detail: `Detected as "${DOC_TYPE_EN[d.type] || d.type}" with ${Math.round(d.confidence * 100)}% confidence: please confirm.`, sources: [{ docId: d.id, page: 1, quote: '' }] }));
    if (noText) flags.push(F({ category: 'DATA_QUALITY', severity: 'MEDIUM', title: `${d.id} has no readable text`, detail: 'Probably a scanned image: its content was not analysed (OCR not enabled in the prototype).', sources: [{ docId: d.id, page: 1, quote: '' }] }));
  }
  const images = [];
  for (const d of A.documents.filter((x) => x.type === 'PLANCHE_PHOTO')) {
    for (const p of d.pages) {
      for (const m of p.text.matchAll(/Photo (\d+)\s*:\s*([^\n]+)/g)) {
        const cap = m[2].trim();
        const missing = /non reproduite|not reproduced/i.test(cap);
        images.push({ docId: d.id, page: p.n, ref: `Photo ${m[1]}`, caption: cap, tier: missing ? 'MISSING_IMAGE' : EVIDENTIAL_IMG.test(cap) ? 'EVIDENTIAL' : 'CONTEXT' });
      }
    }
  }
  for (const d of A.documents) if (/\[Image .* OCR/i.test(d.pages[0]?.text || '')) images.push({ docId: d.id, page: 1, ref: d.fileName, caption: 'Uploaded image file', tier: 'NEEDS_REVIEW' });
  const low = docs.filter((x) => x.tier === 'LOW_VALUE');
  if (low.length) flags.push(F({ category: 'SORTING', severity: 'INFO', title: `${low.length} document(s) of low value can be set aside`, detail: low.map((x) => `${x.docId} (${x.typeEn}): ${x.reasons.join(', ')}`).join(' | '), sources: low.map((x) => ({ docId: x.docId, page: 1, quote: '' })) }));
  const ctxImgs = images.filter((i) => i.tier === 'CONTEXT');
  if (ctxImgs.length) flags.push(F({ category: 'SORTING', severity: 'INFO', title: `${ctxImgs.length} context photo(s) without evidential content`, detail: ctxImgs.map((i) => `${i.ref}: ${i.caption}`).join(' | '), sources: ctxImgs.slice(0, 4).map((i) => ({ docId: i.docId, page: i.page, quote: i.caption })) }));
  for (const i of images.filter((x) => x.tier === 'MISSING_IMAGE')) flags.push(F({ category: 'DATA_QUALITY', severity: 'LOW', title: `${i.ref} in ${i.docId}: image not reproduced in this copy`, detail: `Caption: "${i.caption}". Ask for the original photograph if needed.`, sources: [{ docId: i.docId, page: i.page, quote: i.caption }] }));
  for (const i of images.filter((x) => x.tier === 'NEEDS_REVIEW')) flags.push(F({ category: 'DATA_QUALITY', severity: 'LOW', title: `Image ${i.ref} not analysed`, detail: 'Image files are stored but not analysed automatically: manual review needed.', sources: [{ docId: i.docId, page: 1, quote: '' }] }));
  const counts = { ESSENTIAL: docs.filter((x) => x.tier === 'ESSENTIAL').length, USEFUL: docs.filter((x) => x.tier === 'USEFUL').length, LOW_VALUE: low.length };
  flags.unshift(F({ category: 'SORTING', severity: 'INFO', title: `Reading priority: ${counts.ESSENTIAL} essential, ${counts.USEFUL} useful, ${counts.LOW_VALUE} low-value document(s)`, detail: `Images: ${images.filter((i) => i.tier === 'EVIDENTIAL').length} evidential, ${ctxImgs.length} context, ${images.filter((i) => i.tier === 'MISSING_IMAGE').length} missing.`, legal: [] }));
  void rag;
  return { flags, data: { docs: docs.sort((a, b) => b.score - a.score), images, counts } };
}

// =====================================================================================
// 4. Inconsistency agent
// =====================================================================================
const OBJ_EN = { marteau: 'hammer', telephone: 'mobile phone', chaussures: 'trainers', sweat: 'grey hoodie', ongles: 'fingernail scrapings', verre: 'broken glass' };
const hhmm = (s) => (s || '').replace(/(\d{1,2})h(\d{2})/g, '$1:$2');

function inconsistencyEn(c, A) {
  const sus = personName(A, 'MIS_EN_CAUSE') || 'The suspect';
  const label = (i) => (c.sides[i]?.label || '').replace(/^(Déclarations? de|Première déclaration|Déclaration ultérieure)\s*/i, '').replace(/^(M\.|Mme)\s+/, '');
  const t = hhmm((/(\d{1,2}h\d{2})/.exec(c.title) || [])[1]);
  if (c.key === 'presence') return { title: `${sus}'s account vs a witness sighting at about ${t}`, detail: `${sus} states he did not leave his home that evening (${c.sides[0].items.map((i) => i.docId).join(', ')}); ${label(1)} states he saw him on the landing at about ${t} (${c.sides[1].items.map((i) => i.docId).join(', ')}). The statements appear incompatible.`, risk: 'Merits issue (assessment of evidence), not a procedural defect: consider a confrontation or further hearing.', legal: ['CPP-81'] };
  if (c.key === 'telephone') {
    const row = c.sides[1]?.items[0]?.quote || '';
    const m = /(\d{2}:\d{2}:\d{2})\s+(VOIX|SMS)\s+SORTANT\s+(0\d(?: \d\d){4})\s+(\S+)/.exec(row);
    const corr = m ? (A.phone.flatMap((p) => Object.entries(p.directory)).find(([n]) => n === m[3])?.[1]?.name || m[3]) : 'a correspondent';
    return { title: `${sus}'s statement on phone use vs operator records`, detail: `${sus} states he did not touch his phone after ${t}; the operator records show an outgoing ${m?.[2] === 'SMS' ? 'text' : 'call'}${m ? ` at ${m[1]} (${m[4]})` : ''} to ${corr}. Data sessions in the same period were set aside (possibly automatic).`, risk: 'Merits issue: the phone extraction report (missing) is needed to clarify who used the device.', legal: ['CPP-60-1'] };
  }
  if (c.key?.startsWith('arrivee')) return { title: `Different arrival times for the same police crew (${hhmm(c.title.split(':').slice(1).join(':').trim())})`, detail: `${c.sides.length} different times are recorded: ${c.sides.map((s) => hhmm(s.label.replace('selon', 'in'))).join('; ')}. The tool does not decide which one is correct.`, risk: 'Reliability of the fine chronology; check the original logs (control room, CCTV time-stamp).', legal: ['CPP-54'] };
  if (c.key?.startsWith('evolution')) {
    const w = (c.title.replace(/^Évolution des déclarations de\s*/, '').replace(/^(M\.|Mme)\s+/, ''));
    const times = [...c.summary.matchAll(/(\d{1,2}h\d{2}) \((D\d+)\)/g)].map((x) => `${hhmm(x[1])} (${x[2]})`);
    return { title: `Change between successive statements of ${w}`, detail: `Time of the shouting: ${times.join(' then ')}. In the first account the witness did not know who was shouting; in the formal hearing she thinks she recognised ${sus}'s voice.`, risk: 'Reliability of a witness statement; the point was not raised in the hearings on file.', legal: ['CPP-81'] };
  }
  if (c.key === 'voix') return { title: `${sus}'s denial vs voice identification by ${c.sides[1].label.replace(/^Déclaration de\s*/, '').replace(/^(M\.|Mme)\s+/, '')}`, detail: `${sus} says he did not go to the victim's flat; the witness thinks she recognised his voice there at about ${t}, while expressing doubt herself. Weak contradiction.`, risk: 'Merits issue; a confrontation has been requested by the defence.', legal: ['CPP-82-1', 'CPP-81'] };
  if (c.key?.startsWith('scelle')) {
    const obj = OBJ_EN[c.key.slice(7)] || c.key.slice(7);
    return { title: `Exhibit numbering inconsistency: ${obj} (${c.sides.map((s) => s.label.replace('Scellé n°', 'seal no.')).join(' / ')})`, detail: `The ${obj} appears under ${c.sides.map((s) => `${s.label.replace('Scellé n°', 'seal no.')} in ${[...new Set(s.items.map((i) => i.docId))].join(', ')}`).join(' and under ')}. ${/aussi/.test(c.summary) ? 'The same number also designates another exhibit. ' : ''}Chain-of-custody point to clear before relying on lab results.`, risk: 'Procedural risk: an unexplained break in the chain of custody may lead to annulment of the seizure or of the expert analysis.', legal: ['CPP-56', 'CPP-171'], procedural: true };
  }
  return { title: c.title, detail: c.summary, risk: '', legal: [] };
}

const InconsistencyAgent = {
  id: 'INCONSISTENCY', name: 'Inconsistency agent', triggers: ['upload'],
  purpose: 'Detects contradictions between documents (statements, times, exhibits) and procedural irregularities that could ground a nullity request.',
  run(A, { rag }) {
    const F = flagFactory('INC');
    const flags = [];
    for (const c of A.contradictions) {
      const e = inconsistencyEn(c, A);
      flags.push(F({ category: e.procedural ? 'PROCEDURAL_DEFECT_RISK' : 'CONTRADICTION', severity: e.procedural ? 'HIGH' : LEVEL_SEV[c.level] || 'MEDIUM', title: e.title, detail: `${e.detail} ${HUMAN_REVIEW}`, risk: e.risk, ref: c.id,
        strength: c.level === 'FORTE' ? 'Strong contradiction' : 'To be checked', sources: c.sides.flatMap((s) => s.items).slice(0, 6).map(src), legal: rag.ground(e.legal, e.title, 3) }));
    }
    const g = A.procedural.gav || {};
    if (g.interpellation && g.declaredStart && absMin(g.declaredStart) > absMin(g.interpellation)) {
      flags.push(F({ category: 'PROCEDURAL_DEFECT_RISK', severity: 'HIGH', title: `Custody start time recorded ${absMin(g.declaredStart) - absMin(g.interpellation)} min after the apprehension`,
        detail: `Apprehension at ${at(g.interpellation)}; custody notified "from ${at(g.declaredStart)}". By law the start time is, where applicable, the time of apprehension. ${HUMAN_REVIEW}`,
        risk: 'May ground a nullity request against the custody and the acts that depend on it.', sources: [src(g.interpellation.src), src(g.declaredStart.src)], legal: rag.ground(['CPP-63', 'CPP-171', 'CPP-173-1'], 'custody start time apprehension', 3) }));
      const exp = fromAbs(absMin(g.interpellation) + 24 * 60);
      if (g.prolongation && absMin(g.prolongation) > absMin(exp)) flags.push(F({ category: 'PROCEDURAL_DEFECT_RISK', severity: 'HIGH', title: `Custody extension authorised ${absMin(g.prolongation) - absMin(exp)} min after the 24-hour limit`,
        detail: `Counted from the apprehension, the first 24 hours ended at ${at(exp)}; the written extension is dated ${at(g.prolongation)}. ${HUMAN_REVIEW}`,
        risk: 'Custody beyond the limit without a prior extension may be annulled with the statements taken during that period.', sources: [src(g.prolongation.src), src(g.interpellation.src)], legal: rag.ground(['CPP-63', 'CPP-171'], 'custody extension written authorisation', 3) }));
    }
    return { flags, data: {} };
  },
};

// =====================================================================================
// 5. Progress agent
// =====================================================================================
const ProgressAgent = {
  id: 'PROGRESS', name: 'Progress agent', triggers: ['upload'],
  purpose: 'Compares the documents in the file with the steps of the criminal procedure (knowledge base) and reports a checklist and a completion rate per phase.',
  run(A, { rag }) {
    const F = flagFactory('PRG');
    const present = new Map();
    for (const d of A.documents) { if (!present.has(d.type)) present.set(d.type, []); present.get(d.type).push(d.id); }
    const pendingTypes = new Set(A.missing.filter((m) => m.status === 'EN_ATTENTE').flatMap((m) => MISSING_EN[m.kind]?.[2] || []));
    const referencedMissing = new Set(A.missing.filter((m) => m.status !== 'EN_ATTENTE').flatMap((m) => MISSING_EN[m.kind]?.[2] || []));
    const phases = rag.kb.stages.map((st) => {
      const items = st.items.map((it) => {
        const found = it.docTypes.flatMap((t) => present.get(t) || []);
        const status = found.length ? 'DONE' : it.later ? 'LATER' : it.docTypes.some((t) => pendingTypes.has(t)) ? 'PENDING'
          : it.required || it.docTypes.some((t) => referencedMissing.has(t)) ? 'MISSING' : 'OPTIONAL';
        return { id: it.id, label: it.label, status, found, legal: it.legal, producedBy: it.producedBy };
      });
      const scope = items.filter((i) => i.status !== 'LATER' && i.status !== 'OPTIONAL' || i.found.length);
      const done = items.filter((i) => i.status === 'DONE').length;
      return { id: st.id, name: st.name, items, done, total: scope.length, percent: scope.length ? Math.round((100 * done) / scope.length) : 0, reached: done > 0 };
    });
    const all = phases.flatMap((p) => p.items);
    const overall = Math.round((100 * all.filter((i) => i.status === 'DONE').length) / all.filter((i) => i.status !== 'OPTIONAL' || i.found.length).length);
    const current = [...phases].reverse().find((p) => p.reached) || phases[0];
    const next = current.items.filter((i) => ['MISSING', 'PENDING'].includes(i.status)).concat(phases.flatMap((p) => p.items.filter((i) => i.status === 'LATER')).slice(0, 1));
    const flags = [F({ category: 'PROGRESS', severity: 'INFO', title: `Procedure ${overall}% complete. Current stage: ${current.name}`,
      detail: phases.map((p) => `${p.name}: ${p.reached ? `${p.percent}% (${p.done}/${p.total})` : 'not started'}`).join(' | '), legal: [] })];
    if (next.length) flags.push(F({ category: 'PROGRESS', severity: 'LOW', title: `Next milestones: ${next.slice(0, 4).map((i) => i.label).join('; ')}`, detail: next.map((i) => `${i.label} (${i.status.toLowerCase()}; by ${i.producedBy})`).join(' | '), legal: rag.ground(next.slice(0, 3).map((i) => i.legal), '', 3) }));
    return { flags, data: { phases, overall, current: current.id } };
  },
};

// =====================================================================================
// Runtime
// =====================================================================================
export const AGENTS = [DocumentAgent, DeadlineAgent, QualityAgent, InconsistencyAgent, ProgressAgent];

export function runAgents(A, { kb, trigger = 'upload', now = new Date().toISOString().slice(0, 10), previous = null } = {}) {
  const rag = new LegalRag(kb);
  const runAt = new Date().toISOString();
  const agents = [];
  for (const ag of AGENTS) {
    if (!ag.triggers.includes(trigger)) {
      const prev = previous?.agents.find((x) => x.id === ag.id);
      if (prev) { agents.push(prev); continue; }
    }
    const t0 = Date.now();
    let res;
    try { res = ag.run(A, { rag, now, trigger }); } catch (e) { res = { flags: [{ id: `${ag.id}-ERR`, agent: ag.id, severity: 'MEDIUM', category: 'AGENT_ERROR', title: `${ag.name} failed`, detail: String(e.message || e), sources: [], legal: [] }], data: {} }; }
    const prevAgent = previous?.agents.find((x) => x.id === ag.id);
    const escalated = prevAgent ? res.flags.filter((f) => { const o = prevAgent.flags.find((p) => p.title.split(':')[0] === f.title.split(':')[0]); return o && SEV[f.severity] < SEV[o.severity]; }).map((f) => f.id) : [];
    agents.push({ id: ag.id, name: ag.name, purpose: ag.purpose, triggers: ag.triggers, trigger, ranAt: runAt, ms: Date.now() - t0, flags: res.flags, data: res.data, escalated });
  }
  const flags = agents.flatMap((a) => a.flags).sort((a, b) => SEV[a.severity] - SEV[b.severity]);
  const count = (s) => flags.filter((f) => f.severity === s).length;
  return { schema: 'lccc.agents/1', runAt, trigger, now, kbVersion: kb.version, agents, flags, counts: { CRITICAL: count('CRITICAL'), HIGH: count('HIGH'), MEDIUM: count('MEDIUM'), LOW: count('LOW'), INFO: count('INFO') }, disclaimer: HUMAN_REVIEW };
}
