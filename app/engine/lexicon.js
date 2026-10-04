// Lexiques et motifs (texte replié : minuscules, sans accents).
// C'est la partie "contrôlée" du moteur : chaque motif est lisible et auditable.

export const TITLES = "(?:M\\.|Mme|Mlle|Me|Maître|Dr|Docteur|Capitaine|Cne|Lieutenant|Lt|Brigadier-chef|Brigadier|Gardien de la paix|GPX|Monsieur|Madame)";
export const FIRST = "[A-ZÉÈÊÀÂÎÏÔÛÇ][a-zéèêëàâäîïôöûüç]+(?:-[A-ZÉÈ][a-zéèêëàâäîïôöûüç]+)?";
export const LAST = "[A-ZÉÈÊËÀÂÎÏÔÛÇ][A-ZÉÈÊËÀÂÎÏÔÛÇ'\\-]{2,}";

// Mots en capitales qui ne sont pas des patronymes
export const NOT_NAMES = new Set(`PROCÈS-VERBAL POLICE NATIONALE TRIBUNAL JUDICIAIRE VALMONT CIC MCI SAMU SMUR OPJ APJ CSU CPP SNPS NEOTEL IMEI SIM DATA VOIX SMS
SORTANT ENTRANT ADN GAV DIPN SRIJ JLD AUTORISONS ORDONNONS GENEXIS CHU IML DML LPS SARL CDI QUESTION RÉPONSE ARTICLE COTE PAGE
FICHE INTERVENTION RAPPORT ORDONNANCE COMMISSION ROGATOIRE RÉQUISITOIRE INTRODUCTIF DOSSIER INSTRUCTION AFFAIRE PLANCHE PHOTOGRAPHIQUE
PHOTO IMAGE NON REPRODUITE MAIN COURANTE AUTOPSIE MÉDICO-LÉGALE EXAMEN TECHNIQUE PLACEMENT DÉTENTION PROVISOIRE INTERROGATOIRE
PREMIÈRE COMPARUTION RÉPONSE RÉQUISITION RELEVÉ PROLONGATION GARDE VUE OBJET DUBOIS-ADN TV-12 TV-07 VP-112 SALON SÉJOUR CHAMBRE
CUISINE ENTRÉE ACCÈS PARKING CENTRE SERVICE PARQUET CABINET PIÈCE FIN SYNTHÈSE INTERMÉDIAIRE ÉTAT INVENTAIRE MINISTÈRE COPIE`.split(/\s+/));

// Rôles déduits du contexte (fenêtre autour de la mention)
export const ROLE_CONTEXT = [
  { role: 'VICTIME', re: /victime\s*:?\s*$|sur la personne de\s*$|donne la mort a\s*$|defunt\s*:?\s*$|deces de\s*$|^,?\s*(?:ne le [\d/]+,?\s*)?(?:67 ans|decede)/ },
  { role: 'MIS_EN_CAUSE', re: /contre\s*$|personne concernee\s*$|personne comparante\s*$|gardee? a vue\s*·?\s*$/ },
];

export const ROLE_BY_TITLE = {
  'Me': 'AVOCAT', 'Maître': 'AVOCAT',
  'Capitaine': 'ENQUETEUR', 'Cne': 'ENQUETEUR', 'Lieutenant': 'ENQUETEUR', 'Lt': 'ENQUETEUR', 'Brigadier-chef': 'ENQUETEUR', 'Brigadier': 'ENQUETEUR',
  'Gardien de la paix': 'ENQUETEUR', 'GPX': 'ENQUETEUR', 'Dr': 'EXPERT', 'Docteur': 'EXPERT',
};

