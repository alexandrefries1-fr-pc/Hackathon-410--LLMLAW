# Dossier fictif « Affaire MARTIN / DUBOIS » : scénario et corrigé des anomalies

Ce document est le **corrigé** du Livrable A. Il sert à vérifier que l'application détecte ce qu'elle doit détecter, et rien de plus. Tout est fictif : personnes, adresses, ville (Valmont), organismes privés (NEOTEL, GENEXIS). Les numéros de téléphone utilisent les plages réservées à la fiction par l'ARCEP.

Fichiers :

- `dossier_fictif/pieces/` : 27 pièces, une par fichier (D01 à D24, C01 à C03) ;
- `dossier_fictif/DOSSIER_COMPLET_Affaire_Martin_Dubois.pdf` : le même dossier relié (78 pages, inventaire et signets), découpé automatiquement par cote à l'import ;
- `dossier_fictif/generate_dossier.py` : générateur reproductible (`py generate_dossier.py`).

## 1. Les faits (version « vérité terrain » du scénario)

Jeudi 24 septembre 2026, résidence Les Glycines à Valmont. M. Gérard MARTIN (67 ans, appartement 32) est retrouvé mort dans son séjour : traumatisme crânien par objet contondant à tête circulaire d'environ 3 cm. Son voisin de palier, M. Julien DUBOIS (appartement 31), est en conflit ancien avec lui (bruit, dégât des eaux, main courante de juin 2026 pour menaces). Il est interpellé dans la nuit, placé en garde à vue, mis en examen pour meurtre et placé en détention provisoire le 26/09/2026.

