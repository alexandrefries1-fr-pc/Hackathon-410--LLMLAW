# Machine 1 (this PC, Claude session with full context) · Agents and integration

Branch: `m1-agents`. Integrates `m2-legal` and `m3-case-ui` into `main` at checkpoints.

1. Agent runtime `app/engine/agents/` (contract D): `runAgents()`, triggers `upload` and `daily` (on app start + midnight timer + "Run now" button), shared flag format, legal citations via `legal.js` (stub KB until M2 pushes).
2. **Document agent**: missing referenced documents and who must send them; missing necessary documents per procedural stage (`procedure_stages.json`); dependencies between documents.
3. **Deadline agent**: global and per-actor deadlines from `cpp_rules.json` (CPP rule, source document, actor), controls (custody), milestones not yet triggered; extended rule engine (`francs` days, hours, new trigger facts).
4. **Quality agent**: useful vs useless PVs (links to the case graph: persons of interest, facts window, seals, requests) and images (referenced in a PV or not, low-information images); duplicates.
5. **Inconsistency agent**: contradictions between documents (existing detectors) repackaged as flags with law references (chain of custody, CPP 56).
6. **Progress agent**: procedure × documents, percentage per phase and overall, checklist.
7. Agents view `app/renderer/agents-view.js` (English), minimal wiring in `app.js`; demo loads `dossier_fictif/bundle/` (PDFs + images).
8. End-to-end test with the v2 bundle, screenshots, freeze at T+65.
