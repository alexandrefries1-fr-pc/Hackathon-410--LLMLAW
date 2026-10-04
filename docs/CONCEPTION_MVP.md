# Local Criminal Case Copilot (LCCC) : conception du MVP

Hackathon Sciences Po × Mistral AI · version du 04/10/2026

> Un copilote local qui transforme un dossier pénal documentaire en une représentation structurée et actionnable : faits, chronologie, preuves, contradictions, pièces manquantes, échéances, actions. Chaque alerte est sourcée ; aucune décision n'est prise par la machine ; aucune pièce ne quitte le poste.

## 1. Ce qui est livré et testable

| Livrable | Contenu | État |
|---|---|---|
| **A. Dossier pénal fictif** | 27 pièces PDF cotées (D01 à D24, C01 à C03), 78 pages dont 35 pages de fadettes, plus un PDF relié avec inventaire. 6 incohérences, 7 pièces ou actes manquants, 1 échéance critique, 1 contrôle de garde à vue, 1 risque de perte de preuve. Corrigé : `docs/SCENARIO_ET_ANOMALIES.md`. | Fait, générateur reproductible |
| **B. Application desktop** | Electron, Windows et macOS. Import (glisser-déposer, fichiers, dossier, PDF relié), extraction, classification, chronologies, personnes, preuves, incohérences, manques, moteur d'échéances, actions, Case Graph, questions au dossier, visionneuse de sources avec surlignage. | Fait, testé de bout en bout |
| **Moteur** | JavaScript sans dépendance, exécutable dans l'app et sous Node (`npm run test:engine`). Analyse du dossier complet en 2 à 4 s sur un portable. | Fait |
| **LLM local** | Ollama + Ministral 3 (Apache 2.0). Lecture neutre des incohérences, réponses citées, classification de repli. Garde-fous et contrôle des citations. | Fait (3B testé sur ce poste ; 8B ou 14B recommandés) |

Résultat mesuré sur le dossier de démonstration : 27/27 pièces correctement classées ; les 6 incohérences plantées détectées avec le bon niveau ; 7/7 manques ; échéances et contrôle exacts ; 0 faux positif sur les éléments cohérents listés dans le corrigé.

## 2. Architecture

```
┌──────────────────────────── Poste du magistrat ────────────────────────────┐
│                                                                             │
│  Interface Electron (renderer sandboxé, aucun accès réseau, CSP stricte)    │
│   ├─ pdf.js : texte page par page, reconstruction des lignes et paragraphes │
│   ├─ Segmentation par cote (« Cote D05 » en marge)                          │
│   ├─ Classification (règles pondérées ; repli Mistral si doute)             │
│   ├─ Extraction structurée : personnes, déclarations normalisées, horaires, │
│   │   scellés, fadettes, actes, caméras, biens, demandes d'expertise        │
│   ├─ Chronologies (faits / procédure) avec fusion multi-sources             │
│   ├─ Case Graph ─► Détecteurs (contradictions, manques, mentions isolées)   │
│   ├─ Moteur de règles CPP (JSON) ─► échéances, contrôles, actions           │
│   ├─ Index BM25 local ─► questions au dossier (RAG)                         │
│   └─ Visionneuse : page exacte + passage surligné                           │
│                                                                             │
│  Processus principal (Node)                                                 │
│   ├─ Coffre AES-256-GCM, clé protégée par DPAPI / Keychain (safeStorage)    │
│   ├─ Garde réseau : toute requête non locale est annulée                    │
│   └─ Pont LLM : uniquement http://127.0.0.1:11434                           │
│                                                                             │
│  Ollama + Ministral 3 (3B / 8B / 14B), exécution 100 % locale               │
└─────────────────────────────────────────────────────────────────────────────┘
        ▲ seule sortie possible, sur action explicite : métadonnées d'échéances
          (dossier pseudonymisé, date, priorité, type, règle), contrôlées
```

