// Construction des chronologies : (1) faits de la soirée, (2) actes de procédure.
// Chaque événement est relié à une ou plusieurs sources ; les sources concordantes sont fusionnées,
// chacune conservant son propre horaire (ce qui permet de détecter les écarts entre pièces).

import { fold, sentences, findTimes, findDates, clip, fmtTime, fmtDur, tokens } from './text.js';
import { docText } from './segment.js';
import { statementZones } from './extract.js';
import * as L from './lexicon.js';
import { typeLabel } from './classify.js';

const FACT_DOCS = new Set(['FICHE_CIC', 'PV_INTERVENTION', 'PV_CONSTATATIONS', 'PV_GAV', 'AUTOPSIE', 'VIDEO', 'SYNTHESE', 'AUDITION_TEMOIN', 'AUDITION_GAV', 'IPC']);
const TABLE_DOCS = new Set(['FICHE_CIC', 'VIDEO']);
const BOILERPLATE = /(l'an deux mille|lecture faite|dont proces-verbal|clos le|clos a|cloturons|persiste et signe|date et heure|de \d{1,2}h\d{2} a \d{1,2}h\d{2})/;

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function kindOf(f) {
  for (const k of L.EVENT_KINDS) {
    if (['SIGHTING', 'DISPUTE', 'THUD', 'LAST_CONTACT'].includes(k.kind)) continue;
    if (k.kind === 'ARRIVAL' && (/(au service|au commissariat|a l'institut|a l'immeuble|du travail)/.test(f) || !/(sur (les lieux|place)|devant l'immeuble|arrivee (de|des|du|d'un))/.test(f))) continue;
    if (k.re.test(f)) return k.kind;
  }
  return 'GENERIC';
}

const EXTRA_ACTORS = [{ actor: 'Médecin légiste', re: /legiste/ }, { actor: 'Parquet', re: /substitut|procureur/ }];
function actorOf(f, type) {
  for (const a of [...EXTRA_ACTORS, ...L.ACTORS]) if (a.re.test(f)) return a.actor;
  if (/\bnous\b/.test(f)) {
    if (type === 'PV_INTERVENTION') return 'TV-12';
    if (type === 'PV_CONSTATATIONS') return 'OPJ';
  }
  return null;
}

const CATEGORY = (type, role) =>
  type === 'VIDEO' || type === 'TELEPHONIE' ? 'TECHNIQUE'
    : type === 'AUTOPSIE' ? 'MEDICAL'
      : role === 'MIS_EN_CAUSE' ? 'MIS_EN_CAUSE'
        : role === 'TEMOIN' ? 'TEMOIGNAGE' : 'POLICE';

const ACTOR_LABEL = { 'TV-12': "de l'équipage TV-12", SMUR: 'du SMUR', OPJ: 'des OPJ (Brigade criminelle)', IJ: "de l'identité judiciaire", 'Médecin légiste': 'du médecin légiste' };

// Proposition entourant un horaire dans une phrase longue (sous-chaîne exacte, utilisable comme citation)
function clauseAround(s, idx) {
  const pre = s.slice(0, idx);
  let start = Math.max(pre.lastIndexOf(' ; '), pre.lastIndexOf(' : '), pre.lastIndexOf(', Nous'), pre.lastIndexOf(', nous'));
  start = start >= 0 && idx - start < 220 ? start + 2 : idx > 200 ? idx - 160 + Math.max(0, s.slice(idx - 160, idx).indexOf(' ') + 1) : 0;
  const post = s.slice(idx);
  const e = post.search(/ ; |(?<!\b(?:M|Mme|Me|Dr|Cne|Lt|n))\. (?=[A-ZÀ-Ý])/);
  const end = e > 0 ? idx + e + 1 : s.length;
  return s.slice(start, end).trim().replace(/^[,;:]\s*/, '');
}