Le scénario est volontairement **ouvert** : des éléments vont dans des directions différentes (témoin qui l'aurait vu sortir, appel téléphonique, marteau humide avec traces de sang ; mais aussi silhouette non identifiée entrée à 21h58, accès parking non filmé, biens de la victime disparus, résultats négatifs sur le sweat et les chaussures). L'outil doit les faire remonter **sans conclure**.

## 2. Inventaire des pièces

| Cote | Pièce | Date |
|---|---|---|
| D01 | Fiche d'intervention CIC (main courante informatisée) | 24/09 |
| D02 | PV d'intervention police-secours (équipage TV-12) | 24/09 |
| D03 | PV de transport, constatations et mesures prises | 24/09 |
| D04 | Planche photographique et plan des lieux | 24-25/09 |
| D05 | Audition de témoin : Mme Sylvie LEROY (voisine du dessous) | 25/09 |
| D06 | Audition de témoin : M. Karim BENSAÏD (voisin de palier) | 25/09 |
| D07 | Audition de témoin : Mme Claire MARTIN (fille de la victime) | 25/09 |
| D08 | PV d'interpellation et de placement en garde à vue | 25/09 |
| D09 | Audition de garde à vue n°1 de M. DUBOIS | 25/09 |
| D10 | Autorisation de prolongation de garde à vue (parquet) | 26/09 |
| D11 | Audition de garde à vue n°2 de M. DUBOIS | 26/09 |
| D12 | PV de perquisition et saisies (scellés n°3 à 6) | 25/09 |
| D13 | Rapport d'autopsie | 27/09 |
| D14 | Exploitation de la vidéoprotection municipale VP-112 | 26/09 |
| D15 | Réponse opérateur : fadettes 01/07-25/09 (1 625 lignes, 35 pages) | 29/09 |
| D16 | Rapport de comparaison de traces de semelles | 30/09 |
| D17 | Rapport du laboratoire (recherche de sang) | 29/09 |
| D18 | PV de transmission du téléphone au SNPS pour extraction | 29/09 |
| D19 | Réquisitoire introductif | 26/09 |
| D20 | Interrogatoire de première comparution | 26/09 |
| D21 | Commission rogatoire | 28/09 |
| D22 | Ordonnance de commission d'expert (génétique) | 29/09 |
| D23 | Rapport de synthèse intermédiaire | 30/09 |
| D24 | Copie de la main courante du 14/06/2026 | 14/06 |
| C01 | Ordonnance de placement en détention provisoire | 26/09 |
| C02 | Demande de mise en liberté (reçue et communiquée au parquet le 02/10) | 01/10 |
| C03 | Demande d'actes art. 82-1 (reçue le 30/09) | 29/09 |

## 3. Anomalies volontaires et résultat attendu

| # | Catégorie | Où | Ce qui est planté | Résultat attendu dans l'app |
|---|---|---|---|---|
| 1 | Contradiction factuelle | D09, D11, D20 / D06 | DUBOIS : « Je ne suis pas sorti de chez moi après 21h », « resté chez moi toute la soirée ». BENSAÏD : l'a vu sur le palier, descendant l'escalier, vers 22h30 (heure vérifiée sur son téléphone). | **INC-01, forte contradiction** |
| 2 | Déclaration / élément technique | D09 / D15 p.35 | DUBOIS : « Après 21h, je n'ai plus touché à mon téléphone ». Fadettes : appel **sortant** à 22:33:17 (52 s) vers son frère, noyé dans 1 625 lignes. Une session DATA à 22:10 est volontairement présente et doit être écartée (automatique). Un SMS sortant à 20:58 est **cohérent** avec « un message à mon frère vers 21h ». | **INC-02, forte** ; note sur la session DATA écartée ; élément cohérent signalé |
| 3 | Contradiction temporelle | D02 / D01, D23 / D14 | Arrivée de l'équipage TV-12 : 22h54 (D02), 23h04 (D01, D23), 23h02 (vidéo, D14). | **INC-03, à vérifier**, trois horaires, sans trancher ; mention de la source technique |
| 4 | Évolution d'un témoignage | D02 / D05 | LEROY à chaud : cris « vers 22h00 », « je ne sais pas qui c'était ». En audition : dispute « vers 22h15 », pense reconnaître la voix de DUBOIS. Point non abordé en audition. | **INC-04, à vérifier** |
| 5 | Contradiction de faible intensité | D09 / D05 | DUBOIS : « Je ne suis pas allé chez lui ». LEROY : pense reconnaître sa voix chez la victime, avec hésitation (« je pense », « je ne peux pas le jurer »). | **INC-05, à vérifier** (et non « forte », grâce à la détection des hésitations) |
| 6 | Traçabilité des scellés | D12, D22 / D17 | Le marteau est le scellé n°5 (perquisition, ordonnance d'expertise) mais le laboratoire l'appelle scellé n°6, numéro qui désigne les chaussures (D12, D16). | **INC-06, à vérifier** |
| 7 | Pièce annoncée mais absente | D18, D23 | Téléphone transmis au SNPS « aux fins d'extraction », « rapport versé dès réception » : aucun rapport. | **MAN-01, critique** (priorité relevée car liée à INC-02) |
| 8 | Information présente dans une seule pièce | D06 p.2 | BENSAÏD signale une caméra du syndic dans le hall, images « gardées quinze jours ». Aucune réquisition, aucune exploitation (la commission rogatoire D21 est seulement générique). | **MAN-02, critique** + échéance **TECH-VID-01 : 09/10/2026** |
| 9 | Expertise demandée, résultat absent | D13, D23 | Prélèvements toxicologiques « résultats à suivre ». | **MAN-03, important** |
| 10 | Pièce sollicitée absente | D21, D23 | Bulletin n°1 du casier « sollicité le 25/09, réponse non parvenue ». | **MAN-04, important** |
| 11 | Mention isolée (à décharge possible) | D07 / D03, D12, D13 | La fille de la victime : montre en or toujours portée, environ 200 euros dans le buffet. Corps sans montre, tiroir ouvert sans argent, rien chez DUBOIS. | **MAN-05, important**, présenté « à charge et à décharge » |
| 12 | Expertise en cours (piège à faux positif) | D22 | Expertise ADN ordonnée, rapport attendu **avant le 30/10/2026** : délai non expiré. | **MAN-06, « résultat attendu »**, pas « manquant » |
| 13 | Checklist | D19 + checklist | Enquête de personnalité requise (obligatoire en matière criminelle, art. 81 CPP), non réalisée à ce stade. | **MAN-07, à planifier** |
| 14 | Échéance urgente | C02 | DML reçue et communiquée au parquet le 02/10/2026 : transmission au JLD dans les 5 jours (art. 148). | **CPP-148-A : 07/10/2026, critique** ; décision du JLD **CPP-148-B : 12/10/2026** (3 jours ouvrables, samedi puis dimanche reportés par l'art. 801) |
| 15 | Échéance de suivi | C03 | Demande d'actes reçue le 30/09/2026 (art. 82-1 : un mois). | **CPP-82-1 : 30/10/2026** |
| 16 | Contrôle procédural | D08, D10 | Interpellation à 00h35 mais garde à vue notifiée « à compter de 01h10 » ; prolongation autorisée à 00h50 le lendemain, soit 15 min après l'expiration calculée depuis l'appréhension (art. 63, III). Durée totale 38 h 25 : conforme. | **Contrôle CPP-63 : à vérifier** (2 points) + 1 point conforme |
| 17 | Dates écrites (non calculées) | D21, D22 | « avant le 30/11/2026 » (retour de CR), « avant le 30/10/2026 » (expert). | Affichées comme **dates extraites**, distinctes des échéances calculées |
| 18 | Détention | C01 | Détention provisoire du 26/09/2026 (art. 145-2 : un an en matière criminelle). | **CPP-145-2 : 26/09/2027, indicatif** |

## 4. Éléments volontairement cohérents (contrôle des faux positifs)

L'outil ne doit **pas** les signaler comme manquants ou contradictoires :

- fadettes demandées le 25/09 (D23) et versées (D15) ;
- comparaison de semelles demandée (D03) et versée (D16, non concluante) ;
- autopsie requise (D03) et versée (D13) ;
- images de la caméra municipale VP-112 requises (D03) et exploitées (D14) ;
- main courante citée par la fille de la victime (D07) et annexée (D24) ;
- arrivée du SMUR (23h17 vidéo / 23h19 CIC) et des OPJ (23h36 vidéo / 23h38 PV) : écarts de 2 minutes, fusionnés et non signalés ;
- décès constaté à 23h27 dans trois pièces concordantes ;
- SMS sortant de 20:58, cohérent avec la déclaration « message à mon frère vers 21h » ;
- Mme LEROY déclare ne pas être sortie de chez elle : personne ne dit le contraire.

## 5. Éléments à décharge que l'outil fait remonter

L'information est conduite à charge et à décharge (art. 81 CPP). L'outil liste notamment, avec leurs sources :

- silhouette non identifiée entrée à 21h58 et jamais revue sortir par la porte principale (D14) ;
- accès secondaire par le parking, non couvert par la caméra municipale (D03, D14) ;
- aucune trace de sang sur le sweat (D17) ni sur les chaussures ; trace de semelle « ni identifiée ni exclue » (D16) ;
- aucun sac noir découvert en perquisition (D12) ;
- biens de la victime non localisés (D07, D03, D13) ;
- jeune homme non identifié rendant visite à la victime (D07, D11, C03).
