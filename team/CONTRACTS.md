# Team split · interfaces between the 3 machines

Goal of v2 (≈ 70 min): the prosecutor (parquet) drops a whole case bundle into an empty app; **5 agents** run and raise **flags** (never verdicts), each citing the source document **and** the legal rule from a **legal RAG**. Explicit goal: **avoid procedural defects (vices de procédure)**.

Language rules: **UI text in English**. Case documents stay in **French** (the engine's French lexicons keep working). Agent flags are written in English.

| Machine | Owner of | Must NOT edit |
|---|---|---|
| **M1 (this PC)** | `app/engine/agents/**`, `app/engine/rules.js`, `app/engine/pipeline.js`, `app/engine/detect.js`, `app/engine/actions.js`, `app/renderer/agents-view.js` (new), wiring in `app/renderer/app.js` (agents view only) | legal KB, generator |
| **M2** | `app/legal/**` (new), `app/engine/legal.js` (new), `app/rules/*.json`, `app/engine/brief.js` (new, stretch), `docs/LEGAL_SOURCES.md` | `rules.js`, `pipeline.js`, renderer |
| **M3** | `dossier_fictif/**`, `docs/SCENARIO_ET_ANOMALIES.md`, `app/engine/lexicon.js` (seal objects only), `app/engine/classify.js` (new doc types only), `app/engine/evidence.js` (`PENDING_KIND` only), `app/renderer/**` except `agents-view.js` | agents, rules, legal |

Git: one branch per machine (`m1-agents`, `m2-legal`, `m3-case-ui`), small commits, `git pull --rebase origin main` before each push, merge into `main` at checkpoints. **M1 integrates.**

Checkpoints: **T+35 min** M2 pushes KB + rules + stages, M3 pushes the regenerated dossier. **T+55** M3 pushes the English UI. **T+65** freeze, M1 runs the end-to-end demo.

---

## Contract A · Legal knowledge base (M2 → M1)

`app/legal/kb.json`
```json
{
  "version": "2026-10-04",
  "disclaimer": "English paraphrases for a prototype; the French official text on Légifrance prevails.",
  "articles": [
    {
      "id": "CPP-63",                       // CODE-ARTICLE, codes: CPP (procédure pénale), CP (pénal)
      "code": "CPP", "article": "63",
      "title_en": "Police custody: duration and extension",
      "text_en": "2 to 6 sentences, accurate English paraphrase of the rule.",
      "text_fr": "Short French excerpt (one or two key sentences, quoted exactly).",
      "url": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI...",
      "topics": ["custody", "garde à vue", "deadline"],
      "phase": "PHASE1",                    // PHASE1 investigation · PHASE2 judicial investigation/detention · PHASE3 trial/appeals · SUBSTANTIVE (Code pénal)
      "verified": true                      // true only if checked on Légifrance today
    }
  ]
}
```
`app/engine/legal.js` (ES module, no dependency, reuse `Bm25` and `tokens` from `./search.js` / `./text.js`):
```js
export function loadLegalKB(json)            // -> index object
export function lawRef(index, id)            // -> article or null (exact id, e.g. 'CPP-148')
export function searchLaw(index, query, k=3) // -> [{ id, title_en, text_en, url, score }]
```
Agents call `lawRef` with ids listed in rules/stages (`kb: [...]`), and `searchLaw` for free text.

## Contract B · Procedural rules (M2 writes JSON, M1 evaluates)

`app/rules/cpp_rules.json` keeps the current schema and adds per rule:
`"phase"`, `"actor_en"` (who must act), `"title_en"`, `"action_en"`, `"kb": ["CPP-148"]`, and `"kind"` ∈ `DEADLINE | CONTROL | MILESTONE` (MILESTONE = future step whose trigger fact is not in the file yet; shown as "not yet triggered").
`delay.count` ∈ `calendar | ouvrables | francs` (francs = clear days, M1 implements). `delay.unit` ∈ `hour | day | month | year`.

Trigger facts M1 guarantees (`trigger.fact` paths, each `{ date, minutes?, src }`):
`flagrance.start` (discovery of the body), `flagrance.end` (réquisitoire introductif), `gav.interpellation`, `gav.declaredStart`, `gav.prolongation`, `gav.end`, `detention`, `ipc`, `lastInterrogation`, `dml.received`, `dml.communicated`, `demandeActes.received`, `avisFinInformation`, `verdict`, `appealDecision`, `camera.retention`.

Rules expected (verify each on Légifrance, correct the team's draft where needed): flagrance 8 days + 8 (CPP 53), body discovery (CPP 74), custody 24 h + 24 h, 96 h only for CPP 706-73 offences (CPP 63, 706-88), pre-trial detention for a felony (CPP 145-2: 1 year, 6-month extensions, ceilings), DML (CPP 148: 5 days / 3 working days), requests for acts (CPP 82-1: 1 month; 30 days interrogation after 4 months without hearing), end-of-investigation notice (CPP 175: 1 month detained / 3 months), assize appeal (CPP 380-9: 10 days), cassation (CPP 568: 5 clear days), computation of delays (CPP 801), nullity requests (CPP 173-1).

## Contract C · Procedure stages and expected documents (M2 → M1)

`app/rules/procedure_stages.json`
```json
{
  "stages": [
    {
      "id": "S1-FLAGRANCE", "phase": "PHASE1", "label_en": "Flagrance investigation", "kb": ["CPP-53", "CPP-74"],
      "expected": [
        { "docType": "PV_CONSTATATIONS", "required": true, "responsible_en": "Judicial police officer (OPJ)", "kb": ["CPP-54"] }
      ]
    }
  ],
  "dependencies": [
    { "doc": "EXPERTISE_GENETIQUE", "requires": ["ORDONNANCE_EXPERTISE", "TRANSMISSION_SCELLE"], "responsible_en": "Appointed DNA expert" }
  ]
}
```
Allowed `docType` values (from `app/engine/classify.js`): `FICHE_CIC PV_INTERVENTION PV_CONSTATATIONS PLANCHE_PHOTO AUDITION_TEMOIN AUDITION_GAV PV_GAV PROLONGATION_GAV PERQUISITION AUTOPSIE VIDEO TELEPHONIE RAPPORT_TRACES RAPPORT_LABO TRANSMISSION_SCELLE REQUISITOIRE IPC COMMISSION_ROGATOIRE ORDONNANCE_EXPERTISE SYNTHESE MAIN_COURANTE ORDONNANCE_DETENTION DML DEMANDE_ACTES RAPPORT_EXTRACTION_TEL RAPPORT_TOXICO EXPERTISE_GENETIQUE CASIER_B1 ENQUETE_PERSONNALITE EXPERTISE_PSY PLAINTE AVIS_175` (M3 adds `PLAINTE`; `EXPERTISE_PSY` and `AVIS_175` are expected types not present in the demo file).

## Contract D · Agent output (M1 → UI)

```js
runAgents(analysis, { trigger: 'upload' | 'daily', today, kb, stages, rules })
// -> { ranAt, trigger, agents: [ { id: 'document'|'deadline'|'quality'|'inconsistency'|'progress',
//        name, schedule: 'every upload' | 'every upload + daily', summary, metrics,
//        flags: [ { id, severity: 'critical'|'high'|'check'|'info', title, detail,
//                   sources: [{ docId, page, quote }], law: [{ id, title_en, url }], actor, due } ] } ] }
```
Flags are indications for a human. Forbidden wording: guilty, lying, must be prosecuted, proves.

## Contract E · Case bundle (M3)

Same story and structure as today, renamed: victim **Gérard LEGORIX** (apt 32), suspect **Julien HARVEX** (apt 31). Bundle folder `dossier_fictif/bundle/` = all piece PDFs + images; plus the single bound PDF. Must contain useless PVs and useless images (see `team/MACHINE_3_CASE_UI.md`).