Principe directeur : **les règles détectent, le LLM explique, l'humain décide.** Les détections critiques ne dépendent pas du LLM ; elles sont déterministes, reproductibles et auditables. Le LLM apporte la souplesse linguistique là où elle est utile et sans risque : reformuler une incohérence, proposer des vérifications, répondre à une question libre en citant ses sources.

### Pourquoi Electron (et pas Swift ou Tauri)

| Critère | Electron | Swift | Tauri |
|---|---|---|---|
| Équipe sur Windows et Mac | Oui | Mac seulement | Oui |
| Temps de prototypage | Faible (HTML/JS) | Moyen | Moyen (Rust côté hôte) |
| Rendu PDF et surlignage | pdf.js, mature | PDFKit, excellent | pdf.js |
| Isolation réseau contrôlable | Oui (session, CSP, sandbox) | Oui | Oui |
| Taille du binaire | ~100 Mo | Faible | Faible |

Electron l'emporte pour un hackathon à trois sur plateformes mixtes. Une version produit pourrait passer à Tauri pour réduire l'empreinte, sans toucher au moteur (JavaScript pur).

## 3. Modèle Mistral

| Usage | Modèle recommandé | Remarque |
|---|---|---|
| Portable 16 Go, sans GPU | `ministral-3:8b` | Bon compromis qualité / vitesse |
| Mac Apple Silicon 32 Go ou GPU | `ministral-3:14b` | Meilleure lecture juridique ; 256 k de contexte |
| Machine faible (démo de secours) | `ministral-3:3b` | Testé ici : ~9 tokens/s en génération, ~45 tokens/s en lecture, ~15 s par explication sur un i5 sans GPU |
| Serveur de juridiction (V2) | Mistral Small 4 | 119 B paramètres en MoE : hors de portée d'un portable, possible sur une infrastructure souveraine interne |

Les Ministral 3 sont sous licence Apache 2.0, multilingues, avec appel d'outils et sorties structurées : adaptés à un déploiement local dans le service public.

**Constat honnête issu des tests** : sur une vérification de contradiction, le 3B a répondu « indéterminé » à une contradiction évidente et a employé une formule de jugement (« comportement suspect »). Cela justifie le choix d'architecture : la détection reste déterministe, la sortie du LLM est structurée (JSON), filtrée par des garde-fous et toujours accompagnée des extraits qui, eux seuls, font foi.

## 4. RAG local

- **Découpage** : chaque page est découpée en passages de 650 caractères au plus, alignés sur les phrases ; chaque passage garde sa pièce et sa page.
- **Index** : BM25 avec repli des accents, racinisation légère et normalisation des heures (« 22:33 » et « 22h33 » se retrouvent). Choix délibéré : les requêtes juridiques portent sur des noms, des heures et des cotes exacts ; BM25 est déterministe, rapide et sans dépendance.
- **Génération** : les 5 meilleurs passages sont fournis à Mistral avec la consigne de citer chaque phrase `[D06 p.1]` et de répondre « Information non trouvée » sinon.
- **Contrôle** : vérification automatique que chaque paragraphe porte une citation et que chaque référence existe ; les références invalides sont signalées en rouge ; les formulations interdites sont retirées. Essai réel avec le 3B : malgré la consigne d'attribution, une réponse a présenté la déclaration d'un témoin comme un fait ; la phrase non sourcée a été signalée automatiquement. D'où la recommandation du 8B ou du 14B pour la démo.
- **Recherche augmentée par le Case Graph** : si la question nomme un protagoniste, ses déclarations structurées et les éléments techniques des incohérences qui le visent sont ajoutés aux passages BM25. Sans cela, la question « où se trouvait M. DUBOIS entre 22h et 23h ? » ne remontait ni le témoin de 22h30 ni l'appel de 22h33.
- **V2** : recherche hybride avec des plongements locaux (par exemple bge-m3 via Ollama) et fusion des rangs.

## 5. Format de données interne