export const ROLE_AFTER = [
  { role: 'MAGISTRAT', re: /^[, ]+(substitut|procureur|juge d'instruction|juge des libertes|vice-procureur)|^, juge/ },
  { role: 'EXPERT', re: /^[, ]+(medecin|technicien|ingenieure?|expert|praticien)/ },
  { role: 'GREFFE', re: /^[, ]+greffi/ },
  { role: 'ENQUETEUR', re: /^[, ]+(capitaine|lieutenant|brigadier|gardien de la paix|officier de police|agent de police)/ },
  { role: 'PROCHE', re: /^[, ]+(son |sa |le |la )?(frere|soeur|fille|fils|epouse|epoux|mere|pere)\b|^, frere|^, fille/ },
];

export const ROLE_BEFORE = [
  { role: 'GREFFE', re: /greffiere?\s*$/ },
  { role: 'PROCHE', re: /(son frere|sa soeur|sa fille|son fils|frere de mon client)[, ]*$/ },
  { role: 'GARDIEN', re: /le gardien,\s*$/ },
];

export const ROLE_RANK = ['VICTIME', 'MIS_EN_CAUSE', 'TEMOIN', 'AVOCAT', 'MAGISTRAT', 'ENQUETEUR', 'EXPERT', 'GREFFE', 'PROCHE', 'GARDIEN', 'AUTRE'];
export const ROLE_LABEL = {
  VICTIME: 'Victime', MIS_EN_CAUSE: 'Mis en cause', TEMOIN: 'Témoin', AVOCAT: 'Avocat', MAGISTRAT: 'Magistrat', ENQUETEUR: 'Enquêteur',
  EXPERT: 'Expert / médecin', GREFFE: 'Greffe', PROCHE: 'Proche', GARDIEN: 'Gardien / syndic', AUTRE: 'Autre personne citée',
};

// ---------- Déclarations ----------
export const CLAIMS = {
  AT_HOME: /(je ne suis pas (re)?sortie?|pas (re)?sortie? de chez moi|je suis restee? chez moi|suis restee? (a la maison|a mon domicile)|pas quitte (mon appartement|mon domicile|chez moi))/,
  NO_PHONE: /((plus|pas) touche a mon (telephone|portable)|pas utilise mon (telephone|portable)|n'ai (appele|telephone a) personne)/,
  NOT_AT_PLACE: /je ne suis pas allee? chez (lui|elle|m\.|mme|monsieur|madame)\s*([a-z-]*)/,
  SLEEPING: /\bje dormais\b|me suis couchee? vers/,
  SEEN: /(j'ai vu|je l'ai vu|j'ai apercu|je l'ai apercu|j'ai croise)\s+(?:(m\.|mme|monsieur|madame)\s+)?([a-z-]+)?/,
  HEARD: /(j'ai entendu|j'ai pu entendre|nous avons entendu)[^.]{0,60}(cris|dispute|eclats de voix|bruit)/,
  VOICE_ID: /(reconnu|reconnaitre) la voix de\s+(?:(m\.|mme|monsieur|madame)\s+)?([a-z-]+)/,
  VOICE_UNKNOWN: /(je ne sais pas qui c'etait|sans pouvoir (l'|les )?identifier|je n'ai pas reconnu)/,
  MESSAGE_SENT: /(envoye|ecrit) un (message|sms|texto) a (mon|ma) (frere|soeur|mere|pere|amie?|collegue)/,
};

export const HEDGES = /(je pense|je crois|il me semble|je ne peux pas le jurer|je ne suis pas (sur|certaine?)|a peu pres|a quelques minutes pres|peut-etre)/;
export const CERTAINTY = /(oui[.,]? je le croise|je suis (certain|sure?)|j'ai regarde (mon telephone|l'heure)|aucun doute)/;
export const OUTSIDE_PLACES = /(palier|escalier|couloir|hall|rue|dehors|parking|cour|exterieur|ascenseur|cave)/;

// ---------- Pièces et actes attendus ----------
export const REQUEST_VERB = /(transmis|transmettons|requis|requiert|requerons|requisition|sollicite|ordonn|commettons|aux fins|reserves? pour|seront communiques|en attente|restent attendus|recueillir|demande d|a ete ordonnee)/;

export const EXPECT = [
  { kind: 'EXTRACTION_TEL', label: "Rapport d'extraction du téléphone", re: /(extraction (et d'exploitation )?(des donnees|du telephone)|rapport d'extraction|aux fins d'extraction)/, fulfilledBy: ['RAPPORT_EXTRACTION_TEL'], level: 'IMPORTANT' },
  { kind: 'TOXICO', label: 'Résultats des analyses toxicologiques', re: /toxicolog/, fulfilledBy: ['RAPPORT_TOXICO'], level: 'IMPORTANT' },
  { kind: 'GENETIQUE', label: "Rapport d'expertise génétique (ADN)", re: /(analyse|expertise|comparaison) genetique|profils? genetiques?/, fulfilledBy: ['EXPERTISE_GENETIQUE'], level: 'IMPORTANT' },
  { kind: 'CASIER', label: 'Bulletin n°1 du casier judiciaire', re: /bulletin n.?\s?1/, fulfilledBy: ['CASIER_B1'], level: 'IMPORTANT' },
  { kind: 'PERSONNALITE', label: 'Enquête de personnalité', re: /enquete de personnalite/, fulfilledBy: ['ENQUETE_PERSONNALITE'], level: 'SUIVI' },
  { kind: 'FADETTES', label: 'Relevés téléphoniques (opérateur)', re: /(requisition a l'operateur|fadettes)/, fulfilledBy: ['TELEPHONIE'], level: 'IMPORTANT' },
  { kind: 'TRACES', label: 'Rapport de comparaison de traces', re: /aux fins de comparaison(?! genetique)/, fulfilledBy: ['RAPPORT_TRACES'], level: 'IMPORTANT' },
  { kind: 'AUTOPSIE', label: "Rapport d'autopsie", re: /examen medico-legal|autopsie\)/, fulfilledBy: ['AUTOPSIE'], level: 'IMPORTANT' },
  { kind: 'VIDEO_VP', label: 'Exploitation de vidéoprotection', re: /extraction des images/, fulfilledBy: ['VIDEO'], level: 'IMPORTANT' },
  { kind: 'MAIN_COURANTE', label: 'Copie de la main courante citée', re: /copie de la main courante/, fulfilledBy: ['MAIN_COURANTE'], level: 'SUIVI' },
];

// ---------- Vidéoprotection ----------
export const CAMERA = /(camera|videoprotection|videosurveillance)/;
export const CAMERA_PLACES = ['hall', 'parking', 'ascenseur', 'escalier', 'pharmacie', 'superette', 'commerce', 'boulangerie'];
export const RETENTION = /(gardees?|conservees?|s'effacent|ecrasees?|enregistre sur)/;

// ---------- Biens de la victime ----------
export const VALUABLES = [
  { key: 'montre', label: 'Montre (en or) de la victime', owned: /(sa|une) montre/, absent: /(aucun bijou ni montre|aucune montre|ne porte pas de montre)/ },
  { key: 'argent', label: 'Argent liquide (environ 200 euros)', owned: /argent liquide/, absent: /(ne contient aucune somme d'argent|aucune somme d'argent)/ },
];

// ---------- Scellés : objets reconnus ----------
export const SEAL_OBJECTS = [
  { key: 'marteau', label: 'Marteau', re: /marteau/ },
  { key: 'telephone', label: 'Téléphone portable', re: /telephone|portable samsung/ },
  { key: 'sweat', label: 'Sweat-shirt gris', re: /sweat/ },
  { key: 'chaussures', label: 'Chaussures de sport', re: /chaussures|baskets/ },
  { key: 'verre', label: 'Verre brisé', re: /verre/ },
  { key: 'ecouvillon', label: 'Écouvillon (sang, palier)', re: /ecouvillon/ },
  { key: 'ongles', label: 'Prélèvements sous-unguéaux', re: /sous-ungue/ },
  { key: 'toxico', label: 'Prélèvements sanguins et urinaires', re: /prelevements sanguins|urinaires/ },
  { key: 'support', label: 'Support vidéo original', re: /support original/ },
  { key: 'buccal', label: 'Prélèvement buccal (ADN)', re: /buccal/ },
];

// ---------- Événements datés ----------
export const EVENT_KINDS = [
  { kind: 'CALL_17', re: /appel 17|au 17\b|alertait le 17|appele la police/ },
  { kind: 'DEATH_DECLARED', re: /deces (est )?constate|constate le deces|deces etait constate/ },
  { kind: 'ARRIVAL', re: /(arrivons|arrivee|arrivait|arrive sur|sur place|sommes requis)/ },
  { kind: 'DISPUTE', re: /(dispute|cris|eclats de voix)/ },
  { kind: 'THUD', re: /(bruit sourd|grand bruit|bruit de chute)/ },
  { kind: 'SIGHTING', re: /(j'ai vu|apercu|croise|descendre l'escalier)/ },
  { kind: 'CCTV_IN', re: /entre (dans l'immeuble )?par la porte principale|entre dans l'immeuble/ },
  { kind: 'CCTV_OUT', re: /sort par la porte principale|sort de l'immeuble/ },
  { kind: 'MISSED_CALL', re: /appel manque/ },
  { kind: 'LAST_CONTACT', re: /je l'ai appele vers|nous avons parle/ },
  { kind: 'INTERPELLATION', re: /interpellation|interpellons|interpelle/ },
  { kind: 'GAV', re: /garde a vue a compter|place en garde a vue/ },
  { kind: 'VICTIM_CALL', re: /appele m\. martin|appele m\. \w+ sur son/ },
];

export const ACTORS = [
  { actor: 'TV-12', re: /tv-12|equipage|police-secours|nous transportons immediatement/ },
  { actor: 'SMUR', re: /smur|samu/ },
  { actor: 'OPJ', re: /\bopj\b|garnier|delorme|brigade criminelle|vehicule banalise/ },
  { actor: 'IJ', re: /identite judiciaire|lecomte/ },
];

// Formulations interdites dans toute sortie générée (garde-fou "pas de décision judiciaire")
export const FORBIDDEN = [
  /\b(est|serait|semble) coupable\b/i, /\bculpabilit[ée] (est|semble) (établie|démontrée|probable)/i, /\b(il|elle) ment\b/i,
  /\bmensonges?\b/i, /\bmenteur\b/i, /\bil faut (le |la )?(poursuivre|condamner|incarcérer)\b/i, /\bdoit être (condamné|poursuivi|renvoyé)/i,
  /\bsuffi(t|sent|santes?) (à|pour) (condamner|établir la culpabilité)/i, /\best l'auteur\b/i, /\ba tué\b/i,
];
