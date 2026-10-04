// Détecteurs : incohérences entre pièces, pièces et actes manquants, éléments mentionnés sans suite.
// Règle d'or : on signale une incompatibilité apparente et on la source ; on ne conclut jamais.

import { fmtTime, fmtDate, fmtDur, clip, fold } from './text.js';
import { typeLabel } from './classify.js';

const HUMAN = 'Ces éléments semblent incompatibles et nécessitent une vérification humaine.';
const src = (s) => ({ docId: s.docId, page: s.page, quote: s.quote });
const within = (w, min) => w && min >= w.start && min <= w.end;

export function detectContradictions(ctx) {
  const { statements, phone, events, seals, personsById, factsDate } = ctx;
  const out = [];
  const nm = (id) => {
    const p = personsById[id];
    return p ? `${p.gender === 'F' ? 'Mme' : 'M.'} ${p.first ? p.first + ' ' : ''}${p.last}` : 'une personne';
  };

  // 1) "Je ne suis pas sorti" vs "je l'ai vu dehors"
  const atHome = statements.filter((s) => s.kind === 'AT_HOME' && s.window);
  const seen = statements.filter((s) => s.kind === 'SEEN' && s.at);
  const bySubject = groupBy(atHome, (s) => s.subjectId);
  for (const [subj, claims] of bySubject) {
    const conflicts = seen.filter((s) => s.subjectId === subj && s.speakerId !== subj && claims.some((c) => within(c.window, s.at.minutes)));
    if (!conflicts.length) continue;
    const strong = conflicts.some((c) => c.certain && !c.hedged);
    const t = conflicts[0].at;
    out.push({
      category: 'FACTUELLE', level: strong ? 'FORTE' : 'A_VERIFIER', subjectId: subj, key: 'presence',
      title: `Présence hors du domicile ${t.approx ? 'vers ' : 'à '}${fmtTime(t.minutes)} : déclarations incompatibles`,
      summary: `${nm(subj)} déclare ne pas avoir quitté son domicile (${uniq(claims.map((c) => c.window.label)).join(', ')}). ${nm(conflicts[0].speakerId)} déclare l'avoir vu ${conflicts[0].place ? `sur le ${conflicts[0].place}` : 'hors de son domicile'} ${t.approx ? 'vers' : 'à'} ${fmtTime(t.minutes)}. ${HUMAN}`,
      sides: [
        { label: `Déclarations de ${nm(subj)}`, role: 'MIS_EN_CAUSE', items: dedupeDocs(claims).map(src) },
        { label: `Déclaration de ${nm(conflicts[0].speakerId)}`, role: 'TEMOIN', items: conflicts.map(src) },
      ],
      notes: [conflicts[0].certain ? 'Le témoin affirme avoir reconnu la personne et précise l\'heure (consultation de son téléphone).' : 'Le témoin exprime une incertitude.'],
    });
  }

  // 2) "Je n'ai plus touché à mon téléphone" vs relevés de l'opérateur
  for (const c of statements.filter((s) => s.kind === 'NO_PHONE' && s.window)) {
    for (const ph of phone) {
      if (ph.owner?.personId !== c.subjectId) continue;
      const day = ph.rows.filter((r) => r.date === factsDate);
      const active = day.filter((r) => r.dir === 'SORTANT' && r.type !== 'DATA' && within(c.window, r.minutes));
      if (!active.length) continue;
      const passive = day.filter((r) => r.type === 'DATA' && within(c.window, r.minutes));
      const msg = statements.find((s) => s.kind === 'MESSAGE_SENT' && s.subjectId === c.subjectId && s.at);
      const coherent = msg ? day.find((r) => r.type === 'SMS' && r.dir === 'SORTANT' && Math.abs(r.minutes - msg.at.minutes) <= 15) : null;
      const r0 = active[0];
      const corr = ph.directory[r0.corr]?.name;
      out.push({
        category: 'TECHNIQUE', level: 'FORTE', subjectId: c.subjectId, key: 'telephone',
        title: `Usage du téléphone après ${fmtTime(c.window.start)} : déclaration et relevés opérateur divergent`,
        summary: `${nm(c.subjectId)} déclare ne plus avoir utilisé son téléphone ${c.window.label}. Le relevé de l'opérateur mentionne ${active.length > 1 ? `${active.length} communications sortantes` : 'une communication sortante'} sur sa ligne, dont ${r0.type === 'VOIX' ? 'un appel' : 'un SMS'} à ${r0.time}${r0.dur !== '-' ? ` (durée ${fmtDur(r0.dur)})` : ''}${corr ? ` vers ${corr}` : ''}. ${HUMAN}`,
        sides: [
          { label: `Déclaration de ${nm(c.subjectId)}`, role: 'MIS_EN_CAUSE', items: [src(c)] },
          { label: "Relevé de l'opérateur", role: 'TECHNIQUE', items: active.map((r) => ({ docId: ph.docId, page: r.page, quote: r.quote })) },
        ],
        notes: [
          passive.length ? `${passive.length} session(s) de données dans la même plage non retenue(s) : elles peuvent être déclenchées automatiquement par le terminal.` : null,
          coherent ? `Élément cohérent avec la déclaration : SMS sortant à ${coherent.time} (message déclaré « vers ${fmtTime(msg.at.minutes)} »).` : null,
          'Le titulaire de la ligne n\'est pas nécessairement l\'utilisateur du terminal : point à vérifier (extraction du téléphone).',
        ].filter(Boolean),
        context: coherent ? [{ docId: ph.docId, page: coherent.page, quote: coherent.quote, label: 'SMS sortant cohérent avec la déclaration' }] : [],
      });
      break;
    }
  }

  // 3) Même événement, heures différentes (arrivée d'un équipage...)
  const arrivals = groupBy(events.filter((e) => e.kind === 'ARRIVAL' && e.actor), (e) => e.actor);
  for (const [actor, evs] of arrivals) {
    // chaque source garde son propre horaire : on regroupe les sources par horaire déclaré
    const byTime = groupBy(evs.flatMap((e) => e.sources.map((s) => ({ ...s, minutes: s.minutes ?? e.minutes, date: e.date }))), (s) => `${s.date}|${s.minutes}`);
    if (byTime.size < 2) continue;
    const groups = [...byTime.values()].sort((a, b) => (a[0].date + a[0].minutes).localeCompare(b[0].date + b[0].minutes) || a[0].minutes - b[0].minutes);
    if (new Set(groups.map((g) => g[0].date)).size > 1) continue;
    const delta = groups[groups.length - 1][0].minutes - groups[0][0].minutes;
    if (delta < 5 || delta > 90) continue;
    const who = actor === 'TV-12' ? "de l'équipage TV-12" : actor === 'OPJ' ? 'des OPJ' : actor === 'SMUR' ? 'du SMUR' : actor;
    const tech = groups.find((g) => g.some((s) => ctx.types?.[s.docId] === 'VIDEO'));
    out.push({
      category: 'TEMPORELLE', level: delta > 30 ? 'FORTE' : 'A_VERIFIER', key: `arrivee-${actor}`,
      title: `Heure d'arrivée ${who} : ${groups.map((g) => fmtTime(g[0].minutes)).join(' / ')}`,
      summary: `Les pièces mentionnent ${groups.length} heures d'arrivée différentes pour le même équipage (écart maximal de ${delta} minutes). Le système ne détermine pas quelle heure est exacte : vérification humaine requise.`,
      sides: groups.map((g) => ({ label: `${fmtTime(g[0].minutes)} selon ${[...new Set(g.map((s) => s.docId))].join(', ')}`, role: 'POLICE', items: g.map((s) => ({ docId: s.docId, page: s.page, quote: s.quote })) })),
      notes: [
        'Un écart peut résulter d\'une saisie a posteriori ou d\'horloges différentes ; il peut affecter la chronologie fine et le calcul de certains délais.',
        tech ? `Une source technique horodatée (${tech[0].docId}, vidéoprotection) situe l'arrivée à ${fmtTime(tech[0].minutes)} ; elle ne suffit pas, à elle seule, à trancher.` : null,
      ].filter(Boolean),
    });
  }

  // 4) Évolution des déclarations d'un même témoin (heure, identification)
  const heard = statements.filter((s) => s.kind === 'HEARD' && s.at);
  for (const [speaker, hs] of groupBy(heard, (s) => s.speakerId)) {
    const docsSet = uniq(hs.map((h) => h.docId));
    if (docsSet.length < 2) continue;
    const disputes = hs.filter((h) => /(cris|dispute)/.test(fold(h.quote)));
    if (disputes.length < 2) continue;
    const a = disputes[0], b = disputes[disputes.length - 1];
    const dt = Math.abs(a.at.minutes - b.at.minutes);
    const ids = statements.filter((s) => s.speakerId === speaker && (s.kind === 'VOICE_ID' || s.kind === 'VOICE_UNKNOWN'));
    const unknownIn = ids.filter((s) => s.kind === 'VOICE_UNKNOWN').map((s) => s.docId);
    const idIn = ids.filter((s) => s.kind === 'VOICE_ID');
    if (dt < 10 && !(unknownIn.length && idIn.length)) continue;
    const parts = [];
    if (dt >= 10) parts.push(`l'heure des cris passe de ${fmtTime(a.at.minutes)} (${a.docId}) à ${fmtTime(b.at.minutes)} (${b.docId})`);
    if (unknownIn.length && idIn.length) parts.push(`la personne déclare d'abord ne pas savoir qui criait (${unknownIn[0]}), puis pense reconnaître la voix de ${nm(idIn[0].subjectId)} (${idIn[0].docId})`);
    out.push({
      category: 'EVOLUTION', level: 'A_VERIFIER', key: `evolution-${speaker}`,
      title: `Évolution des déclarations de ${nm(speaker)}`,
      summary: `Entre ses déclarations successives, ${parts.join(' ; ')}. Les approximations (« vers ») peuvent expliquer une partie de l'écart. Vérification humaine requise.`,
      sides: [
        { label: `Première déclaration (${a.docId})`, role: 'TEMOIN', items: [src(a), ...ids.filter((s) => s.docId === a.docId).map(src)] },
        { label: `Déclaration ultérieure (${b.docId})`, role: 'TEMOIN', items: [src(b), ...ids.filter((s) => s.docId === b.docId).map(src)] },
      ],
      notes: ['Déclaration spontanée recueillie par l\'équipage puis audition formelle : point non abordé dans les auditions versées au dossier.'],
    });
  }

  // 5) "Je ne suis pas allé chez lui" vs reconnaissance de voix chez la victime
  for (const c of statements.filter((s) => s.kind === 'NOT_AT_PLACE' && s.targetId)) {
    const ids = statements.filter((s) => s.kind === 'VOICE_ID' && s.subjectId === c.subjectId && s.heard);
    for (const v of ids) {
      const h = v.heard;
      if (!h || h.placeOfId !== c.targetId || !within(c.window, h.at?.minutes)) continue;
      out.push({
        category: 'FACTUELLE', level: v.hedged ? 'A_VERIFIER' : 'FORTE', subjectId: c.subjectId, key: 'voix',
        title: `Présence chez la victime vers ${fmtTime(h.at.minutes)} : déclaration et reconnaissance de voix`,
        summary: `${nm(c.subjectId)} déclare ne pas être allé chez ${nm(c.targetId)}. ${nm(v.speakerId)} pense avoir reconnu sa voix lors d'une dispute chez ${nm(c.targetId)} vers ${fmtTime(h.at.minutes)}. ${v.hedged ? 'Le témoin exprime lui-même une incertitude (« je pense », « je ne peux pas le jurer ») : contradiction de faible intensité. ' : ''}Vérification humaine requise.`,
        sides: [
          { label: `Déclaration de ${nm(c.subjectId)}`, role: 'MIS_EN_CAUSE', items: [src(c)] },
          { label: `Déclaration de ${nm(v.speakerId)}`, role: 'TEMOIN', items: [src(h), src(v)] },
        ],
        notes: ['Reconnaissance de voix à travers un plafond : fiabilité à apprécier (une confrontation est sollicitée par la défense, cote C03).'],
      });
      break;
    }
  }

  // 6) Scellés : même objet, numéros différents / même numéro, objets différents
  const byObj = groupBy(seals.filter((s) => s.object), (s) => s.object);
  const byNum = groupBy(seals.filter((s) => s.object && /^\d+$/.test(s.number)), (s) => s.number);
  for (const [obj, list] of byObj) {
    const nums = groupBy(list, (s) => s.number);
    if (nums.size < 2) continue;
    const label = list[0].objectLabel;
    const collisions = [];
    for (const n of nums.keys()) {
      const others = [...(byNum.get(n) || [])].filter((s) => s.object !== obj);
      if (others.length) collisions.push(`le scellé n°${n} désigne aussi « ${others[0].objectLabel.toLowerCase()} » (${uniq(others.map((o) => o.docId)).join(', ')})`);
    }
    out.push({
      category: 'SCELLES', level: 'A_VERIFIER', key: `scelle-${obj}`,
      title: `${label} : numéros de scellé divergents (${[...nums.keys()].map((n) => 'n°' + n).join(' / ')})`,
      summary: `L'objet « ${label.toLowerCase()} » est désigné sous ${[...nums.entries()].map(([n, l]) => `le scellé n°${n} (${uniq(l.map((s) => s.docId)).join(', ')})`).join(' et sous ')}.${collisions.length ? ' Par ailleurs, ' + collisions.join(' ; ') + '.' : ''} Point de traçabilité à vérifier avant toute exploitation des résultats d'analyse.`,
      sides: [...nums.entries()].map(([n, l]) => ({ label: `Scellé n°${n}`, role: 'SCELLE', items: dedupeDocs(l).map(src) })),
      notes: ['Une erreur de numérotation peut fragiliser la chaîne de traçabilité des scellés (art. 56 CPP).'],
    });
  }

  const order = { FORTE: 0, A_VERIFIER: 1 };
  out.sort((a, b) => order[a.level] - order[b.level]);
  return out.map((c, i) => ({ id: `INC-${String(i + 1).padStart(2, '0')}`, status: 'OUVERTE', ...c }));
}