Une analyse est un objet JSON `lccc.analysis/1`, chiffré sur disque. Extraits :

```json
{
  "documents": [{ "id": "D06", "type": "AUDITION_TEMOIN", "confidence": 0.94, "date": "2026-09-25", "fileId": "F009", "filePages": [1, 2] }],
  "persons": [{ "id": "P-DUBOIS-JULIEN", "name": "Julien DUBOIS", "role": "MIS_EN_CAUSE", "docs": ["D09", "D11"] }],
  "statements": [{ "kind": "SEEN", "speakerId": "P-BENSAID-KARIM", "subjectId": "P-DUBOIS-JULIEN",
                   "at": { "minutes": 1350, "approx": true }, "place": "palier", "certain": true,
                   "docId": "D06", "page": 1, "quote": "Vers 22h30, je venais de rentrer chez moi ..." }],
  "timeline": { "facts": [{ "date": "2026-09-24", "minutes": 1382, "kind": "ARRIVAL", "actor": "TV-12",
                            "sources": [{ "docId": "D14", "page": 1, "minutes": 1382 }, { "docId": "D01", "minutes": 1384 }] }] },
  "contradictions": [{ "id": "INC-02", "level": "FORTE", "category": "TECHNIQUE", "sides": [ ... ], "notes": [ ... ] }],
  "missing": [{ "id": "MAN-01", "status": "MANQUANT", "level": "CRITIQUE", "basis": ["RÉFÉRENCE CROISÉE", "CHECKLIST"], "linked": ["INC-02"] }],
  "deadlines": [{ "kind": "CALCULEE", "ruleId": "CPP-148-A", "dueDate": "2026-10-07", "daysLeft": 3, "priority": "CRITIQUE",
                  "steps": ["Date extraite : communication de la DML au parquet le 02/10/2026 à 11h20 (C02, p. 1)", "..."] }],
  "graph": { "nodes": [ ... ], "edges": [{ "from": "ST-12", "to": "INC-01", "rel": "EN TENSION" }] },
  "chunks": [{ "docId": "D15", "page": 35, "text": "..." }]
}
```

Invariant : **tout objet affiché porte au moins une source `{docId, page, quote}`**. La visionneuse retrouve la citation dans la page et la surligne.

## 6. Détection des incohérences

1. **Normalisation des déclarations** en assertions typées, avec qui parle, de qui, quand, où et avec quelle assurance :
   `AT_HOME` (fenêtre « après 21h », « toute la soirée »), `NO_PHONE`, `NOT_AT_PLACE`, `SEEN` (heure, lieu), `HEARD`, `VOICE_ID`, `VOICE_UNKNOWN`, `MESSAGE_SENT`, plus les marqueurs d'hésitation (« je pense », « je ne peux pas le jurer ») et de certitude.
2. **Règles de confrontation** :
   - présence au domicile contre observation extérieure dans la fenêtre ;
   - non-usage du téléphone contre communications **sortantes** de la ligne (les sessions de données, possiblement automatiques, sont écartées et mentionnées) ;
   - même événement, horaires différents (fusion de la chronologie : chaque source conserve son horaire) ;
   - évolution d'un même témoin entre déclaration spontanée et audition ;
   - traçabilité des scellés (même objet sous deux numéros, ou numéro réutilisé).
3. **Niveau de confiance** : « Forte contradiction » si deux affirmations nettes et incompatibles ; « À vérifier » si hésitation, approximation (« vers ») ou écart faible.
4. **Mistral** produit ensuite, à la demande, une lecture neutre, des hypothèses de compatibilité et des vérifications concrètes. Le constat déterministe du moteur (heures, correspondant identifié, notes) est injecté dans le prompt comme fait établi : lors des essais, sans cet ancrage, le 3B avait attribué au mis en cause le numéro de son frère.

Le texte affiché est toujours : « Ces éléments semblent incompatibles et nécessitent une vérification humaine. » Jamais « le suspect ment ».

