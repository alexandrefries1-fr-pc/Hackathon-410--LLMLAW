// Extraction structurée : méta des pièces, personnes, déclarations, fadettes, scellés,
// faits procéduraux (dates d'actes), vidéoprotection, biens de la victime, demandes d'actes et d'expertises.
// Tout résultat porte sa source : { docId, page, quote }.

import { norm, fold, sentences, findTimes, findDates, findDurations, clip } from './text.js';
import { docText } from './segment.js';
import * as L from './lexicon.js';

// =============================== Méta ===============================
export function docMeta(doc) {
  const head = doc.pages[0].lines.slice(0, 16).join('\n');
  const all = doc.pages.map((p) => p.flat).join(' ');
  let date = null;
  const m = /Date(?: et heure| du rapport| de la réponse| des prises de vue)?\s+(\d{2}\/\d{2}\/\d{4})/.exec(head);
  if (m) date = findDates(m[1])[0]?.iso;
  if (!date) {
    const f = /Fait[^.]{0,60}?,? le\s+((?:1er|\d{1,2})\s+\S+\s+\d{4})/.exec(all) || /^\s*[A-ZÉ][a-zé-]+, le\s+((?:1er|\d{1,2})\s+\S+\s+\d{4})/m.exec(head);
    if (f) date = findDates(f[1])[0]?.iso;
  }
  if (!date) date = findDates(head)[0]?.iso ?? findDates(all)[0]?.iso ?? null;
  const author = /Rédacteur\s+([^\n]+)/.exec(head)?.[1]?.trim() ?? null;
  const subtitle = doc.pages[0].lines.slice(0, 2).join(' · ');
  return { date, author, subtitle: clip(subtitle, 160) };
}

// =============================== Personnes ===============================
const reTitled = new RegExp(`(${L.TITLES})\\s+(?:(${L.FIRST})\\s+)?(${L.LAST})(?![a-zà-ÿ])`, 'g');
const reIdent = new RegExp(`Nom, prénom\\s+(${L.LAST})\\s+(${L.FIRST})`, 'g');
const reFirstLast = new RegExp(`(?<![A-Za-zÀ-ÿ])(${L.FIRST})\\s+(${L.LAST})(?![a-zà-ÿ])`, 'g');
const NOT_FIRST = new Set(('Affaire Rédacteur Cote Procédure Police Tribunal Cabinet Vu Nous Le La Les Pour Dans Fait Lecture Contre Ministère Juge Avocat ' +
  'Instruction Réponse Question Pièce Service Direction Brigade Centre Section Laboratoire Institut Commissariat Parquet Hackathon Mistral Sciences ' +
  'Résidence Madame Monsieur Maître Docteur Capitaine Lieutenant Brigadier Gardien Objet Requérante Requérant Équipage Opérateur Témoin Défunt ' +
  'Agent Médecin Analyste Technicien Demandeur Destinataire Titulaire Personne Magistrat Greffière Déclarant Caméra Cellule Ligne Scellé Photo Plan ' +
  'Valmont Annexons Avisons Requérons Plaçons Transmettons Commettons Disons Saisissons Donnons').split(' '));

