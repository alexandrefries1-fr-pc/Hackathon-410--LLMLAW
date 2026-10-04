# LCCC · Copilote pénal local

Hackathon Sciences Po × Mistral AI · cas d'usage pénal : homicide entre voisins.

Application desktop qui transforme un dossier pénal documentaire en représentation structurée et actionnable (chronologie, protagonistes, preuves, incohérences, pièces manquantes, échéances, actions), **entièrement en local**, avec un modèle **Mistral** exécuté sur le poste. Chaque alerte renvoie à la pièce, à la page et au passage exacts. Aucune décision n'est prise par la machine.

## Contenu

| Dossier | Rôle |
|---|---|
| `dossier_fictif/` | **Livrable A** : 27 pièces PDF cotées, le PDF relié de 78 pages, et le générateur `generate_dossier.py` |
| `app/` | **Livrable B** : application Electron (moteur d'analyse, interface, règles CPP) |
| `docs/CONCEPTION_MVP.md` | Architecture, choix techniques, modèle Mistral, RAG, format de données, détections, moteur de règles, écrans, risques, **scénario de démo et pitch** |
| `docs/SCENARIO_ET_ANOMALIES.md` | Corrigé du dossier fictif : anomalies plantées et résultats attendus |

## Lancer l'application

**Windows (ce poste)** : les dépendances sont déjà installées hors OneDrive. Double-cliquer `lancer_app.cmd`.
Sur un autre PC Windows : exécuter d'abord `setup_windows.ps1` (Node portable, Electron, pdf.js ; sans droits admin).

**macOS / Linux** :

```bash
cd app && npm install && npm start
```

**LLM local (facultatif mais recommandé)** : installer [Ollama](https://ollama.com), puis :

```bash
ollama pull ministral-3:8b
```

Sans Ollama, toutes les détections fonctionnent (elles reposent sur des règles) ; seules les fonctions « Lecture Mistral » et « Interroger le dossier » sont désactivées.

Le cache `app/demo/llm-cache.json` contient déjà les réponses de démonstration calculées avec `ministral-3:3b` (6 lectures d'incohérences, 4 questions suggérées) : elles s'affichent instantanément avec la mention « cache local ». Pour la démo sur la machine finale, recalculer avec le modèle choisi (compter 1 à 2 min par réponse sur CPU, beaucoup moins sur Apple Silicon) :

```bash
cd app && node scripts/precompute-llm.mjs ministral-3:8b
```

## Démo en 30 secondes

1. Accueil → « Créer le dossier » (Affaire Martin / Dubois).
2. Import → « Dossier de démonstration » (ou glisser `dossier_fictif/DOSSIER_COMPLET_Affaire_Martin_Dubois.pdf`) → « Lancer l'analyse locale ».
3. Incohérences → cliquer une citation : la pièce s'ouvre, passage surligné.
4. Échéances → DML à transmettre au JLD avant le 07/10/2026 (règle CPP-148-A, calcul détaillé).

La date de référence (en haut à droite) recalcule les échéances : la régler sur le jour de la démo.

## Tests du moteur (sans interface)

```bash
cd app && node scripts/test-engine.mjs pieces 2026-10-04
```

Affiche classification, personnes, déclarations, chronologie, incohérences, manques, échéances et actions. Argument `bundle` pour tester le PDF relié.

## Principes

- **Local-first** : interface sans réseau, garde réseau dans le processus principal, LLM uniquement sur 127.0.0.1, pièces et analyses chiffrées (AES-256-GCM, clé protégée par le système).
- **Toujours sourcé** : tout résultat porte `{pièce, page, citation}` ; la visionneuse surligne le passage.
- **Les règles détectent, le LLM explique, l'humain décide** : aucune formulation sur la culpabilité ou la sincérité ; garde-fous sur les sorties du LLM.

Toutes les personnes, lieux et numéros du dossier sont fictifs.
