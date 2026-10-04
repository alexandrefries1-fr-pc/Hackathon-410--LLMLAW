// Case Graph : relations entre personnes, déclarations, éléments techniques, pièces et constats.
// Sert à l'affichage (vue Graphe) et de contexte structuré pour le LLM.

import { fmtTime } from './text.js';

export function buildGraph({ persons, statements, phone, seals, contradictions, missing, events, docs, types }) {
  const nodes = [];
  const edges = [];
  const has = new Set();
  const node = (n) => { if (!has.has(n.id)) { has.add(n.id); nodes.push(n); } return n.id; };
  const edge = (from, to, rel, extra = {}) => edges.push({ from, to, rel, ...extra });

  const key = persons.filter((p) => ['VICTIME', 'MIS_EN_CAUSE', 'TEMOIN'].includes(p.role));
  for (const p of key) node({ id: p.id, type: 'PERSON', label: p.name, role: p.role });

  const CLAIM_LABEL = {
    AT_HOME: (s) => `Est resté chez lui (${s.window?.label ?? 'soirée'})`,
    NO_PHONE: (s) => `N'a pas utilisé son téléphone (${s.window?.label ?? ''})`,
    NOT_AT_PLACE: () => "N'est pas allé chez la victime",
    SEEN: (s) => `A vu ${s.subjectLabel ?? 'le mis en cause'} ${s.place ? 'sur le ' + s.place : 'dehors'}${s.at ? ' vers ' + fmtTime(s.at.minutes) : ''}`,
    HEARD: (s) => `A entendu ${/bruit/.test(s.quote) && !/cris|dispute/.test(s.quote) ? 'un bruit sourd' : 'une dispute'}${s.at ? ' vers ' + fmtTime(s.at.minutes) : ''}`,
    VOICE_ID: () => 'Pense reconnaître la voix du mis en cause',
    VOICE_UNKNOWN: () => 'Ne sait pas qui criait',
    CALLED_VICTIM: (s) => `A appelé la victime vers ${fmtTime(s.at.minutes)}`,
    MESSAGE_SENT: (s) => `A envoyé un message vers ${s.at ? fmtTime(s.at.minutes) : ''}`,
  };
  const byId = Object.fromEntries(persons.map((p) => [p.id, p]));
  const claimIds = new Map();
  statements.forEach((s, i) => {
    if (!CLAIM_LABEL[s.kind] || !byId[s.speakerId]) return;
    const sig = `${s.speakerId}|${s.kind}|${s.at?.minutes ?? ''}`;
    if (claimIds.has(sig)) { const n = nodes.find((x) => x.id === claimIds.get(sig)); n.sources.push({ docId: s.docId, page: s.page, quote: s.quote }); return; }
    const id = `ST-${i}`;
    claimIds.set(sig, id);
    node({ id, type: 'STATEMENT', label: CLAIM_LABEL[s.kind]({ ...s, subjectLabel: byId[s.subjectId]?.name }), kind: s.kind, sources: [{ docId: s.docId, page: s.page, quote: s.quote }] });
    node({ id: s.speakerId, type: 'PERSON', label: byId[s.speakerId].name, role: byId[s.speakerId].role });
    edge(s.speakerId, id, 'DÉCLARE');
    if (s.subjectId && s.subjectId !== s.speakerId && byId[s.subjectId]) { node({ id: s.subjectId, type: 'PERSON', label: byId[s.subjectId].name, role: byId[s.subjectId].role }); edge(id, s.subjectId, 'CONCERNE'); }
  });

  for (const ph of phone) {
    const lineId = `LINE-${ph.owner?.number}`;
    node({ id: lineId, type: 'EVIDENCE', label: `Ligne ${ph.owner?.number} (titulaire : ${ph.owner?.name ?? '?'})`, sub: 'Relevés opérateur', sources: [{ docId: ph.docId, page: 1, quote: '' }] });
  }
  const sealSeen = new Set();
  for (const s of seals) {
    if (!s.object || sealSeen.has(s.object)) continue;
    sealSeen.add(s.object);
    node({ id: `OBJ-${s.object}`, type: 'EVIDENCE', label: s.objectLabel, sub: /^\d+$/.test(s.number) ? `Scellé n°${s.number}` : `Scellé ${s.number}`, sources: [{ docId: s.docId, page: s.page, quote: s.quote }] });
  }
  for (const c of contradictions) {
    const id = c.id;
    node({ id, type: 'FINDING', label: c.title, level: c.level, category: c.category });
    if (c.key === 'presence' || c.key === 'voix') {
      for (const [sigNode] of claimIds) void sigNode;
      for (const n of nodes.filter((n) => n.type === 'STATEMENT' && ((c.key === 'presence' && ['AT_HOME', 'SEEN'].includes(n.kind)) || (c.key === 'voix' && ['NOT_AT_PLACE', 'VOICE_ID'].includes(n.kind))))) edge(n.id, id, 'EN TENSION');
    }
    if (c.key === 'telephone') {
      for (const n of nodes.filter((n) => n.type === 'STATEMENT' && n.kind === 'NO_PHONE')) edge(n.id, id, 'EN TENSION');
      for (const n of nodes.filter((n) => n.id.startsWith('LINE-'))) edge(n.id, id, 'EN TENSION');
    }
    if (c.key?.startsWith('scelle-')) edge(`OBJ-${c.key.slice(7)}`, id, 'TRAÇABILITÉ');
  }
  for (const m of missing) {
    node({ id: m.id, type: 'MISSING', label: m.label, level: m.level, status: m.status });
    for (const l of m.linked || []) edge(m.id, l, 'NÉCESSAIRE À');
    if (m.kind === 'GENETIQUE') { edge(`OBJ-marteau`, m.id, 'ANALYSE ATTENDUE'); edge(`OBJ-ongles`, m.id, 'ANALYSE ATTENDUE'); }
    if (m.kind === 'EXTRACTION_TEL') edge(`OBJ-telephone`, m.id, 'ANALYSE ATTENDUE');
  }
  const window = events.find((e) => e.kind === 'DEATH_WINDOW');
  if (window) node({ id: 'EV-DEATH', type: 'EVENT', label: `Décès entre ${fmtTime(window.minutes)} et ${fmtTime(window.end)}`, sources: window.sources });
  void docs; void types;
  // On ne garde que les éléments matériels reliés à au moins un constat (lisibilité)
  const kept = edges.filter((e) => has.has(e.from) && has.has(e.to));
  const linked = new Set(kept.flatMap((e) => [e.from, e.to]));
  return { nodes: nodes.filter((n) => n.type !== 'EVIDENCE' || linked.has(n.id)), edges: kept };
}