// =============================== Pièces manquantes ===============================
export function detectMissing(ctx) {
  const { docs, types, expectations, cameras, generic, valuables, checklist, procedural, refDate, contradictions, factsDate } = ctx;
  const present = new Set(Object.values(types));
  const missing = [];
  const matched = [];
  const docLabel = (id) => `${typeLabel(types[id])} (${id})`;

  for (const e of expectations) {
    const found = docs.filter((d) => e.fulfilledBy.includes(types[d.id])).map((d) => d.id);
    if (found.length) { matched.push({ label: e.label, requestedIn: uniq(e.sources.map((s) => s.docId)), foundIn: found }); continue; }
    const first = e.sources[0];
    const item = {
      kind: e.kind, label: e.label, basis: ['RÉFÉRENCE CROISÉE'], status: 'MANQUANT', level: e.level,
      why: `${docLabel(first.docId)} : « ${clip(first.quote, 200)} » Aucune pièce correspondante n'a été identifiée parmi les documents importés.`,
      sources: e.sources.slice(0, 5), linked: [],
    };
    if (e.kind === 'GENETIQUE') {
      const dl = procedural.extractedDates.find((x) => x.docType === 'ORDONNANCE_EXPERTISE');
      if (dl && dl.date >= refDate) {
        item.status = 'EN_ATTENTE'; item.level = 'SUIVI'; item.deadline = dl.date;
        item.why = `Expertise ordonnée (${dl.docId}) ; dépôt du rapport attendu avant le ${fmtDate(dl.date)}. Délai non expiré : résultat attendu, non manquant à ce jour.`;
        item.sources = [dl.src, ...e.sources.filter((s) => s.docId !== dl.docId)].slice(0, 5);
      }
    }
    if (e.kind === 'EXTRACTION_TEL') {
      const linked = contradictions.filter((c) => c.key === 'telephone');
      if (linked.length) { item.level = 'CRITIQUE'; item.linked = linked.map((c) => c.id); item.note = `Priorité relevée : la pièce attendue porte sur une contradiction ouverte (${linked.map((c) => c.id).join(', ')}).`; }
    }
    if (e.kind === 'PERSONNALITE') { item.status = 'A_PLANIFIER'; }
    missing.push(item);
  }

  // Caméras mentionnées sans réquisition ni exploitation
  for (const c of cameras) {
    if (c.exploited || c.requested) {
      if (c.exploited) matched.push({ label: `Exploitation ${c.label}`, requestedIn: uniq(c.mentions.filter((m) => m.request).map((m) => m.docId)), foundIn: uniq(c.mentions.filter((m) => m.docType === 'VIDEO').map((m) => m.docId)) });
      continue;
    }
    const m0 = c.mentions[0];
    const item = {
      kind: 'CAMERA', label: `Images de la ${c.label.toLowerCase().replace('caméra (', 'caméra du ').replace(')', '')}`,
      basis: ['MENTION ISOLÉE'], status: 'SANS_SUITE', level: c.retention ? 'CRITIQUE' : 'IMPORTANT',
      why: `Mentionnée uniquement dans ${docLabel(m0.docId)} : « ${clip(m0.quote, 220)} » Aucune autre pièce ne fait état d'une réquisition, d'une saisie ou d'une exploitation de ces images.${c.retention ? ` Durée de conservation déclarée : ${c.retention.raw}.` : ''}`,
      sources: c.mentions.map((m) => ({ docId: m.docId, page: m.page, quote: m.quote })), linked: [], retention: c.retention,
      note: (() => {
        const g = generic.filter((x) => x.request && ['COMMISSION_ROGATOIRE', 'REQUISITOIRE'].includes(x.docType));
        return g.length ? `Une demande générique existe (${uniq(g.map((x) => x.docId)).join(', ')} : « ${clip(g[0].quote.replace(/^\d\)\s*/, ''), 90)} ») sans pièce d'exécution visant cette caméra.` : null;
      })(),
    };
    missing.push(item);
  }

  // Biens de la victime non localisés
  if (valuables.length) {
    const all = valuables.flatMap((v) => [...v.owned, ...v.absent]);
    missing.push({
      kind: 'BIENS', label: `Biens de la victime non localisés (${valuables.map((v) => v.key === 'montre' ? 'montre' : 'argent liquide').join(', ')})`,
      basis: ['MENTION ISOLÉE'], status: 'SANS_SUITE', level: 'IMPORTANT',
      why: `${valuables.map((v) => `${v.label} : mentionné en ${uniq(v.owned.map((o) => o.docId)).join(', ')}, non retrouvé selon ${uniq(v.absent.map((o) => o.docId)).join(', ')}`).join(' ; ')}. Aucune pièce n'indique où se trouvent ces biens.`,
      sources: dedupeDocs(all).slice(0, 6), linked: [],
      note: 'Élément pouvant être pertinent à charge comme à décharge (l\'information est conduite à charge et à décharge, art. 81 CPP).',
    });
  }

  // Checklist procédurale (approche 2)
  const checklistResult = [];
  for (const it of checklist.items) {
    const found = docs.filter((d) => it.docTypes.includes(types[d.id])).map((d) => d.id);
    checklistResult.push({ ...it, found });
    if (found.length) continue;
    const already = missing.find((m) => L_EXPECT_TYPES(m.kind).some((t) => it.docTypes.includes(t)));
    if (already) { if (!already.basis.includes('CHECKLIST')) already.basis.push('CHECKLIST'); already.checklistRef = it.basis; continue; }
    missing.push({ kind: it.id, label: it.label, basis: ['CHECKLIST'], status: it.status || 'MANQUANT', level: it.level || 'IMPORTANT',
      why: `Élément attendu dans un dossier d'homicide (${it.basis}). Aucune pièce de ce type n'a été identifiée.`, sources: [], linked: [] });
  }
  void present; void factsDate;
  const order = { CRITIQUE: 0, IMPORTANT: 1, SUIVI: 2 };
  missing.sort((a, b) => order[a.level] - order[b.level]);
  return { missing: missing.map((m, i) => ({ id: `MAN-${String(i + 1).padStart(2, '0')}`, ...m })), matched, checklist: checklistResult };
}

const KIND_TYPES = { EXTRACTION_TEL: ['RAPPORT_EXTRACTION_TEL'], TOXICO: ['RAPPORT_TOXICO'], GENETIQUE: ['EXPERTISE_GENETIQUE'], CASIER: ['CASIER_B1'], PERSONNALITE: ['ENQUETE_PERSONNALITE'] };
function L_EXPECT_TYPES(kind) { return KIND_TYPES[kind] || []; }

// =============================== Utilitaires ===============================
export function groupBy(arr, f) {
  const m = new Map();
  for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
function uniq(a) { return [...new Set(a)]; }
function dedupeDocs(list) {
  const seen = new Set();
  return list.filter((s) => { const k = s.docId + '|' + s.quote; if (seen.has(k)) return false; seen.add(k); return true; });
}