## 7. Détection des pièces manquantes

Trois mécanismes combinés :

1. **Références croisées** : une phrase associe un verbe de demande (« transmis aux fins de », « requérons », « ordonnons », « résultats à suivre », « en attente ») et un objet attendu (extraction téléphonique, toxicologie, génétique, casier, comparaison de traces, vidéo...). On cherche ensuite une pièce du type correspondant.
   - statut **manquant** si rien n'est trouvé ;
   - statut **résultat attendu** si un délai écrit n'est pas expiré (expertise ADN avant le 30/10) ;
   - priorité **relevée** si la pièce attendue conditionne une contradiction ouverte (extraction du téléphone et INC-02).
2. **Checklist procédurale** (`rules/checklist_homicide.json`, 18 éléments) : attendu contre détecté.
3. **Mentions isolées** : un élément cité par une seule pièce et sans suite (caméra du hall, biens de la victime), ce qui est souvent le plus précieux et le plus difficile à voir à la main.

## 8. Moteur de règles procédurales

Règles déclaratives en JSON (`rules/cpp_rules.json`), lisibles par un juriste :

| Règle | Fondement | Déclencheur | Calcul |
|---|---|---|---|
| CPP-148-A | Art. 148, al. 2 | DML communiquée au parquet | + 5 jours, art. 801 |
| CPP-148-B | Art. 148, al. 3 et 5 | Transmission au JLD | + 3 jours ouvrables, art. 801 |
| CPP-82-1 | Art. 82-1 | Demande d'actes reçue | + 1 mois, art. 801 |
| CPP-145-2 | Art. 145-2 | Placement en détention (crime) | + 1 an, indicatif |
| CPP-63 | Art. 63, II et III | Interpellation, notification, prolongation, levée | Contrôle : point de départ, prolongation, 48 h |
| TECH-VID-01 | Durée de conservation déclarée | Date des faits | + durée (15 jours ici) |

Le calendrier gère les jours fériés français (Pâques calculé), les jours ouvrables (dimanches et fériés exclus) et la prorogation de l'art. 801. Chaque échéance affiche son calcul pas à pas.

L'interface distingue trois natures : **date extraite** (écrite dans une pièce, aucune règle), **échéance calculée** (date extraite et règle), **contrôle** (conformité d'actes passés). La date de référence est modifiable pour rejouer la démo à n'importe quelle date.

