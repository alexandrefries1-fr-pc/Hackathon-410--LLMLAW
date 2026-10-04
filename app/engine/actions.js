// Liste d'actions opérationnelles, dérivée des échéances, manques et incohérences.
// Les actions proposent des vérifications ; elles ne recommandent jamais une décision juridictionnelle.

import { fmtDate } from './text.js';

const P = { CRITIQUE: 0, IMPORTANT: 1, A_VERIFIER: 2, SUIVI: 3 };
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export function buildActions({ deadlines, missing, contradictions }) {
  const out = [];
  const add = (a) => out.push(a);

  const camDeadline = deadlines.some((d) => d.ruleId === 'TECH-VID-01');
  for (const d of deadlines) {
    if (d.kind === 'CALCULEE' && ['CRITIQUE', 'IMPORTANT', 'DEPASSEE'].includes(d.priority) && !d.indicative) {
      const what = d.ruleId === 'TECH-VID-01' ? ` de la ${d.label.split('·').pop().trim().toLowerCase().replace('caméra (', 'caméra du ').replace(')', '')}` : '';
      const missingCam = d.ruleId === 'TECH-VID-01' ? missing.find((m) => m.kind === 'CAMERA') : null;
      add({ priority: d.priority === 'DEPASSEE' ? 'CRITIQUE' : d.priority, label: `${d.action}${what} avant le ${fmtDate(d.dueDate)}`,
        why: missingCam ? `${missingCam.why} ${d.label} · ${d.basis}` : `${d.label} · ${d.basis}`, ref: d.id, refType: 'deadline', sources: d.sources, due: d.dueDate });
    }
    if (d.kind === 'CONTROLE' && d.priority === 'A_VERIFIER') {
      add({ priority: 'IMPORTANT', label: d.action, why: `${d.label} · ${d.basis} : ${d.checks.filter((c) => c.status === 'A_VERIFIER').map((c) => c.label.toLowerCase()).join(', ')}`, ref: d.id, refType: 'deadline', sources: d.sources });
    }
  }
  for (const m of missing) {
    if (m.kind === 'CAMERA' && camDeadline) continue; // déjà couvert par l'échéance TECH-VID-01
    if (m.status === 'EN_ATTENTE') {
      add({ priority: 'SUIVI', label: `Suivre le dépôt : ${lc(m.label)} (attendu avant le ${fmtDate(m.deadline)})`, why: m.why, ref: m.id, refType: 'missing', sources: m.sources, due: m.deadline });
      continue;
    }
    const verb = m.kind === 'CAMERA' ? 'Faire vérifier la récupération des' : m.kind === 'BIENS' ? 'Vérifier les investigations sur les' : m.status === 'A_PLANIFIER' ? 'Planifier :' : 'Vérifier la réception ou relancer :';
    const label = m.kind === 'CAMERA' || m.kind === 'BIENS' ? `${verb} ${m.label.charAt(0).toLowerCase()}${m.label.slice(1)}` : `${verb} ${lc(m.label)}`;
    add({ priority: m.level === 'SUIVI' ? 'SUIVI' : m.level, label, why: m.note ? `${m.why} ${m.note}` : m.why, ref: m.id, refType: 'missing', sources: m.sources });
  }
  for (const c of contradictions) {
    add({ priority: 'A_VERIFIER', label: `Vérification humaine : ${c.title.charAt(0).toLowerCase()}${c.title.slice(1)}`, why: c.summary, ref: c.id, refType: 'contradiction',
      sources: c.sides.flatMap((s) => s.items).slice(0, 4), level: c.level });
  }
  out.sort((a, b) => P[a.priority] - P[b.priority] || (a.due || '9').localeCompare(b.due || '9'));
  return out.map((a, i) => ({ id: `ACT-${String(i + 1).padStart(2, '0')}`, done: false, ...a }));
}