function gender(title) {
  if (/^(M\.|Monsieur)$/.test(title)) return 'M';
  if (/^(Mme|Madame|Mlle)$/.test(title)) return 'F';
  return null;
}
const keyOf = (last) => fold(last).toUpperCase();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function extractPersons(docs) {
  const mentions = [];
  for (const d of docs) {
    for (const p of d.pages) {
      const t = p.flat;
      const spans = [];
      for (const m of t.matchAll(reTitled)) {
        if (L.NOT_NAMES.has(m[3])) continue;
        spans.push([m.index, m.index + m[0].length]);
        mentions.push({ docId: d.id, page: p.n, index: m.index, end: m.index + m[0].length, title: m[1], first: m[2] || null, last: m[3], text: t });
      }
      for (const m of t.matchAll(reIdent)) {
        if (L.NOT_NAMES.has(m[1])) continue;
        spans.push([m.index, m.index + m[0].length]);
        mentions.push({ docId: d.id, page: p.n, index: m.index, end: m.index + m[0].length, title: null, first: m[2], last: m[1], text: t, ident: true });
      }
      for (const m of t.matchAll(reFirstLast)) {
        if (NOT_FIRST.has(m[1]) || L.NOT_NAMES.has(m[2])) continue;
        if (spans.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
        mentions.push({ docId: d.id, page: p.n, index: m.index, end: m.index + m[0].length, title: null, first: m[1], last: m[2], text: t, loose: true });
      }
    }
  }
  // Personnes complètes (prénom + nom)
  const persons = new Map();
  const titledLasts = new Set(mentions.filter((m) => m.title || m.ident).map((m) => keyOf(m.last)));
  for (const m of mentions) {
    if (!m.first) continue;
    // Un "Prénom NOM" sans civilité n'est retenu que si le nom est déjà connu ou suivi d'une qualité (", juge", ", greffière"...)
    if (m.loose && !titledLasts.has(keyOf(m.last)) && !L.ROLE_AFTER.some((r) => r.re.test(fold(m.text.slice(m.end, m.end + 50))))) continue;
    if (m.loose) m.accepted = true;
    const id = `P-${keyOf(m.last)}-${fold(m.first).toUpperCase()}`;
    if (!persons.has(id)) persons.set(id, { id, first: m.first, last: m.last, gender: null, roles: {}, docs: new Set(), mentions: [], titles: new Set() });
  }
  // Rattachement de chaque mention
  for (const m of mentions) {
    let p = null;
    if (m.first) p = persons.get(`P-${keyOf(m.last)}-${fold(m.first).toUpperCase()}`);
    if (!p) {
      const g = gender(m.title || '');
      const cands = [...persons.values()].filter((x) => keyOf(x.last) === keyOf(m.last) && (!g || !x.gender || x.gender === g));
      cands.sort((a, b) => b.mentions.length - a.mentions.length);
      p = cands[0];
      if (!p) {
        if (m.loose && !m.accepted) continue;
        const id = `P-${keyOf(m.last)}`;
        p = persons.get(id) || { id, first: null, last: m.last, gender: null, roles: {}, docs: new Set(), mentions: [], titles: new Set() };
        persons.set(id, p);
      }
    }
    const g = gender(m.title || '');
    if (g && !p.gender) p.gender = g;
    if (m.title) p.titles.add(m.title);
    p.docs.add(m.docId);
    const before = fold(m.text.slice(Math.max(0, m.index - 70), m.index));
    const after = fold(m.text.slice(m.end, m.end + 70));
    p.mentions.push({ docId: m.docId, page: m.page, quote: clip(m.text.slice(Math.max(0, m.index - 60), m.end + 80), 200) });
    const vote = (r) => (p.roles[r] = (p.roles[r] || 0) + 1);
    if (m.title && L.ROLE_BY_TITLE[m.title]) vote(L.ROLE_BY_TITLE[m.title]);
    for (const r of L.ROLE_AFTER) if (r.re.test(after)) vote(r.role);
    for (const r of L.ROLE_BEFORE) if (r.re.test(before)) vote(r.role);
    if (/victime\s*:?\s*$|sur la personne de\s*$|donne la mort a\s*$|defunt\s*:?\s*$/.test(before)) vote('VICTIME');
    if (/(contre|personne concernee|personne comparante)\s*$/.test(before)) vote('MIS_EN_CAUSE');
  }
  return persons;
}

export function finalizePersons(persons, deponents) {
  for (const [docId, dep] of Object.entries(deponents)) {
    const p = persons.get(dep.personId);
    if (p) p.roles[dep.role] = (p.roles[dep.role] || 0) + 5;
  }
  const out = [];
  for (const p of persons.values()) {
    const roles = Object.keys(p.roles).sort((a, b) => L.ROLE_RANK.indexOf(a) - L.ROLE_RANK.indexOf(b));
    let role = roles[0] || 'AUTRE';
    if (role === 'VICTIME' && p.roles.VICTIME < 1) role = roles[1] || 'AUTRE';
    out.push({
      id: p.id, name: [p.first, p.last].filter(Boolean).join(' '), first: p.first, last: p.last, gender: p.gender,
      role, roles: p.roles, docs: [...p.docs].sort(), mentionCount: p.mentions.length, mentions: p.mentions.slice(0, 40),
    });
  }
  return out.sort((a, b) => L.ROLE_RANK.indexOf(a.role) - L.ROLE_RANK.indexOf(b.role) || b.mentionCount - a.mentionCount);
}

// Résolution "M. DUBOIS" / "dubois" -> identifiant de personne
export function makeResolver(persons) {
  const list = [...persons.values ? persons.values() : persons];
  return (lastOrName, g = null) => {
    if (!lastOrName) return null;
    const k = fold(lastOrName).toUpperCase().replace(/^(M\.|MME)\s+/, '');
    const parts = k.split(/\s+/);
    const last = parts[parts.length - 1];
    const first = parts.length > 1 ? parts[0] : null;
    let c = list.filter((p) => keyOf(p.last) === last);
    if (first) c = c.filter((p) => !p.first || fold(p.first).toUpperCase() === first);
    if (g) c = c.filter((p) => !p.gender || p.gender === g);
    c.sort((a, b) => (b.mentions?.length ?? b.mentionCount ?? 0) - (a.mentions?.length ?? a.mentionCount ?? 0));
    return c[0]?.id ?? null;
  };
}

// Personne entendue (témoin, gardé à vue, comparant)
export function findDeponent(doc, type, resolve) {
  const head = doc.pages[0].lines.slice(0, 18).join('\n');
  let m;
  if (type === 'AUDITION_TEMOIN' || type === 'AUDITION_GAV') {
    m = /Audition de (?:témoin|personne gardée à vue[^·]*)\s*·\s*((?:M\.|Mme)\s+[^\n·]+)/.exec(head);
  } else if (type === 'IPC') {
    m = /Personne comparante\s+((?:M\.|Mme)\s+\S+\s+\S+)/.exec(head);
  } else if (type === 'PV_GAV') {
    m = /Personne concernée\s+((?:M\.|Mme)\s+\S+\s+\S+)/.exec(head);
  }
  if (!m) return null;
  const name = m[1].trim().replace(/,.*$/, '');
  const g = /^Mme/.test(name) ? 'F' : 'M';
  const personId = resolve(name.replace(/^(M\.|Mme)\s+/, ''), g);
  const role = type === 'AUDITION_TEMOIN' ? 'TEMOIN' : 'MIS_EN_CAUSE';
  return personId ? { personId, role } : null;
}

// =============================== Déclarations ===============================
function windowFrom(f, fallbackEvening = true) {
  const a = /apres (\d{1,2})h(\d{2})?/.exec(f);
  if (a) return { start: +a[1] * 60 + (+a[2] || 0), end: 23 * 60 + 59, label: `après ${a[1]}h${a[2] || ''}` };
  if (/(toute la soiree|de la soiree|dans la soiree|toute la nuit)/.test(f)) return { start: 19 * 60, end: 23 * 60 + 59, label: 'toute la soirée' };
  return fallbackEvening ? { start: 19 * 60, end: 23 * 60 + 59, label: 'soirée (implicite)', implicit: true } : null;
}

export function statementZones(text, type) {
  const zones = [];
  if (type === 'AUDITION_TEMOIN' || type === 'AUDITION_GAV') {
    let start = text.search(/\bDéclarations\b/);
    if (start < 0) start = text.search(/déclare\s*:/);
    let end = text.search(/Lecture faite/);
    if (end < 0) end = text.length;
    const zone = text.slice(Math.max(0, start), end);
    const base = Math.max(0, start);
    const re = /(Question|Réponse)\s*:/g;
    let last = { kind: 'narratif', index: 0 };
    let question = '';
    const marks = [];
    let m;
    while ((m = re.exec(zone))) marks.push({ kind: m[1], index: m.index, len: m[0].length });
    const pieces = [];
    let prev = { kind: 'Réponse', index: 0, len: 0 };
    for (const mk of marks) {
      pieces.push({ kind: prev.kind, start: prev.index + prev.len, end: mk.index });
      prev = mk;
    }
    pieces.push({ kind: prev.kind, start: prev.index + prev.len, end: zone.length });
    for (const pc of pieces) {
      const t = zone.slice(pc.start, pc.end);
      if (pc.kind === 'Question') { question = t; continue; }
      zones.push({ offset: base + pc.start, text: t, question });
      question = '';
    }
    void last;
  }
  return zones;
}

export function extractStatements(doc, type, deponent, resolve, persons) {
  const dt = docText(doc);
  const out = [];
  const docF = fold(dt.text);
  const certainDoc = L.CERTAINTY.test(docF);
  const voiceHedgeDoc = /je ne peux pas le jurer|je pense que c'etait (lui|elle)/.test(docF);

  const handle = (speakerId, zoneText, zoneOffset, question, viaQuote = false) => {
    const sents = sentences(zoneText);
    sents.forEach((s, i) => {
      const f = fold(s.text);
      const abs = zoneOffset + s.start;
      const page = dt.pageAt(abs);
      const times = findTimes(s.text);
      const prevTimes = i > 0 ? findTimes(sents[i - 1].text) : [];
      const prev2Times = i > 1 ? findTimes(sents[i - 2].text) : [];
      const base = { docId: doc.id, page, speakerId, quote: s.text, viaQuote };
      const push = (o) => out.push({ ...base, ...o, hedged: L.HEDGES.test(f) || !!o.hedged });

      if (L.CLAIMS.AT_HOME.test(f)) push({ kind: 'AT_HOME', subjectId: speakerId, window: windowFrom(f, !viaQuote) });
      if (L.CLAIMS.NO_PHONE.test(f)) push({ kind: 'NO_PHONE', subjectId: speakerId, window: windowFrom(f) });
      const np = L.CLAIMS.NOT_AT_PLACE.exec(f);
      if (np) {
        let target = null;
        if (np[2] && np[1] !== 'lui' && np[1] !== 'elle') target = resolve(np[2]);
        if (!target && question) {
          const qm = /(?:M\.|Mme)\s+([A-ZÉÈ][A-ZÉÈËÏ'-]{2,})/.exec(question);
          if (qm) target = resolve(qm[1]);
        }
        push({ kind: 'NOT_AT_PLACE', subjectId: speakerId, targetId: target, window: windowFrom(f) });
      }
      if (L.CLAIMS.SLEEPING.test(f)) push({ kind: 'SLEEPING', subjectId: speakerId, at: times[0] ? { minutes: times[0].minutes, approx: times[0].approx } : null });
      const seen = L.CLAIMS.SEEN.exec(f);
      if (seen && !/(je n'ai (pas|rien) vu|n'avez vu|personne)/.test(f.slice(0, seen.index + 12))) {
        let subject = seen[3] && !['de', 'le', 'la', 'un', 'une', 'sur'].includes(seen[3]) ? resolve(seen[3]) : null;
        if (!subject && /je l'ai vu/.test(f) && question) {
          const qm = /(?:M\.|Mme)\s+([A-ZÉÈ][A-ZÉÈËÏ'-]{2,})/.exec(question);
          if (qm) subject = resolve(qm[1]);
        }
        const t = times[0] || prevTimes[0] || prev2Times[0] || null;
        const fromIdx = times[0] ? i : prevTimes[0] ? i - 1 : prev2Times[0] ? i - 2 : i;
        const quote = sents.slice(fromIdx, i + 1).map((x) => x.text).join(' ');
        const next = sents[i + 1] ? fold(sents[i + 1].text) : '';
        const place = (L.OUTSIDE_PLACES.exec(f) || L.OUTSIDE_PLACES.exec(next) || [])[1] || null;
        if (subject && subject !== speakerId) {
          push({ kind: 'SEEN', subjectId: subject, at: t ? { minutes: t.minutes, approx: t.approx, label: t.label } : null, place, certain: certainDoc, quote, page: dt.pageAt(zoneOffset + sents[fromIdx].start) });
        }
      }
      if (L.CLAIMS.HEARD.test(f)) {
        const t = times[0] || null;
        const placeM = /chez (?:m\.|mme)\s+([a-z-]+)/.exec(f);
        push({ kind: 'HEARD', at: t ? { minutes: t.minutes, approx: t.approx, label: t.label } : null, placeOfId: placeM ? resolve(placeM[1]) : null });
      }
      const v = L.CLAIMS.VOICE_ID.exec(f);
      if (v) push({ kind: 'VOICE_ID', subjectId: resolve(v[3]), hedged: L.HEDGES.test(f) || voiceHedgeDoc });
      if (L.CLAIMS.VOICE_UNKNOWN.test(f)) push({ kind: 'VOICE_UNKNOWN' });
      const ms = L.CLAIMS.MESSAGE_SENT.exec(f);
      if (ms) push({ kind: 'MESSAGE_SENT', subjectId: speakerId, at: times[0] ? { minutes: times[0].minutes, approx: times[0].approx, label: times[0].label } : null, to: ms[4] });
      if (/je l'ai appele vers/.test(f) && times[0]) push({ kind: 'CALLED_VICTIM', at: { minutes: times[0].minutes, approx: times[0].approx, label: times[0].label } });
    });
  };

  // 1) Auditions : zones de déclarations de la personne entendue
  if (deponent && (type === 'AUDITION_TEMOIN' || type === 'AUDITION_GAV')) {
    for (const z of statementZones(dt.text, type)) handle(deponent.personId, z.text, z.offset, z.question);
  }
  // 2) Propos rapportés entre guillemets dans les PV : « ... »
  const reQuote = /((?:M\.|Mme)\s+(?:[A-ZÉ][a-zéèëï]+\s+)?[A-ZÉÈ][A-ZÉÈËÏ'-]{2,})([^«]{0,200}?)(?:déclare|indique|précise)[^«]{0,40}«\s*([^»]+?)\s*»/g;
  if (type !== 'AUDITION_TEMOIN' && type !== 'AUDITION_GAV') {
    for (const m of dt.text.matchAll(reQuote)) {
      const g = /^Mme/.test(m[1]) ? 'F' : 'M';
      const sp = resolve(m[1].replace(/^(M\.|Mme)\s+/, ''), g);
      if (sp) handle(sp, m[3], m.index + m[0].indexOf(m[3]), '', true);
    }
    const ipc = /la personne (?:mise en examen )?déclare\s*:\s*«\s*([^»]+?)\s*»/i.exec(dt.text);
    if (ipc && deponent) handle(deponent.personId, ipc[1], ipc.index + ipc[0].indexOf(ipc[1]), '', false);
  }
  // Rattache identification / non-identification de voix au dernier "HEARD" du même passage
  let lastHeard = null;
  for (const s of out) {
    if (s.kind === 'HEARD') lastHeard = s;
    if ((s.kind === 'VOICE_ID' || s.kind === 'VOICE_UNKNOWN') && lastHeard) {
      s.heard = { docId: lastHeard.docId, page: lastHeard.page, quote: lastHeard.quote, at: lastHeard.at, placeOfId: lastHeard.placeOfId };
    }
  }
  void persons;
  return out;
}

// =============================== Fadettes ===============================
const ROW_RE = /^(\d+)\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+(VOIX|SMS|DATA)\s+(ENTRANT|SORTANT|-)\s+(0\d(?: \d\d){4}|-)\s+(\d{2}:\d{2}:\d{2}|-|[\d,]+ Mo)\s+(\d{5}-\d{4})$/;

export function extractPhone(doc, resolve) {
  const flat = doc.pages.map((p) => p.flat).join(' ');
  const own = /Ligne concernée\s+(0\d(?: \d\d){4})\s*·?\s*titulaire[^:]*:\s*(M\.|Mme)\s+([A-ZÉ][a-zé]+)\s+([A-ZÉ][A-Z]+)/.exec(flat);
  const owner = own ? { number: own[1], personId: resolve(`${own[3]} ${own[4]}`), name: `${own[3]} ${own[4]}` } : null;
  const directory = {};
  for (const m of flat.matchAll(/(0\d(?: \d\d){4})\s+(M\.|Mme)\s+([A-ZÉ][a-zé]+)\s+([A-ZÉ][A-Z]+)/g)) {
    directory[m[1]] = { name: `${m[3]} ${m[4]}`, personId: resolve(`${m[3]} ${m[4]}`) };
  }
  const rows = [];
  for (const p of doc.pages) {
    for (const line of p.lines) {
      const r = ROW_RE.exec(line.trim());
      if (!r) continue;
      rows.push({
        n: +r[1], date: `${r[4]}-${r[3]}-${r[2]}`, time: `${r[5]}:${r[6]}:${r[7]}`, minutes: +r[5] * 60 + +r[6],
        type: r[8], dir: r[9], corr: r[10], dur: r[11], cell: r[12], page: p.n, quote: line.trim(),
      });
    }
  }
  return { docId: doc.id, owner, directory, rows };
}

// =============================== Scellés ===============================
const SEAL_RE = /scell[ée]s?\s+(?:n°\s?|no\s?)?(\d+|[A-Z]{3,}-[A-Z]{2,})/gi;

export function extractSeals(doc) {
  const out = [];
  for (const p of doc.pages) {
    const sents = sentences(p.flat);
    sents.forEach((s, i) => {
      for (const m of s.text.matchAll(SEAL_RE)) {
        const after = s.text.slice(m.index + m[0].length);
        if (/^\s*(à|a|et)\s+n°/.test(after)) continue;
        const stopA = after.search(/scell[ée]/i);
        const afterSeg = fold(stopA >= 0 ? after.slice(0, stopA) : after).slice(0, 120);
        const beforeRaw = s.text.slice(0, m.index);
        const prevSeal = [...beforeRaw.matchAll(/scell[ée]s?\s+(?:n°\s?)?\S+/gi)].pop();
        const beforeSeg = fold(prevSeal ? beforeRaw.slice(prevSeal.index + prevSeal[0].length) : beforeRaw).slice(-110);
        let obj = /ADN$/i.test(m[1]) ? L.SEAL_OBJECTS.find((o) => o.key === 'buccal') : L.SEAL_OBJECTS.find((o) => o.re.test(afterSeg.slice(0, 60)));
        if (!obj) {
          let best = null, bestIdx = -1;
          for (const o of L.SEAL_OBJECTS) {
            const mm = [...beforeSeg.matchAll(new RegExp(o.re.source, 'g'))].pop();
            if (mm && mm.index > bestIdx) { best = o; bestIdx = mm.index; }
          }
          obj = best;
        }
        // Phrase commençant par un pronom ("Ils ont été placés sous scellé n°7") : l'objet est dans la phrase précédente
        if (!obj && i > 0 && /^(ils?|elles?|ceux-ci|celles-ci|le tout|l'ensemble)\b/i.test(s.text)) obj = L.SEAL_OBJECTS.find((o) => o.re.test(fold(sents[i - 1].text)));
        out.push({ docId: doc.id, page: p.n, number: m[1].toUpperCase(), object: obj?.key ?? null, objectLabel: obj?.label ?? null, quote: clip(s.text, 260) });
      }
    });
  }
  return out;
}

// =============================== Faits procéduraux ===============================
function dt(iso, minutes) { return { date: iso, minutes }; }
function hhmm(str) { const m = /(\d{1,2})h(\d{2})/.exec(str); return m ? +m[1] * 60 + +m[2] : null; }

export function extractProcedural(docs, types, metas) {
  const P = { dml: null, demandeActes: null, detention: null, gav: {}, extractedDates: [] };
  for (const d of docs) {
    const type = types[d.id];
    const text = docText(d);
    const T = text.text;
    const src = (idx, quote) => ({ docId: d.id, page: text.pageAt(idx), quote: clip(quote, 240) });
    if (type === 'DML' || type === 'DEMANDE_ACTES') {
      const rec = /Reçue le (\d{2}\/\d{2}\/\d{4}) à (\d{1,2}h\d{2})/.exec(T);
      const com = /Communiquée au parquet le (\d{2}\/\d{2}\/\d{4}) à (\d{1,2}h\d{2})/.exec(T);
      const entry = {
        received: rec ? { ...dt(findDates(rec[1])[0].iso, hhmm(rec[2])), src: src(rec.index, rec[0]) } : null,
        communicated: com ? { ...dt(findDates(com[1])[0].iso, hhmm(com[2])), src: src(com.index, com[0]) } : null,
        docId: d.id, docDate: metas[d.id]?.date,
      };
      if (type === 'DML') P.dml = entry; else P.demandeActes = entry;
    }
    if (type === 'ORDONNANCE_DETENTION') {
      const f = /Fait en notre cabinet, le ((?:1er|\d{1,2}) \S+ \d{4}) à (\d{1,2}h\d{2})/.exec(T);
      const o = /ORDONNONS le placement en détention provisoire[^.]*\./.exec(T);
      if (f) P.detention = { ...dt(findDates(f[1])[0].iso, hhmm(f[2])), src: src(f.index, (o ? o[0] + ' ' : '') + f[0]) };
    }
    if (type === 'PV_GAV') {
      const date = metas[d.id]?.date;
      const i = /procédons à son interpellation à (\d{1,2}h\d{2})/.exec(T);
      const s = /placé en garde à vue à compter de (\d{1,2}h\d{2})/.exec(T);
      const e = /jusqu'au (\d{2}\/\d{2}\/\d{4}) à (\d{1,2}h\d{2})/.exec(T);
      if (i) P.gav.interpellation = { ...dt(date, hhmm(i[1])), src: src(i.index, sentenceAround(T, i.index)) };
      if (s) P.gav.declaredStart = { ...dt(date, hhmm(s[1])), src: src(s.index, sentenceAround(T, s.index)) };
      if (e) P.gav.declaredEnd = { ...dt(findDates(e[1])[0].iso, hhmm(e[2])), src: src(e.index, sentenceAround(T, e.index)) };
    }
    if (type === 'PROLONGATION_GAV') {
      const f = /Fait au parquet[^,]*, le ((?:1er|\d{1,2}) \S+ \d{4}) à (\d{1,2}h\d{2})/.exec(T);
      if (f) P.gav.prolongation = { ...dt(findDates(f[1])[0].iso, hhmm(f[2])), src: src(f.index, f[0]) };
    }
    const lev = /(\d{2}\/\d{2}\/\d{4})[^.;]{0,20}Levée de la garde à vue à (\d{1,2}h\d{2})/.exec(T);
    if (lev && !P.gav.end) P.gav.end = { ...dt(findDates(lev[1])[0].iso, hhmm(lev[2])), src: src(lev.index, lev[0]) };
    // Dates-butoirs écrites dans les pièces
    if (type !== 'PV_GAV') {
      for (const m of T.matchAll(/(avant le|au plus tard le|jusqu'au)\s+(\d{2}\/\d{2}\/\d{4})/g)) {
        const sent = sentenceAround(T, m.index);
        const label = type === 'ORDONNANCE_EXPERTISE' ? "Dépôt du rapport d'expertise" : type === 'COMMISSION_ROGATOIRE' ? 'Retour de la commission rogatoire' : clip(sent, 90);
        P.extractedDates.push({ date: findDates(m[2])[0].iso, label, docId: d.id, docType: type, src: src(m.index, sent) });
      }
    }
  }
  return P;
}

function sentenceAround(T, idx) {
  const start = Math.max(T.lastIndexOf('. ', idx) + 2, 0);
  let end = T.indexOf('. ', idx);
  if (end < 0) end = T.length; else end += 1;
  return T.slice(start, end).trim();
}

// =============================== Vidéoprotection ===============================
export function extractCameras(docs, types) {
  const inst = new Map();
  const generic = [];
  for (const d of docs) {
    const text = docText(d);
    const sents = sentences(text.text);
    sents.forEach((s, si) => {
      const f = fold(s.text);
      if (!L.CAMERA.test(f)) return;
      const id = /\b([a-z]{2}-\d{2,4})\b/.exec(f)?.[1];
      const place = L.CAMERA_PLACES.find((w) => f.includes(w));
      const key = id ? id.toUpperCase() : place ? place.toUpperCase() : null;
      const request = L.REQUEST_VERB.test(f) || /(exploiter|requerons|requisition)/.test(f);
      const mention = { docId: d.id, docType: types[d.id], page: text.pageAt(s.start), quote: clip(s.text, 280), request };
      // Durée de conservation : même phrase ou deux phrases suivantes parlant des images
      let ret = null;
      for (const x of sents.slice(si, si + 3)) {
        const fx = fold(x.text);
        if (x !== s && !/(images|enregistr)/.test(fx)) continue;
        if (L.RETENTION.test(fx)) { ret = findDurations(x.text).find((y) => y.unit === 'day' || y.unit === 'month'); if (ret) { ret.quote = x.text; break; } }
      }
      if (!key) { generic.push(mention); return; }
      if (!inst.has(key)) inst.set(key, { key, label: id ? `Caméra ${id.toUpperCase()}` : `Caméra (${place})`, mentions: [], retention: null });
      const c = inst.get(key);
      c.mentions.push(mention);
      if (ret && !c.retention) c.retention = { days: ret.unit === 'month' ? 30 * ret.n : ret.n, raw: ret.raw, src: { ...mention, quote: clip(ret.quote, 280) } };
    });
  }
  for (const c of inst.values()) {
    c.docs = [...new Set(c.mentions.map((m) => m.docId))];
    c.exploited = c.mentions.some((m) => m.docType === 'VIDEO');
    c.requested = c.mentions.some((m) => m.request);
    c.singleSource = c.docs.length === 1;
  }
  return { cameras: [...inst.values()], generic };
}

// =============================== Biens de la victime ===============================
export function extractValuables(docs, types) {
  const out = [];
  for (const v of L.VALUABLES) {
    const owned = [], absent = [], found = [];
    for (const d of docs) {
      const text = docText(d);
      for (const s of sentences(text.text)) {
        const f = fold(s.text);
        const ref = { docId: d.id, page: text.pageAt(s.start), quote: clip(s.text, 260) };
        if (types[d.id] === 'AUDITION_TEMOIN' && v.owned.test(f)) owned.push(ref);
        if (v.absent.test(f)) absent.push(ref);
        if (new RegExp(`${v.key}[^.]{0,40}(retrouvee|decouverte|saisie|restituee)`).test(f) && !/aucun/.test(f)) found.push(ref);
      }
    }
    if (owned.length && absent.length && !found.length) out.push({ key: v.key, label: v.label, owned, absent });
  }
  return out;
}

// =============================== Actes et pièces attendus ===============================
const PENDING = /(en attente|attendus?|(non|pas) parvenue|seront communiques|sera verse|des reception|aux fins d'extraction)/;

export function extractExpectations(docs, types) {
  const out = [];
  for (const e of L.EXPECT) {
    const sources = [];
    for (const d of docs) {
      if (e.fulfilledBy.includes(types[d.id])) continue;
      const text = docText(d);
      for (const s of sentences(text.text)) {
        const f = fold(s.text);
        if (e.re.test(f) && L.REQUEST_VERB.test(f)) sources.push({ docId: d.id, page: text.pageAt(s.start), quote: clip(s.text, 280), pending: PENDING.test(f) });
      }
    }
    // Les mentions "en attente / sera versé / non parvenue" sont les plus explicites : elles passent en tête
    sources.sort((a, b) => (b.pending ? 1 : 0) - (a.pending ? 1 : 0));
    if (sources.length) out.push({ ...e, sources });
  }
  return out;
}
