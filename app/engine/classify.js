// Classification des pièces par règles pondérées (zone de titre fortement pondérée).
// Une pièce sous le seuil de confiance est marquée "à confirmer" et peut être soumise au LLM local.

import { fold } from './text.js';

export const DOC_TYPES = {
  FICHE_CIC: { label: "Fiche d'intervention (CIC)", family: 'Police', t: [/fiche d'intervention/, /main courante informatisee/], b: [/\bcic\b/, /equipage engage/] },
  PV_INTERVENTION: { label: "PV d'intervention", family: 'Police', t: [/intervention · constatations initiales|intervention\b.*constatations initiales/], b: [/police-secours/, /equipage/, /sommes requis/] },
  PV_CONSTATATIONS: { label: 'PV de constatations', family: 'Police', t: [/transport, constatations/, /constatations et mesures prises/], b: [/description des lieux/] },
  PLANCHE_PHOTO: { label: 'Planche photographique', family: 'Police technique', t: [/planche photographique/], b: [/photo \d/] },
  AUDITION_TEMOIN: { label: 'Audition de témoin', family: 'Auditions', t: [/audition de temoin/], b: [/prete serment/, /qualite de la personne entendue temoin/] },
  AUDITION_GAV: { label: 'Audition du mis en cause (GAV)', family: 'Auditions', t: [/audition de personne gardee a vue/], b: [/personne gardee a vue/, /droit de se taire|droit de faire des declarations/] },
  PV_GAV: { label: 'Interpellation et placement en GAV', family: 'Procédure', t: [/interpellation · placement en garde a vue|placement en garde a vue · notification/], b: [/notification des droits/, /article 63-1/] },
  PROLONGATION_GAV: { label: 'Prolongation de garde à vue', family: 'Procédure', t: [/autorisation de prolongation/], b: [/autorisons la prolongation/] },
  PERQUISITION: { label: 'PV de perquisition et saisies', family: 'Police', t: [/perquisition et saisies/], b: [/placement sous scelles/, /scelle n.?\s?\d/] },
  AUTOPSIE: { label: 'Rapport médico-légal (autopsie)', family: 'Expertises', t: [/rapport d'autopsie/, /autopsie medico-legale/], b: [/medecin legiste/, /levee de corps/] },
  VIDEO: { label: 'Exploitation vidéoprotection', family: 'Éléments techniques', t: [/exploitation des images de videoprotection/], b: [/horodatage/, /camera/] },
  TELEPHONIE: { label: 'Relevés téléphoniques (fadettes)', family: 'Éléments techniques', t: [/releve detaille des communications|fadettes/, /reponse a requisition judiciaire/], b: [/cellule/, /correspondant/] },
  RAPPORT_TRACES: { label: 'Rapport de comparaison de traces', family: 'Expertises', t: [/comparaison de traces/], b: [/identification criminelle/, /semelle/] },
  RAPPORT_LABO: { label: 'Rapport de laboratoire (biologie)', family: 'Expertises', t: [/recherche de traces biologiques/], b: [/sang latent/, /section biologie/] },
  TRANSMISSION_SCELLE: { label: 'Transmission de scellé', family: 'Procédure', t: [/transmission de scelle/], b: [/transmettons le scelle/] },
  REQUISITOIRE: { label: 'Réquisitoire introductif', family: 'Actes du juge et du parquet', t: [/requisitoire introductif/], b: [/requiert/] },
  IPC: { label: 'Interrogatoire de première comparution', family: 'Actes du juge et du parquet', t: [/interrogatoire de premiere comparution/], b: [/mis en examen/] },
  COMMISSION_ROGATOIRE: { label: 'Commission rogatoire', family: 'Actes du juge et du parquet', t: [/^commission rogatoire|commission rogatoire\s*$/m], b: [/donnons commission rogatoire/] },
  ORDONNANCE_EXPERTISE: { label: "Ordonnance de commission d'expert", family: 'Actes du juge et du parquet', t: [/ordonnance de commission d'expert/], b: [/commettons en qualite d'expert/] },
  SYNTHESE: { label: 'Rapport de synthèse', family: 'Police', t: [/rapport de synthese/], b: [/etat des investigations/] },
  MAIN_COURANTE: { label: 'Main courante', family: 'Antécédents', t: [/^main courante|main courante\s*$/m, /copie remise au declarant/], b: [/declarant/] },
  ORDONNANCE_DETENTION: { label: 'Ordonnance de placement en détention', family: 'Détention', t: [/ordonnance de placement/, /en detention provisoire/], b: [/mandat de depot/, /juge des libertes/] },
  DML: { label: 'Demande de mise en liberté', family: 'Détention', t: [/demande de mise en liberte/], b: [/article 148/] },
  DEMANDE_ACTES: { label: "Demande d'actes (art. 82-1)", family: 'Défense', t: [/demande d'actes/], b: [/article 82-1/] },
  INVENTAIRE: { label: 'Inventaire des pièces', family: 'Greffe', t: [/inventaire des pieces/, /dossier d'instruction n/, /cote\s+nature de la piece/], b: [] },
  // Types attendus mais absents du dossier de démonstration (reconnus s'ils sont importés)
  RAPPORT_EXTRACTION_TEL: { label: "Rapport d'extraction téléphonique", family: 'Éléments techniques', t: [/rapport d'extraction|extraction (et exploitation )?des donnees/], b: [/journal des appels/] },
  RAPPORT_TOXICO: { label: 'Rapport toxicologique', family: 'Expertises', t: [/rapport (complementaire )?(d'analyses? )?toxicologi/], b: [/alcoolemie|stupefiants/] },
  EXPERTISE_GENETIQUE: { label: "Rapport d'expertise génétique", family: 'Expertises', t: [/rapport d'expertise genetique/], b: [/profil genetique/] },
  CASIER_B1: { label: 'Bulletin n°1 du casier judiciaire', family: 'Personnalité', t: [/bulletin n.?\s?1/, /casier judiciaire national/], b: [/condamnation/] },
  ENQUETE_PERSONNALITE: { label: 'Enquête de personnalité', family: 'Personnalité', t: [/enquete de personnalite/], b: [/situation familiale/] },
  AUTRE: { label: 'Pièce non classée', family: 'Autres', t: [], b: [] },
};

const TITLE_LINES = 7;

export function classifyDoc(doc) {
  const first = doc.pages[0];
  const title = fold(first.lines.slice(0, TITLE_LINES).join('\n'));
  const body = fold(doc.pages.map((p) => p.flat).join(' ').slice(0, 6000));
  const scores = [];
  for (const [type, def] of Object.entries(DOC_TYPES)) {
    if (type === 'AUTRE') continue;
    let s = 0;
    for (const re of def.t) if (re.test(title)) s += 6;
    for (const re of def.b) if (re.test(body)) s += 1;
    if (s) scores.push({ type, s });
  }
  scores.sort((a, b) => b.s - a.s);
  const best = scores[0];
  const second = scores[1]?.s ?? 0;
  if (!best || best.s < 6) {
    return { type: 'AUTRE', confidence: best ? 0.3 : 0, method: 'règles', candidates: scores.slice(0, 3) };
  }
  const confidence = Math.min(0.99, 0.55 + 0.45 * ((best.s - second) / best.s));
  return { type: best.type, confidence: +confidence.toFixed(2), method: 'règles', candidates: scores.slice(0, 3) };
}

export function typeLabel(t) {
  return DOC_TYPES[t]?.label ?? t;
}
