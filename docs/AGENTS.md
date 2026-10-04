# LCCC agents and legal RAG

The copilot runs five specialised agents on the structured case analysis. Each agent returns **flags**: indications for human review, never conclusions on guilt, credibility or the outcome of the case. Every flag carries its source documents (document, page, quote) and its legal grounding, retrieved from a local knowledge base of French criminal procedure.

Code: `app/agents/agents.js` (agents and runtime), `app/agents/legalRag.js` (retrieval), `app/knowledge/legal_kb.json` (knowledge base). Sample output: [AGENTS_SAMPLE_REPORT.md](AGENTS_SAMPLE_REPORT.md).

## Agents

| Agent | Trigger | What it flags |
|---|---|---|
| **Document** | every upload | Documents referenced but missing, with who must produce them and what the prosecutor can do; documents required at each procedural stage (knowledge-base checklist); dependencies (an open inconsistency waiting for a report, lab results waiting for a seal-number fix, acts that would fall if the custody were annulled, items blocking the end of the investigation) |
| **Deadline** | every upload **and daily** | Global deadlines (flagrance, custody, detention ceilings, nullity window, 4-month interrogation right, end of investigation, appeals) and individual ones (release request, defence requests, CCTV overwrite, expert report, body return), each with the actor, "action for you" or "monitor", the source document and the articles. The daily run recomputes days left and reports escalations. |
| **Quality** | every upload | Reading priority (essential / useful / low value) for each report, evidential vs context photos, missing images, unreadable scans, uncertain classification |
| **Inconsistency** | every upload | Contradictions between documents (statements, times, exhibits) and procedural-defect risks (custody start time, late custody extension, chain of custody), with the risk explained |
| **Progress** | every upload | Procedure x documents checklist per phase, completion rate, current stage, next milestones |

Run them from the command line:

```bash
cd app && node scripts/run-agents.mjs pieces 2026-10-04 --daily 2026-10-06 --md ../docs/AGENTS_SAMPLE_REPORT.md
```

In the desktop app they run at the end of every analysis (step "Agents"), and again whenever the calendar day or the reference date changes.

## Flag format

```json
{ "id": "DL-01", "agent": "DL", "category": "INDIVIDUAL_DEADLINE", "severity": "CRITICAL",
  "title": "Release request: judge must forward it to the JLD: 07/10/2026 (in 3 days)",
  "detail": "...", "actor": { "who": "Investigating judge" }, "prosecutorAction": "Action for you",
  "dueDate": "2026-10-07", "daysLeft": 3,
  "sources": [{ "docId": "C02", "page": 1, "quote": "..." }],
  "legal": [{ "id": "CPP-148", "article": "Code of Criminal Procedure, Art. 148", "verification": "web-checked" }] }
```

Severities: CRITICAL, HIGH, MEDIUM, LOW, INFO. Deadlines: 3 days or less (or overdue) is CRITICAL; "monitor-only" deadlines are capped at HIGH.

## Legal knowledge base and RAG

`legal_kb.json` holds 40 plain-English paraphrases of the Code of Criminal Procedure (CPP) and Criminal Code (CP), grouped by phase (police investigation, judicial investigation, trial and appeals, qualification, personalisation). Each entry includes its deadline in structured form when there is one, the procedural risk, keywords, a link to Legifrance and a verification status:

- **web-checked** (cross-checked online on 2026-10-04): Art. 53, 63, 706-73/706-88, 82-1, 148, 175, 801, 380-9, 568, 230-28/230-29 (2026 reform), 145-2 (partially);
- **domain knowledge**: all the others. Check them on Legifrance before any real use.

The knowledge base also lists the documents expected at each stage, which the Document and Progress agents use.

Retrieval is BM25 over the entries (English tokenizer). Agents attach explicit articles first, then add retrieved ones only above a relevance threshold. `lawPrompt()` builds a prompt so that the local Mistral model can answer free legal questions from the retrieved articles only.

## Corrections made to the deadline table given in the brief

| Brief | Correct rule used by the agents |
|---|---|
| Custody up to 96 h for murder (Art. 706-73) | 96 h only for offences listed in Art. 706-73 (e.g. murder by an organised gang). Ordinary murder: 48 h maximum (Art. 63). |
| Pre-trial detention: Art. 145-1, 1 to 2 years | Felonies: Art. 145-2. One year, extensions of up to 6 months, ceiling of 2 years if the sentence incurred is under 20 years, **3 years** otherwise (murder: 30 years), 4 years in specific cases. |
| Assize appeal: Art. 380-2 | The 10-day limit is in Art. 380-9 (Art. 380-2 lists who may appeal). |
| Cassation: 10 days, Art. 576 | **5 clear days**, Art. 568 (Art. 576 concerns the form of the appeal). |
| Discovery of the body: Art. 74-1 | Art. 74 (Art. 74-1 concerns disappearances). |
| Murder facilitating theft: Art. 221-4 | Art. 221-2 (Art. 221-4 lists other aggravating circumstances). |

Added because they matter for a prosecutor: return of the body within one month of the autopsy (2026 reform), the nullity window of Art. 173-1 (6 months, 4 months under the 2026 reform), and the 4-month interrogation right of Art. 82-1.

## Current limits

- The agents read the analysis produced by the engine, whose extraction patterns are still calibrated on the French demo case. Translating the case and the engine to English (steps 2 and 3 of the plan) is needed before testing on the new Legorix / Harvex case.
- No dedicated screen yet: the agents' output is stored with the case and available in the report; the agent view comes with the interface rework (step 6).