Point d'actualité : la loi n° 2026-651 du 23 juillet 2026 (dite JCRV) modifie l'art. 148 (pas de nouvelle DML tant que la précédente n'est pas jugée ; débat contradictoire en urgence si le délai pour statuer est expiré). La règle le signale ; la rédaction exacte doit être validée sur Légifrance.

## 9. Écrans

1. **Accueil** : création ou ouverture d'un dossier (nom, type, juridiction, référence).
2. **Import** : glisser-déposer, fichiers, dossier, PDF relié ; compteur de documents ; pipeline d'analyse étape par étape avec durées.
3. **Synthèse** : indicateurs, priorités du jour, prochaines échéances, méthode.
4. **Pièces** : type détecté, famille, date, confiance, méthode (règles ou Mistral).
5. **Chronologie** : faits de la soirée (code couleur par nature de source, fenêtre du décès, drapeaux d'incohérence) et procédure.
6. **Personnes** : victime, mis en cause (déclarations, éléments en tension, résultats négatifs), témoins, autres personnes.
7. **Preuves et scellés** : statut d'analyse de chaque scellé, vidéoprotection, téléphonie, expertises.
8. **Case Graph** : personnes, déclarations, éléments, constats et leurs relations.
9. **Incohérences** : cartes à deux ou trois colonnes, citations cliquables, lecture Mistral, statut humain (à vérifier, vérifiée, écartée).
10. **Pièces manquantes** : « pourquoi est-elle attendue ? », base de la détection, checklist.
11. **Échéances** : calendrier 31 jours, contrôles, échéances avec calcul et règle, export de métadonnées.
12. **Actions** : liste priorisée et cochable.
13. **Interroger le dossier** : questions libres, réponses citées et vérifiées.
14. **Local-first et sécurité** : chiffrement, garde réseau, modèle local, ce qui peut sortir.

## 10. Local-first : garanties concrètes

- Interface Electron sandboxée, sans Node, `contextIsolation`, CSP sans source distante.
- Garde réseau dans le processus principal : toute requête non locale est annulée et comptée.
- LLM joignable uniquement sur 127.0.0.1 (vérification dans le code avant chaque appel).
- Pièces et analyses chiffrées en AES-256-GCM ; clé protégée par DPAPI (Windows) ou Keychain (macOS).
- Export limité à des métadonnées d'échéances, avec identifiant pseudonymisé et contrôle automatique d'absence de noms, numéros et intitulés.
- Aucune police, bibliothèque ou ressource chargée depuis Internet.

## 11. Ce qu'il faut absolument construire / ce qui peut être simulé

| Indispensable (fait) | Simulé ou simplifié pour le hackathon |
|---|---|
| Import local, extraction, découpage par cote | OCR des pièces scannées (les PDF de démo sont textuels) |
| Classification et extraction structurée sourcées | Lexiques calibrés sur ce type de dossier (homicide, instruction) |
| Chronologie, incohérences, manques, échéances | Jeu de 6 règles CPP au lieu du code entier |
| Citations et visionneuse surlignée | Annuaire inverse et cellules de la réponse opérateur |
| Garde réseau et chiffrement | Gestion multi-utilisateurs, journal d'audit signé |
| Mistral local avec garde-fous | Plongements sémantiques (BM25 seul) |

## 12. Risques techniques et parades

| Risque | Parade |
|---|---|
| LLM lent sur CPU pendant la démo | Détection 100 % par règles (2 à 4 s) ; LLM à la demande ; cache local des réponses ; démo sur Mac Apple Silicon avec le 8B ou le 14B |
| Erreurs de raisonnement du LLM | Sorties structurées, garde-fous, citations vérifiées, les extraits font foi |
| Règles trop calées sur le scénario | Lexiques auditables et extensibles ; extraction par LLM (sorties JSON) en V2 pour généraliser ; corrigé et tests de non-régression |
| PDF scannés, mise en page variable | OCR local (Tesseract) en V2 ; reconstruction des lignes et paragraphes déjà robuste aux tableaux |
| Exactitude juridique des délais | Règles commentées et sourcées, avertissement, validation par un magistrat ou un greffier ; date de référence paramétrable |
| Données sensibles sur un poste perdu | Chiffrement au repos, clé liée au compte du système |
| Dépendances (`node_modules`) dans OneDrive | Installées hors OneDrive par `setup_windows.ps1` |

## 13. Scénario de démonstration (6 à 7 minutes)

1. **Ouverture (20 s)** : l'app tourne en local. Montrer le badge « Réseau sortant bloqué » et « Mistral local ».
2. **Nouveau dossier (20 s)** : « Affaire Martin / Dubois », Homicide, France · pénal.
3. **Import (40 s)** : glisser le PDF relié de 78 pages (ou le dossier de 27 pièces). « 27 documents importés ». Lancer l'analyse : les étapes défilent, 3 à 4 secondes.
4. **Pièces (20 s)** : classification automatique par le contenu, confiance affichée.
5. **Chronologie (40 s)** : la soirée du 24/09, la fenêtre du décès, les trois heures d'arrivée de la patrouille, l'appel de 22h33 au milieu des déclarations.
6. **Incohérences (60 s)** : INC-01 « Je ne suis pas sorti après 21h » contre « Je l'ai vu sur le palier vers 22h30 ». Insister : le système ne dit pas qui ment. Cliquer la citation : la pièce s'ouvre, passage surligné. INC-02 : cliquer la ligne de fadettes, page 35 sur 35, surlignée.
7. **Pièces manquantes (50 s)** : le rapport d'extraction du téléphone, critique parce qu'il conditionne INC-02. La caméra du hall citée une seule fois, images effacées au bout de 15 jours.
8. **Échéances (50 s)** : DML, échéance calculée le 07/10, dans 3 jours, règle CPP-148-A, calcul détaillé ; à côté, une simple date extraite. Le contrôle de garde à vue : 15 minutes de retard apparent sur la prolongation, sans qualification.
9. **Mistral local (40 s)** : « Interroger le dossier : où se trouvait M. DUBOIS entre 22h et 23h ? ». Réponse citée, citations vérifiées.
10. **Clôture (20 s)** : export des échéances, contrôle anti-fuite réussi : « ce qui sort, c'est une date et une priorité, jamais un nom ».

Astuce : régler la date de référence au jour de la démo ; avec le 04/10/2026, la DML tombe « dans 3 jours » et la caméra « dans 5 jours ».

## 14. Pitch pour un jury LegalTech (Legora, Hector, Jus Mundi)

**Accroche.** « Un juge d'instruction reçoit 78 pages un vendredi soir. L'appel qui contredit le mis en examen est à la ligne 1 622 des fadettes, page 35. La caméra qui pourrait tout trancher est mentionnée une seule fois, et ses images s'effacent dans cinq jours. Notre copilote les trouve en 3 secondes, sans qu'une seule pièce ne quitte l'ordinateur. »

**Message clé.** Ce n'est pas un assistant juridique généraliste ni un résumeur de PDF : c'est un **outil de contrôle du dossier pénal**, spécialisé, sourcé, local, qui convertit des pièces en faits vérifiables et en actions datées.

**Pourquoi c'est crédible pour des acteurs LegalTech :**

- **Traçabilité de bout en bout** : chaque alerte se rouvre sur le passage exact, ce qu'exigent les professionnels du droit.
- **Hybride règles et LLM** : la fiabilité des règles là où l'erreur coûte cher (délais, contradictions), la souplesse du LLM là où elle aide (explication, question libre). C'est la réponse sérieuse au problème des hallucinations.
- **Souveraineté et secret de l'instruction** : modèle Mistral ouvert, exécuté localement, données chiffrées, sortie limitée à des métadonnées. Compatible avec les contraintes du ministère de la Justice et des juridictions.
- **Instruction à charge et à décharge** : l'outil fait remonter aussi les éléments favorables à la défense (silhouette non identifiée, résultats négatifs, biens disparus).
- **Extensible** : nouveaux types de dossiers par checklists et règles JSON, sans réentraîner de modèle.

**Questions probables du jury et réponses :**

- *« Vos détections ne sont-elles pas codées pour votre dossier ? »* Les lexiques sont calibrés sur ce type d'affaire et nous le disons ; ils sont génériques dans leur forme (déclarations typées, références croisées, règles de délais). La généralisation passe par l'extraction structurée par Mistral (sorties JSON validées) ; l'architecture est prête.
- *« Pourquoi pas un grand modèle dans le cloud ? »* Secret de l'instruction, RGPD, souveraineté. Et la valeur est dans la structure et la vérification, pas dans la taille du modèle.
- *« Qui est responsable si l'outil se trompe ? »* Le magistrat, comme aujourd'hui : l'outil ne décide rien, il signale et source. Chaque alerte reçoit un statut humain (vérifiée, écartée).
- *« Modèle économique ? »* Licence pour les juridictions et cabinets d'instruction, puis déclinaisons pour la défense (avocats pénalistes) et l'enquête, sur la même base locale.

**Feuille de route.** OCR local ; extraction LLM des déclarations ; plongements locaux ; règles d'instruction élargies (expertises, nullités, détention) ; intégration agenda et logiciel de chaîne pénale par métadonnées ; journal d'audit ; validation par des magistrats.
