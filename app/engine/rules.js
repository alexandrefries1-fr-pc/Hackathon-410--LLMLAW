// Moteur de règles procédurales minimal : calendrier (jours fériés, art. 801), échéances calculées, contrôles.
// Distingue explicitement : DATE EXTRAITE (écrite dans une pièce) / ÉCHÉANCE CALCULÉE (date + règle) / CONTRÔLE.

import { fmtDate, fmtTime } from './text.js';

// ---------- Calendrier ----------
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const holidayCache = new Map();
export function holidays(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const e = easter(y);
  const plus = (n) => { const d = new Date(e); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const set = new Map([
    [`${y}-01-01`, "Jour de l'an"], [plus(1), 'Lundi de Pâques'], [`${y}-05-01`, 'Fête du travail'], [`${y}-05-08`, 'Victoire 1945'],
    [plus(39), 'Ascension'], [plus(50), 'Lundi de Pentecôte'], [`${y}-07-14`, 'Fête nationale'], [`${y}-08-15`, 'Assomption'],
    [`${y}-11-01`, 'Toussaint'], [`${y}-11-11`, 'Armistice 1918'], [`${y}-12-25`, 'Noël'],
  ]);
  holidayCache.set(y, set);
  return set;
}
const D = (iso) => new Date(iso + 'T12:00:00Z');
const S = (d) => d.toISOString().slice(0, 10);
const dow = (iso) => D(iso).getUTCDay();
export const isHoliday = (iso) => holidays(+iso.slice(0, 4)).get(iso) || null;
export const addDays = (iso, n) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return S(d); };
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0, 12)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return S(t);
}
export function daysBetween(fromIso, toIso) { return Math.round((D(toIso) - D(fromIso)) / 86400000); }
const DAYNAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const dayName = (iso) => DAYNAMES[dow(iso)];

function art801(iso, steps) {
  let d = iso;
  let moved = false;
  while (dow(d) === 0 || dow(d) === 6 || isHoliday(d)) {
    const why = isHoliday(d) ? `jour férié (${isHoliday(d)})` : dayName(d);
    steps.push(`${fmtDate(d)} tombe un ${why} : prorogation au premier jour ouvrable suivant (art. 801 CPP)`);
    d = addDays(d, 1);
    moved = true;
  }
  return { date: d, moved };
}

function addOuvrables(iso, n, steps) {
  let d = iso;
  let c = 0;
  const seq = [];
  while (c < n) {
    d = addDays(d, 1);
    if (dow(d) === 0 || isHoliday(d)) continue;
    c++;
    seq.push(`${dayName(d)} ${fmtDate(d).slice(0, 5)}`);
  }
  steps.push(`${n} jours ouvrables (dimanches et jours fériés exclus) : ${seq.join(', ')}`);
  return d;
}

function computeDelay(anchor, delay, steps) {
  let due;
  if (delay.unit === 'day' && delay.count === 'ouvrables') due = addOuvrables(anchor, delay.n, steps);
  else if (delay.unit === 'day') { due = addDays(anchor, delay.n); steps.push(`${fmtDate(anchor)} + ${delay.n} jours = ${fmtDate(due)} (le jour de départ n'est pas compté)`); }
  else if (delay.unit === 'month') { due = addMonths(anchor, delay.n); steps.push(`${fmtDate(anchor)} + ${delay.n} mois = ${fmtDate(due)}`); }
  else if (delay.unit === 'year') { due = addMonths(anchor, 12 * delay.n); steps.push(`${fmtDate(anchor)} + ${delay.n} an = ${fmtDate(due)}`); }
  if (delay.art801) {
    const r = art801(due, steps);
    if (!r.moved) steps.push(`${fmtDate(due)} est un ${dayName(due)} ouvrable : pas de prorogation (art. 801 CPP)`);
    due = r.date;
  }
  return due;
}