export function buildFactsTimeline(ctx) {
  const { docs, types, statements, phone, factsDate, personsById, deponents } = ctx;
  const next = addDays(factsDate, 1);
  const raw = [];
  const nameOf = (id) => personsById[id] ? `${personsById[id].gender === 'F' ? 'Mme' : 'M.'} ${personsById[id].last}` : 'Une personne';
  const inWindow = (date, min) => (date === factsDate && min >= 17 * 60) || (date === next && min < 4 * 60);
  const S = (docId, page, quote, minutes) => ({ docId, page, quote, minutes });

  // 1) Déclarations qualifiées (vu, entendu, appel...)
  for (const s of statements) {
    if (!s.at) continue;
    const date = s.at.minutes < 4 * 60 ? next : factsDate;
    const who = nameOf(s.speakerId);
    let label = null, kind = null;
    if (s.kind === 'SEEN') { kind = 'SIGHTING'; label = `${nameOf(s.subjectId)} vu ${s.place ? `sur le ${s.place}` : 'hors de son domicile'} selon ${who}`; }
    if (s.kind === 'HEARD') {
      const bruit = /bruit/.test(fold(s.quote)) && !/(cris|dispute)/.test(fold(s.quote));
      kind = bruit ? 'THUD' : 'DISPUTE';
      label = bruit ? `Bruit sourd entendu par ${who}` : `Cris / dispute entendus chez la victime par ${who}`;
    }
    if (s.kind === 'CALLED_VICTIM') { kind = 'LAST_CONTACT'; label = `Appel de ${who} à la victime : dernier contact connu`; }
    if (s.kind === 'MESSAGE_SENT') { kind = 'VERSION'; label = `${who} déclare avoir envoyé un message à ${{ frere: 'son frère', soeur: 'sa sœur', mere: 'sa mère', pere: 'son père', collegue: 'un collègue' }[s.to] ?? 'un proche'}`; }
    if (!kind) continue;
    const role = deponents[s.docId]?.personId === s.speakerId ? deponents[s.docId].role : personsById[s.speakerId]?.role;
    raw.push({ date, minutes: s.at.minutes, approx: s.at.approx, kind, actor: s.speakerId, label, category: CATEGORY(types[s.docId], role),
      sources: [S(s.docId, s.page, s.quote, s.at.minutes)], fromClaim: true, speakerId: s.speakerId });
  }
  const covered = raw.map((r) => fold(r.sources[0].quote));

  for (const d of docs) {
    const type = types[d.id];
    if (!FACT_DOCS.has(type)) continue;

    // 2) Lignes de tableaux horodatées (CIC, vidéoprotection)
    if (TABLE_DOCS.has(type)) {
      const rows = [];
      let cur = null;
      const flush = () => { if (cur) rows.push(cur); cur = null; };
      for (const p of d.pages) {
        for (const line of p.lines) {
          const m = /^(\d{2}):(\d{2}):(\d{2})\s+(.*)$/.exec(line.trim());
          if (m) { flush(); cur = { minutes: +m[1] * 60 + +m[2], seconds: +m[3], text: m[4], page: p.n, raw: line.trim() }; }
          else if (cur && (/^[a-zà-ÿ]/.test(line.trim()) || !/[.]$/.test(cur.text))) { cur.text += ' ' + line.trim(); cur.raw += ' ' + line.trim(); }
          else flush();
        }
      }
      flush();
      for (const r of rows) {
        const f = fold(r.text);
        let kind = kindOf(f);
        if (kind === 'GENERIC' && type === 'VIDEO' && /(entre|sort)/.test(f)) kind = /sort/.test(f) ? 'CCTV_OUT' : 'CCTV_IN';
        const actor = kind === 'ARRIVAL' ? actorOf(f, type) : null;
        raw.push({ date: r.minutes < 6 * 60 ? next : factsDate, minutes: r.minutes, seconds: r.seconds, approx: false, kind, actor,
          label: kind === 'ARRIVAL' && ACTOR_LABEL[actor] ? `Arrivée ${ACTOR_LABEL[actor]} sur les lieux` : clip(r.text, 150),
          category: type === 'VIDEO' ? 'TECHNIQUE' : 'POLICE', sources: [S(d.id, r.page, r.raw, r.minutes)] });
      }
      continue;
    }

    // 3) Phrases horodatées : zones de déclaration pour les auditions, texte entier sinon
    const dt = docText(d);
    const dep = deponents[d.id];
    const isAudition = type === 'AUDITION_TEMOIN' || type === 'AUDITION_GAV';
    const zones = isAudition ? statementZones(dt.text, type) : [{ offset: 0, text: dt.text }];
    for (const z of zones) {
      for (const s of sentences(z.text)) {
        const f = fold(s.text);
        const times = findTimes(s.text);
        if (!times.length) continue;
        if (covered.some((c) => c.includes(f) || f.includes(c))) continue;
        const page = dt.pageAt(z.offset + s.start);
        const dates = findDates(s.text);
        if (type === 'AUTOPSIE') {
          const iv = /entre (\d{1,2})h(\d{2}) et (\d{1,2})h(\d{2})/.exec(f);
          if (iv && /deces/.test(f)) raw.push({ date: factsDate, minutes: +iv[1] * 60 + +iv[2], end: +iv[3] * 60 + +iv[4], kind: 'DEATH_WINDOW',
            label: 'Fenêtre estimée du décès (rapport médico-légal)', category: 'MEDICAL', sources: [S(d.id, page, s.text, +iv[1] * 60 + +iv[2])] });
          continue;
        }
        // Une phrase longue peut contenir plusieurs horaires : un événement par proposition
        const usedClauses = new Set();
        for (const t of s.text.length > 160 ? times : times.slice(0, 1)) {
        const near = f.slice(Math.max(0, t.index - 90), t.index + 25);
        if (BOILERPLATE.test(near)) continue;
        const clause = s.text.length > 160 ? clauseAround(s.text, t.index) : s.text;
        if (usedClauses.has(clause)) continue;
        usedClauses.add(clause);
        const fc = fold(clause);
        let date = findDates(clause)[0]?.iso ?? (s.text.length > 160 ? factsDate : dates[0]?.iso ?? factsDate);
        if (type === 'SYNTHESE' && !/(alertait|arrivait|constate|interpelle)/.test(fc)) continue;
        if (!findDates(clause).length && t.minutes < 4 * 60) date = next;
        if (!inWindow(date, t.minutes)) continue;
        const kind = kindOf(fc);
        if (type === 'PV_GAV' && !['INTERPELLATION', 'GAV'].includes(kind)) continue;
        const speaker = (isAudition || type === 'IPC') && dep ? dep : null;
        const actor = kind === 'ARRIVAL' ? actorOf(fc, type) : null;
        let label = clip(clause.replace(/^(À|A) \d{1,2}h\d{2},\s*/, ''), 150);
        label = label.charAt(0).toUpperCase() + label.slice(1);
        if (kind === 'ARRIVAL' && ACTOR_LABEL[actor]) label = `Arrivée ${ACTOR_LABEL[actor]} sur les lieux`;
        if (kind === 'DEATH_DECLARED') label = 'Décès constaté par le médecin du SMUR';
        if (kind === 'CALL_17') label = 'Appel au 17 signalant cris et bruit de chute';
        if (kind === 'INTERPELLATION') label = 'Interpellation du mis en cause à son domicile';
        if (speaker) label = `${nameOf(speaker.personId)} : « ${clip(clause, 140)} »`;
        raw.push({ date, minutes: t.minutes, approx: t.approx, kind: speaker ? 'VERSION' : kind, actor, label,
          category: speaker ? CATEGORY(type, speaker.role) : CATEGORY(type, null), speakerId: speaker?.personId, sources: [S(d.id, page, clause, t.minutes)] });
        }
      }
    }
  }

  // 4) Téléphonie : communications voix et SMS de la soirée
  for (const ph of phone) {
    for (const r of ph.rows) {
      if (r.type === 'DATA') continue;
      if (!inWindow(r.date, r.minutes) || (r.date === factsDate && r.minutes < 18 * 60)) continue;
      const corr = ph.directory[r.corr]?.name;
      const owner = ph.owner?.name ?? 'la ligne';
      const what = r.type === 'VOIX' ? `Appel ${r.dir === 'SORTANT' ? 'sortant' : 'entrant'}${r.dur !== '-' ? ` (${fmtDur(r.dur)})` : ''}` : `SMS ${r.dir === 'SORTANT' ? 'sortant' : 'entrant'}`;
      raw.push({ date: r.date, minutes: r.minutes, seconds: +r.time.slice(6), kind: 'PHONE', label: `${what} · ligne de ${owner} ${r.dir === 'SORTANT' ? 'vers' : 'depuis'} ${corr ?? r.corr}`,
        category: 'TECHNIQUE', sources: [S(ph.docId, r.page, r.quote, r.minutes)], phoneRow: r });
    }
  }

  // Fusion des sources concordantes (même nature, même acteur, écart <= 3 min ; ou même contenu)
  raw.sort((a, b) => (a.date + pad(a.minutes)).localeCompare(b.date + pad(b.minutes)));
  const merged = [];
  for (const e of raw) {
    const tk = new Set(tokens(e.label + ' ' + e.sources[0].quote));
    const twin = merged.find((m) => {
      if (m.date !== e.date || Math.abs(m.minutes - e.minutes) > 3) return false;
      if (m.kind === 'DEATH_WINDOW' || e.kind === 'DEATH_WINDOW') return m.kind === e.kind;
      if (m.kind === 'PHONE' || e.kind === 'PHONE') return false;
      if (!['GENERIC', 'VERSION'].includes(m.kind) && m.kind === e.kind) return (m.actor ?? null) === (e.actor ?? null) || !m.actor || !e.actor;
      // rapprochement par contenu : jamais entre deux déclarations distinctes
      if (m.kind === 'VERSION' && e.kind === 'VERSION') return false;
      if (m.kind !== 'GENERIC' && e.kind !== 'GENERIC' && !m.fromClaim && !e.fromClaim) return false;
      const inter = [...tk].filter((x) => m._tk.has(x)).length;
      return inter / Math.max(1, Math.min(tk.size, m._tk.size)) >= 0.45;
    });
    if (twin) {
      for (const s of e.sources) if (!twin.sources.some((x) => x.docId === s.docId && x.quote === s.quote)) twin.sources.push(s);
      if (twin.kind === 'GENERIC' && e.kind !== 'GENERIC') { twin.kind = e.kind; twin.label = e.label; twin.actor = e.actor; twin.category = e.category; }
      if (e.fromClaim && !twin.fromClaim) { twin.label = e.label; twin.kind = e.kind; twin.fromClaim = true; twin.category = e.category; }
      twin.approx = twin.approx && e.approx;
      continue;
    }
    merged.push({ ...e, _tk: tk });
  }
  return merged.map((e, i) => {
    delete e._tk;
    const key = e.fromClaim || !['GENERIC', 'VERSION'].includes(e.kind) || e.category === 'TECHNIQUE' || e.category === 'MIS_EN_CAUSE';
    const mins = [...new Set(e.sources.map((s) => s.minutes).filter((x) => x != null))].sort((a, b) => a - b);
    const timeLabel = e.end ? `${fmtTime(e.minutes)} – ${fmtTime(e.end)}`
      : mins.length > 1 ? `${fmtTime(mins[0])} – ${fmtTime(mins[mins.length - 1])}` : (e.approx ? 'vers ' : '') + fmtTime(e.minutes);
    return { id: `EV-${String(i + 1).padStart(3, '0')}`, ...e, importance: key ? 'key' : 'normal', timeLabel, flags: [] };
  });
}

