# Machine 3 · Case bundle v2 (Legorix / Harvex) then simple English UI

Time box: **35 min** for the case bundle (push at T+35), then **20 min** for the UI (push at T+55). Branch: `m3-case-ui`. Read `team/CONTRACTS.md` (contract E) and `docs/SCENARIO_ET_ANOMALIES.md` first.

Setup: Python 3 with `reportlab`, `pypdf`, `Pillow` (`pip install reportlab pypdf pillow`); Node 20+; `cd app && npm install` (on a disk folder that is not synced by OneDrive/iCloud).

## Part 1 · Case bundle (mandatory, keep it "almost identical")

Edit `dossier_fictif/generate_dossier.py` only (documents stay in **French**):

1. **Rename** everywhere: `MARTIN` → `LEGORIX` (victim Gérard LEGORIX, daughter Claire LEGORIX), `DUBOIS` → `HARVEX` (suspect Julien HARVEX, brother Thomas HARVEX, Laure HARVEX in the phone directory). Update file names and the `AFFAIRE` string.
2. **Story** (user's brief): Harvex stole Legorix's property; Legorix went to Harvex's home to confront him; the argument escalated; Harvex stabbed him; Legorix was found dead later.
   - D24 (main courante of 14/06) becomes a **theft report** dated 20/09/2026: Legorix reports that Harvex stole his property (e.g. bicycle and tools from the cellar). Keep type "main courante".
   - D07: the daughter says her father told her at 21h45 he would go to Harvex's flat that evening "pour récupérer ses affaires".
   - D03/D04: add a **trail of blood drops on the landing from the door of flat 31 (Harvex) to flat 32 (Legorix)**; the victim is still found at home in flat 32.
3. **Weapon = kitchen knife** instead of the hammer, everywhere it appears (D04 captions, D09/D11 questions, D12 seizure, D13 autopsy, D17 lab, D22 DNA order, D23 synthesis). Keep the **planted seal-number error** (knife = seal n°5 in D12/D22 but n°6 in D17, where n°6 is the shoes).
   - D13 autopsy, explicit French wording (the engine matches it): **3 plaies par arme blanche**: one **thoracique** penetrating the heart (cause of death, vital area), one **abdominale**, one on the left forearm (**lésion de défense**); blade about 2.5 cm wide, depth about 12 cm; "compatible avec un couteau de cuisine". Same death window 22h00–23h00.
   - Premeditation indicators **absent** (the knife belongs to the suspect's kitchen); write one neutral sentence the brief can use.
4. **Criminal record** (recidivism must be visible): add piece **B01** "Bulletin n°1 du casier judiciaire" for Julien HARVEX, dated 02/10/2026, title line containing "BULLETIN N°1", with 2 convictions: 12/03/2019 "violences volontaires avec usage ou menace d'une arme" (8 mois avec sursis) and 05/11/2021 "vol" (amende). Header org can be "Casier judiciaire national".
5. **Useless PVs** (for the Quality agent): add D25 to D30, one page each, realistic police format, **no protagonist names, no seal numbers, no times between 21:00 and 23:59 on 24/09**: illegal parking report rue des Tanneurs (24/09 18h10), hearing of a food delivery driver who saw nothing in another building, lost-property receipt (umbrella found in the hall on 26/09), syndic letter about the broken lift, identity check of a passer-by on 27/09 (unrelated), and an exact **duplicate** of D16 under another cote.
6. **Images**: create `dossier_fictif/bundle/` = copy of all piece PDFs + **7 JPG images** generated with Pillow (simple drawings + burned-in caption/timestamp):
   - 3 useful, **referenced by file name in D04** (add "Photo 10 : couteau de cuisine (cliché IMG_2417.jpg)", etc.): knife on the kitchen counter, blood drops on the landing, flat 32 door.
   - 4 useless, **referenced nowhere**: blurry stairwell, empty car park, duplicate of the façade, officer's notebook out of focus.
7. Regenerate (`py generate_dossier.py`): `pieces/`, `bundle/`, and the bound PDF. Then run the engine test from `app/`: `node scripts/test-engine.mjs pieces 2026-10-04`. It must still report INC-01 to INC-06 (presence 22h30, phone 22h33, TV-12 arrival times, Leroy evolution, voice, seal numbering) and the missing phone extraction / hall camera. If the knife is not recognised as a seal object, add `{ key: 'couteau', label: 'Couteau', re: /couteau/ }` to `SEAL_OBJECTS` in `app/engine/lexicon.js` and `couteau: 'GENETIQUE'` to `PENDING_KIND` in `app/engine/evidence.js` (only those lines).
8. Update `docs/SCENARIO_ET_ANOMALIES.md` (names, weapon, theft, B01 record, list of useless PVs and images = expected Quality agent output). Commit, push `m3-case-ui`, tell M1 "M3 bundle pushed".

## Part 2 · Simple English UI (after pulling `main` at T+40)

Target users: elderly magistrates, not tech-savvy. Files: `app/renderer/app.js`, `viewer.js`, `index.html`, `styles.css` (**never** `agents-view.js`, owned by M1; keep M1's few wiring lines in `app.js`).

1. **All UI text in English** (labels, buttons, headings, tooltips). Engine-generated sentences stay as they are.
2. **Empty start**: nothing pre-generated. The home screen is one giant drop zone: "Drop the case file here (folder or PDFs)", plus a large "Choose files" button. Dropping creates the case automatically (case name = folder name, type Homicide) and starts the analysis immediately, with big progress steps. When done, open the **Agents** view (`go('agents')`, provided by M1). Hide the "Demo case" button unless `S.info.autotest` is set.
3. **Readability**: base font 16 px, headings 24 px+, buttons at least 44 px high, strong contrast, plain words (e.g. "Problems found", "Missing documents", "Deadlines", "To do"), keep the sidebar short.
4. Keep the autotest working (`LCCC_AUTOTEST=demo LCCC_SHOT_DIR=<dir>`), check screenshots, push.

Rules: no em dash in prose; flags are indications, never verdicts.