function priority(daysLeft, th) {
  if (daysLeft < 0) return 'DEPASSEE';
  if (daysLeft <= (th?.CRITIQUE ?? 3)) return 'CRITIQUE';
  if (daysLeft <= (th?.IMPORTANT ?? 14)) return 'IMPORTANT';
  return 'SUIVI';
}

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// ---------- Évaluation ----------
export function evaluateRules(ruleset, facts, refDate) {
  const results = [];
  const byId = {};
  for (const r of ruleset.rules) {
    if (r.kind === 'CONTROL' && r.check === 'GAV') {
      const c = controlGav(r, facts.gav || {});
      if (c) results.push(c);
      continue;
    }
    const steps = [];
    let anchor = null, anchorSrc = null, anchorLabel = r.trigger?.label;
    if (r.chain) {
      const prev = byId[r.chain];
      if (!prev) continue;
      anchor = prev.dueDate;
      anchorSrc = prev.sources;
      steps.push(`Point de départ : transmission au plus tard le ${fmtDate(anchor)} (échéance ${r.chain})`);
    } else if (r.trigger?.fact === 'camera.retention') {
      for (const cam of facts.cameras || []) {
        if (!cam.retention || cam.exploited || cam.requested) continue;
        const st = [];
        const n = cam.retention.days ?? r.delay.default;
        st.push(`Date des faits : ${fmtDate(facts.factsDate)} (${dayName(facts.factsDate)})`);
        st.push(`Durée de conservation déclarée : « ${cam.retention.raw} » (${cam.retention.src.docId}, p. ${cam.retention.src.page})`);
        const due = addDays(facts.factsDate, n);
        st.push(`${fmtDate(facts.factsDate)} + ${n} jours = ${fmtDate(due)} : écrasement possible des images à partir de cette date`);
        const left = daysBetween(refDate, due);
        results.push(mk(r, { idSuffix: cam.key, label: `${r.title} · ${cam.label}`, dueDate: due, daysLeft: left, priority: priority(left, r.thresholds), steps: st,
          anchorDate: facts.factsDate, anchorLabel: 'date des faits', sources: [cam.retention.src] }));
      }
      continue;
    } else {
      let f = get(facts, r.trigger.fact);
      if ((!f || !f.date) && r.trigger.fallback) { f = get(facts, r.trigger.fallback); anchorLabel += ' (à défaut : réception)'; }
      if (!f || !f.date) continue;
      anchor = f.date;
      anchorSrc = [f.src];
      steps.push(`Date extraite : ${anchorLabel} le ${fmtDate(anchor)}${f.minutes != null ? ` à ${fmtTime(f.minutes)}` : ''} (${f.src.docId}, p. ${f.src.page})`);
    }
    const due = computeDelay(anchor, r.delay, steps);
    const left = daysBetween(refDate, due);
    const res = mk(r, { dueDate: due, daysLeft: left, priority: r.indicative && left > 60 ? 'SUIVI' : priority(left, r.thresholds), steps, anchorDate: anchor, anchorLabel, sources: anchorSrc });
    byId[r.id] = res;
    results.push(res);
  }
  // Dates écrites dans les pièces (non calculées)
  for (const x of facts.extractedDates || []) {
    const left = daysBetween(refDate, x.date);
    results.push({ id: `EXT-${x.docId}-${x.date}`, kind: 'EXTRAITE', ruleId: null, label: x.label, action: x.label, dueDate: x.date, daysLeft: left,
      priority: priority(left, { CRITIQUE: 3, IMPORTANT: 14 }), steps: [`Date écrite telle quelle dans la pièce ${x.docId} : aucune règle appliquée`], sources: [x.src], basis: 'Date trouvée dans un document' });
  }
  const order = { DEPASSEE: 0, CRITIQUE: 1, A_VERIFIER: 2, IMPORTANT: 3, SUIVI: 4, CONFORME: 5 };
  return results.sort((a, b) => order[a.priority] - order[b.priority] || (a.dueDate || '').localeCompare(b.dueDate || ''));
}