function pad(n) { return String(n ?? 0).padStart(5, '0'); }

// --------------------------- Chronologie de la procédure ---------------------------
export function buildProcedureTimeline({ docs, types, metas, procedural }) {
  const ev = [];
  for (const d of docs) {
    const date = metas[d.id]?.date;
    if (!date || types[d.id] === 'INVENTAIRE') continue;
    ev.push({ date, minutes: null, label: typeLabel(types[d.id]), detail: metas[d.id]?.subtitle, kind: 'PIECE', docId: d.id, sources: [{ docId: d.id, page: 1, quote: d.pages[0].lines.slice(0, 2).join(' ') }] });
  }
  const g = procedural.gav || {};
  const add = (x, label, kind) => x && ev.push({ date: x.date, minutes: x.minutes, label, kind, sources: [x.src] });
  add(g.interpellation, 'Interpellation de la personne mise en cause', 'ACTE');
  add(g.declaredStart, 'Placement en garde à vue (heure de début retenue au PV)', 'ACTE');
  add(g.prolongation, 'Autorisation de prolongation de la garde à vue', 'ACTE');
  add(g.end, 'Levée de la garde à vue et déferrement', 'ACTE');
  add(procedural.detention, 'Placement en détention provisoire', 'ACTE');
  add(procedural.demandeActes?.received, "Réception d'une demande d'actes (art. 82-1)", 'ACTE');
  add(procedural.dml?.received, "Réception d'une demande de mise en liberté", 'ACTE');
  add(procedural.dml?.communicated, 'Demande de mise en liberté communiquée au parquet', 'ACTE');
  ev.sort((a, b) => (a.date + pad(a.minutes ?? 9999)).localeCompare(b.date + pad(b.minutes ?? 9999)));
  return ev.map((e, i) => ({ id: `PR-${String(i + 1).padStart(3, '0')}`, ...e, timeLabel: e.minutes != null ? fmtTime(e.minutes) : '' }));
}
