// Utilitaires texte français : normalisation, phrases, heures, dates.
// Module sans dépendance, utilisable dans le renderer Electron et sous Node (tests).

export function norm(s) {
  return String(s ?? '')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Minuscules sans accents (pour la recherche et les lexiques)
export function fold(s) {
  return norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const ABBREV = /(?:\b(?:M|Mme|Mlle|Me|Dr|Cne|Lt|art|av|cf|ex|St|n|p|al|etc|réf|Réf|N)\.)$/;

// Découpe en phrases en gardant les positions dans le texte source.
// Les retours à la ligne (fins de paragraphe) sont des frontières dures.
export function sentences(text) {
  const out = [];
  const re = /[.!?»]+(?=\s+[«"(]?[A-ZÀ-ÖØ-Ý0-9])|\n/g;
  let start = 0;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    if (m[0] !== '\n') {
      const chunk = text.slice(start, end);
      if (ABBREV.test(chunk.trimEnd().replace(/[.!?»]+$/, '') + '.') && m[0] === '.') continue;
    }
    pushSentence(out, text, start, m[0] === '\n' ? m.index : end);
    start = end;
  }
  pushSentence(out, text, start, text.length);
  return out;
}

function pushSentence(out, text, start, end) {
  const raw = text.slice(start, end);
  const lead = raw.length - raw.trimStart().length;
  const t = raw.trim();
  if (t) out.push({ text: t, start: start + lead, end: start + lead + t.length });
}

// ---------- Heures ----------
const HOUR_RE = /(?<![\d/:])([01]?\d|2[0-3])\s?(?:h|H|:)\s?([0-5]\d)?(?::([0-5]\d))?(?![\d/])/g;

export function findTimes(text) {
  const out = [];
  let m;
  HOUR_RE.lastIndex = 0;
  while ((m = HOUR_RE.exec(text))) {
    const raw = m[0];
    if (/:/.test(raw) && !m[2]) continue; // "12:" isolé
    // "24 heures", "2 h" suivis d'une lettre : durée, pas un horaire
    const after = text.charAt(m.index + raw.length);
    if (/[a-zà-ÿ]/i.test(after)) continue;
    if (/\s/.test(raw) && !m[2]) continue; // "22 h" sans minutes : trop ambigu
    const before = text.slice(Math.max(0, m.index - 22), m.index).toLowerCase();
    const hh = +m[1];
    const mm = m[2] ? +m[2] : 0;
    const ss = m[3] ? +m[3] : null;
    out.push({
      raw, index: m.index, end: m.index + raw.length,
      h: hh, m: mm, s: ss, minutes: hh * 60 + mm,
      approx: /(vers|environ|alentours|à peu près|a peu pres|aux environs)\s*$/.test(before.trim() + ' ') || /vers\s*$/.test(before),
      label: fmtTime(hh * 60 + mm),
    });
  }
  return out;
}

// "00:00:52" -> "52 s" ; "00:03:22" -> "3 min 22 s"
export function fmtDur(hms) {
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hms || '');
  if (!m) return hms;
  const [h, mi, s] = [+m[1], +m[2], +m[3]];
  return [h ? `${h} h` : '', mi ? `${mi} min` : '', s || (!h && !mi) ? `${s} s` : ''].filter(Boolean).join(' ');
}

export function fmtTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}

// ---------- Dates ----------
const MONTHS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
const DATE_NUM = /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/g;
const DATE_TXT = /(?<!\d)(1er|\d{1,2})\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/gi;

export function findDates(text) {
  const out = [];
  let m;
  DATE_NUM.lastIndex = 0;
  while ((m = DATE_NUM.exec(text))) {
    const d = +m[1], mo = +m[2], y = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push({ raw: m[0], index: m.index, end: m.index + m[0].length, iso: iso(y, mo, d) });
  }
  DATE_TXT.lastIndex = 0;
  while ((m = DATE_TXT.exec(text))) {
    const d = m[1].toLowerCase() === '1er' ? 1 : +m[1];
    const mo = MONTHS[fold(m[2])];
    out.push({ raw: m[0], index: m.index, end: m.index + m[0].length, iso: iso(+m[3], mo, d) });
  }
  return out.sort((a, b) => a.index - b.index);
}

export function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function fmtDate(isoStr) {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

const WORD_NUM = { un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, soixante: 60 };

// "quinze jours", "15 jours", "trois jours ouvrables", "un mois"
export function findDurations(text) {
  const out = [];
  const re = /(\d{1,3}|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|soixante)\s+(jours?|mois|ans?|heures?)(\s+ouvrables)?/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : WORD_NUM[fold(m[1])];
    const unit = fold(m[2]).replace(/s$/, '');
    out.push({ raw: m[0], index: m.index, n, unit: unit === 'an' ? 'year' : unit === 'moi' || unit === 'mois' ? 'month' : unit === 'heure' ? 'hour' : 'day', working: !!m[3] });
  }
  return out;
}

// ---------- Recherche ----------
const STOP = new Set(('a au aux avec ce ces cet cette dans de des du elle en et eux il ils je la le les leur lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y ete etre avoir ai as avons avez ont est sont etait suis plus tres bien fait faire dont ainsi cela ca lors sans sous entre apres avant depuis vers chez tout tous toute toutes quand comme si alors donc car puis aussi').split(' '));

// Mots fréquents dans les questions mais sans valeur de recherche
const QSTOP = new Set('selon piece pieces dossier sait quoi quel quelle quels quelles trouvait trouve trouvaient etait savons connait entre'.split(' '));

export function tokens(text) {
  const f = fold(text).replace(/\b(\d{1,2})[:h](\d{2})(?::\d{2})?/g, ' $1h$2 ').replace(/\b(\d{1,2}) ?h\b/g, ' $1h ');
  const out = [];
  for (const t of f.split(/[^a-z0-9°]+/)) {
    if (!t || t.length < 2 || STOP.has(t) || QSTOP.has(t)) continue;
    out.push(stem(t));
    const h = /^(\d{1,2})h\d{2}$/.exec(t); // "22h30" est aussi indexé comme "22h" (questions par tranche horaire)
    if (h) out.push(`${+h[1]}h`);
  }
  return out;
}

export function stem(t) {
  if (/\d/.test(t)) return t;
  let s = t.replace(/(ements?|ations?|itions?|ments?)$/, '').replace(/(euses?|eux|ees?|es|s|x)$/, '');
  if (s.length < 3) s = t;
  return s.length > 7 ? s.slice(0, 7) : s;
}

export function clip(s, n = 220) {
  s = norm(s);
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + ' …' : s;
}

export function uid(prefix, n) {
  return `${prefix}-${String(n).padStart(2, '0')}`;
}