function mk(r, o) {
  return { id: o.idSuffix ? `${r.id}-${o.idSuffix}` : r.id, kind: 'CALCULEE', ruleId: r.id, label: o.label || r.title, action: r.action, basis: r.basis,
    summary: r.summary, notes: r.notes || [], indicative: !!r.indicative, ...o };
}

function controlGav(r, g) {
  if (!g.interpellation && !g.declaredStart) return null;
  const checks = [];
  const at = (x) => x ? `${fmtDate(x.date)} à ${fmtTime(x.minutes)}` : '?';
  // Horodatage absolu en minutes : jours depuis l'origine x 1440 + minutes dans la journée
  const toAbs = (x) => (Date.UTC(...x.date.split('-').map((v, i) => (i === 1 ? +v - 1 : +v))) / 60000) + x.minutes;
  const fromAbs = (t) => ({ date: S(new Date(Math.floor(t / 1440) * 86400000 + 43200000)), minutes: ((t % 1440) + 1440) % 1440 });
  const plusH = (x, h) => fromAbs(toAbs(x) + h * 60);
  const sources = [g.interpellation?.src, g.declaredStart?.src, g.prolongation?.src, g.end?.src].filter(Boolean);
  if (g.interpellation && g.declaredStart) {
    const diff = toAbs(g.declaredStart) - toAbs(g.interpellation);
    checks.push(diff > 0
      ? { status: 'A_VERIFIER', label: 'Heure de début de la mesure', text: `Interpellation le ${at(g.interpellation)} ; début de la garde à vue retenu au PV : ${at(g.declaredStart)} (écart de ${diff} min). Selon l'art. 63, III CPP, l'heure du début est fixée, le cas échéant, à l'heure de l'appréhension.` }
      : { status: 'CONFORME', label: 'Heure de début de la mesure', text: `Début retenu (${at(g.declaredStart)}) cohérent avec l'interpellation.` });
  }
  const base = g.interpellation || g.declaredStart;
  if (g.prolongation && base) {
    const exp = plusH(base, r.maxHours);
    const late = toAbs(g.prolongation) - toAbs(exp);
    let text = `Délai initial de 24 h calculé depuis l'interpellation : expiration le ${at(exp)}. Autorisation de prolongation datée du ${at(g.prolongation)}`;
    if (g.declaredStart && g.interpellation) {
      const exp2 = plusH(g.declaredStart, r.maxHours);
      text += ` ; calculé depuis l'heure retenue au PV, le délai expirait le ${at(exp2)}.`;
    } else text += '.';
    checks.push(late > 0
      ? { status: 'A_VERIFIER', label: 'Autorisation de prolongation', text: `${text} L'autorisation paraît postérieure de ${late} min à l'expiration du délai initial calculé depuis l'appréhension.` }
      : { status: 'CONFORME', label: 'Autorisation de prolongation', text: `${text} Autorisation antérieure à l'expiration.` });
  }
  if (g.end && base) {
    const total = toAbs(g.end) - toAbs(base);
    const h = Math.floor(total / 60), m = total % 60;
    checks.push({ status: total <= r.maxTotalHours * 60 ? 'CONFORME' : 'A_VERIFIER', label: 'Durée totale', text: `Levée de la mesure le ${at(g.end)} : durée totale ${h} h ${String(m).padStart(2, '0')} depuis l'appréhension (maximum ${r.maxTotalHours} h).` });
  }
  const worst = checks.some((c) => c.status === 'A_VERIFIER') ? 'A_VERIFIER' : 'CONFORME';
  return { id: r.id, kind: 'CONTROLE', ruleId: r.id, label: r.title, action: r.action, basis: r.basis, summary: r.summary, priority: worst, checks, sources, dueDate: null, steps: checks.map((c) => `${c.label} : ${c.text}`) };
}
