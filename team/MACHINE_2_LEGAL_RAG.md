# Machine 2 · Legal knowledge base, procedural rules, stages (legal RAG)

Time box: **35 min** for the mandatory part, then stretch. Branch: `m2-legal`. Read `team/CONTRACTS.md` first (contracts A, B, C) and `docs/CONCEPTION_MVP.md` §8 for context.

Context: local desktop app (Electron) that helps a **public prosecutor (parquet)** check a French homicide case file and **avoid procedural defects**. Agents (built on machine 1) must "know criminal procedure": they cite rules from the knowledge base you build. Output is **flags, never verdicts**.

## Mandatory (in this order)

1. **Verify the deadlines on Légifrance** (web search allowed; official text prevails) and note any correction. The team's draft contains probable errors to check: custody 96 h applies only to CPP 706-73 offences (simple murder: 48 h max); pre-trial detention for a felony is CPP **145-2** (not 145-1), ceilings depend on the sentence incurred; assize appeal is CPP **380-9** (10 days); cassation is CPP **568** (**5 clear days**, not 10); body discovery is CPP **74**. Also check the 2026 changes (loi n° 2026-651 du 23/07/2026 "JCRV" touched CPP 148, 173-1).
2. **`app/legal/kb.json`** (contract A): about **30 articles**, English paraphrase + exact short French excerpt + Légifrance URL + `verified`:
   - CPP: 53, 54, 56, 57, 60-1, 61-1, 62-2, 63, 63-1, 63-3-1, 63-4, 64, 74, 79, 80, 81, 82-1, 116, 144, 145-2, 148, 156, 167, 173-1, 175, 380-9, 568, 706-73, 706-88, 801.
   - Code pénal (substantive, for the prosecutor brief): 221-1 (murder), 221-3 (premeditated murder), 221-4 (aggravating circumstances), 222-7 (violence causing death without intent), 122-5 (self-defence), 122-1 (criminal irresponsibility / altered judgement), 132-1 (individualisation of the sentence), 132-8 and 132-10 (legal recidivism), 311-1 (theft).
3. **`app/engine/legal.js`** (contract A): `loadLegalKB`, `lawRef`, `searchLaw` (reuse `Bm25` from `app/engine/search.js`; add a small English stopword list inside your file if useful). Quick test: `node -e` script printing `searchLaw(idx, 'police custody extension')`.
4. **`app/rules/cpp_rules.json`** (contract B): keep the 6 existing rules working (ids `CPP-148-A`, `CPP-148-B`, `CPP-82-1`, `CPP-145-2`, `CPP-63`, `TECH-VID-01`), add `phase`, `title_en`, `action_en`, `actor_en`, `kb` to each, and add the new rules: flagrance (8 + 8 days), 82-1 interrogation after 4 months, 175 (1 / 3 months), 380-9, 568, as `DEADLINE` or `MILESTONE`. Validate JSON (`node -e "JSON.parse(require('fs').readFileSync('app/rules/cpp_rules.json','utf8'))"`).
5. **`app/rules/procedure_stages.json`** (contract C): stages per phase (flagrance, custody, opening of judicial investigation, investigation acts, detention, end of investigation, trial, appeals) with expected document types, `required`, `responsible_en` (who must send the document: OPJ, forensic doctor, SNPS lab, telecom operator, criminal record office, appointed expert, defence...), `kb` ids, plus `dependencies` (e.g. DNA report requires expert appointment order and seal transmission; phone extraction report requires seal transmission; IPC requires réquisitoire).

Commit and push to `m2-legal`, then tell M1 (message in the team chat): "M2 KB + rules + stages pushed".

## Stretch (only after the push)

6. `app/engine/brief.js` → `buildBrief(analysis, kbIndex)`: prosecutor brief as **indicators with sources**, never conclusions. Sections: *Qualification* (intent to kill: number of wounds, vital areas, weapon type, relentlessness; premeditation: weapon brought, scouting, ambush; aggravating circumstances CP 221-4; possible defences CP 122-5 / 122-1), *Imputation* (DNA, prints, blood, timeline vs alibi, telephony, CCTV; chain of custody regularity), *Personalisation* (criminal record and **recidivism flag**, psychiatric expertise, personality inquiry, victim situation). Each indicator: `{ label_en, status: 'present'|'absent'|'unknown', evidence: [{docId,page,quote}], law: ['CP-221-1'] }`. Work on the regenerated dossier from M3 (pull `main` after T+35). Documents are in French: match French wording (e.g. "plaie", "coup de couteau", "thoracique", "lésions de défense", "condamné le").

## Rules
- Do not edit `rules.js`, `pipeline.js`, renderer files, or the generator.
- No em dash in prose. English for all `_en` fields.
- If unsure of a legal point, set `"verified": false` and write the doubt in `notes`; never invent an article.
