# LCCC agents report
Case analysed on 04/10/2026 · trigger: upload · knowledge base 2026-10-04 (40 articles)
Flags: 3 critical, 11 high, 10 medium, 9 low, 3 info
> Indication for human review only: no conclusion on guilt, credibility or the outcome of the case.

## Document agent (upload) · 12 flag(s) · 6 ms
_Finds documents referenced but missing (and who must send them), documents required at each procedural stage, and dependencies between documents._

- **[CRITICAL] Phone extraction report referenced but missing** (DOC-01, REFERENCED_MISSING)
  Referenced in D18 (Exhibit transmission report). No corresponding document was found among the uploaded files. Needed to resolve INC-02.
  - Who: National Forensic Science Service (SNPS), digital unit · requested by: Investigators acting under the rogatory commission
  - For the prosecutor: Ask the investigating judge to have the forensic unit chased; the report conditions an open inconsistency.
  - Sources: D18 p.1, D23 p.1
  - Law: Code of Criminal Procedure, Art. 60-1 (domain knowledge); Code of Criminal Procedure, Art. 156 and 161 (domain knowledge)

- **[CRITICAL] Building-hall CCTV mentioned once and never requisitioned** (DOC-02, MENTIONED_NOT_FOLLOWED_UP)
  Referenced in D06 (Witness hearing). No corresponding document was found among the uploaded files.
  - Who: Building manager (syndic) holding the recordings · requested by: Not requested in any document
  - For the prosecutor: Ask for an immediate requisition and seizure of the recordings before they are overwritten.
  - Sources: D06 p.2
  - Law: Code of Criminal Procedure, Art. 60-1 (domain knowledge); Code of Criminal Procedure, Art. 81 (domain knowledge)

- **[HIGH] Toxicology results announced but missing** (DOC-03, REFERENCED_MISSING)
  Referenced in D13 (Autopsy report). No corresponding document was found among the uploaded files.
  - Who: Hospital toxicology laboratory (samples sent by the forensic pathologist) · requested by: Forensic pathologist, at the autopsy
  - For the prosecutor: Ask the investigators or the pathologist for the supplementary toxicology report.
  - Sources: D13 p.2, D23 p.2
  - Law: Code of Criminal Procedure, Art. 230-28 and 230-29 (web-checked (JCRV law 2026-651)); Code of Criminal Procedure, Art. 156 and 161 (domain knowledge)

- **[HIGH] Criminal record (bulletin no.1) requested but not received** (DOC-04, REFERENCED_MISSING)
  Referenced in D23 (Investigation summary report). No corresponding document was found among the uploaded files.
  - Who: National Criminal Records Office (bulletin no.1) · requested by: Investigators
  - For the prosecutor: The prosecution office can obtain bulletin no.1 directly; it is needed to assess legal recidivism.
  - Sources: D23 p.2, D21 p.1, D23 p.1
  - Law: Criminal Code, Art. 132-8 (domain knowledge)

- **[HIGH] Victim's belongings (watch, cash) not located** (DOC-05, MENTIONED_NOT_FOLLOWED_UP)
  Referenced in D07 (Witness hearing). No corresponding document was found among the uploaded files.
  - Who: Investigators · requested by: Not requested in any document
  - For the prosecutor: Ask investigators to trace the watch and cash (relevant for and against the suspect, and for a possible Art. 221-2 qualification).
  - Sources: D07 p.1, D12 p.1, D13 p.1, D07 p.1
  - Law: Code of Criminal Procedure, Art. 81 (domain knowledge); Criminal Code, Art. 221-2 (domain knowledge)

- **[LOW] DNA expert report pending** (DOC-06, PENDING_RESULT)
  Referenced in D22 (Expert appointment order). Report due before 30/10/2026: deadline not expired.
  - Who: Appointed DNA expert: Agathe VIDAL · requested by: Investigating judge (expert appointment order)
  - For the prosecutor: Monitor the deadline set in the appointment order; no action before it expires.
  - Sources: D22 p.1, D08 p.1, D13 p.2, D17 p.1
  - Law: Code of Criminal Procedure, Art. 156 and 161 (domain knowledge); Code of Criminal Procedure, Art. 167 (domain knowledge)

- **[LOW] Mandatory personality inquiry not yet in the file** (DOC-07, REFERENCED_MISSING)
  Referenced in D19 (Introductory submission). No corresponding document was found among the uploaded files.
  - Who: Investigator or social inquirer appointed by the investigating judge · requested by: Requested in the introductory submission
  - For the prosecutor: Ask the investigating judge to order it: mandatory in felony cases (Art. 81).
  - Sources: D19 p.1
  - Law: Code of Criminal Procedure, Art. 81 (domain knowledge)

- **[LOW] Recommended at this stage: Psychiatric expert opinion (customary in homicide cases)** (DOC-08, NECESSARY_MISSING)
  Phase 2 - Judicial investigation and detention: no such document in the file. Normally produced by: Psychiatric expert appointed by the judge.
  - Who: Psychiatric expert appointed by the judge
  - For the prosecutor: Consider requesting it.
  - Law: Criminal Code, Art. 122-1 (domain knowledge); Code of Criminal Procedure, Art. 156 and 161 (domain knowledge)

- **[MEDIUM] Dependency: Resolving INC-02** (DOC-09, DEPENDENCY)
  INC-02 cannot be resolved without this document. Depends on: Phone extraction report referenced but missing.

- **[MEDIUM] Dependency: Expert results on the hammer** (DOC-10, DEPENDENCY)
  Results cannot be safely attributed to the exhibit until the seal-number discrepancy is explained. Depends on: INC-06 (seal numbering).
  - Law: Code of Criminal Procedure, Art. 56 (domain knowledge)

- **[MEDIUM] Dependency: Acts carried out during custody (D08, D09, D11, D12)** (DOC-11, DEPENDENCY)
  If the custody is annulled, acts carried out during it (suspect hearings, search, buccal DNA sample) may fall with it. Depends on: Regularity of the police custody.
  - Law: Code of Criminal Procedure, Art. 171 and 802 (domain knowledge); Code of Criminal Procedure, Art. 173-1 (domain knowledge + JCRV note)

- **[MEDIUM] Dependency: Notice of end of investigation (Art. 175)** (DOC-12, DEPENDENCY)
  The investigation should not be closed while these documents are outstanding. Depends on: Phone extraction report referenced but missing ; Toxicology results announced but missing ; Criminal record (bulletin no.1) requested but not received ; DNA expert report pending.
  - Law: Code of Criminal Procedure, Art. 175 (web-checked)

## Deadline agent (upload + daily) · 11 flag(s) · 8 ms
_Computes global and individual deadlines from the documents and the Code of Criminal Procedure, with the actor responsible and the source document. Re-runs every day._

- **[CRITICAL] Release request: judge must forward it to the JLD: 07/10/2026 (in 3 days)** (DL-01, INDIVIDUAL_DEADLINE)
  The file is communicated to you for submissions: file written submissions now; the judge must then forward the request to the JLD by this date. Computed: 3 steps (Art. 801 applied).
  - Who: Investigating judge
  - For the prosecutor: Action for you
  - Sources: C02 p.1
  - Law: Code of Criminal Procedure, Art. 148 (web-checked); Code of Criminal Procedure, Art. 801 (web-checked); Code of Criminal Procedure, Art. 145-2 (web-checked (partial) + domain knowledge)

- **[HIGH] Private CCTV recordings may be overwritten: 09/10/2026 (in 5 days)** (DL-02, INDIVIDUAL_DEADLINE)
  Ask for the recordings to be requisitioned and seized before this date (irreversible loss of evidence). Computed: 3 steps (Art. 801 applied).
  - Who: Investigators, on instruction
  - For the prosecutor: Action for you
  - Sources: D06 p.2
  - Law: Code of Criminal Procedure, Art. 60-1 (domain knowledge)

- **[HIGH] Release request: JLD decision: 12/10/2026 (in 8 days)** (DL-03, INDIVIDUAL_DEADLINE)
  Check that the JLD rules within 3 working days of the referral (latest date if referred on the last possible day). Computed: 4 steps (Art. 801 applied).
  - Who: Liberty and detention judge (JLD)
  - For the prosecutor: Monitor
  - Sources: C02 p.1
  - Law: Code of Criminal Procedure, Art. 148 (web-checked); Code of Criminal Procedure, Art. 801 (web-checked)

- **[HIGH] Police custody: 24 h + 24 h ceiling** (DL-04, GLOBAL_DEADLINE)
  Apprehension 25/09/2026 00:35; 48-hour ceiling 27/09/2026 00:35. Custody ended 26/09/2026 15:00 after 38 h 25: within 48 h. Points to check: start time recorded at 25/09/2026 01:10 although the person was apprehended at 25/09/2026 00:35 (35 min later); extension authorised at 26/09/2026 00:50, 15 min after the 24-hour limit counted from apprehension (26/09/2026 00:35). No organised-gang element in the file: the 96-hour regime (Art. 706-88) does not apply.
  - Who: Judicial police officer, under your control
  - For the prosecutor: Action for you
  - Sources: D08 p.1, D08 p.1, D10 p.1, D23 p.1
  - Law: Code of Criminal Procedure, Art. 63 (web-checked); Code of Criminal Procedure, Art. 706-73 and 706-88 (web-checked); Code of Criminal Procedure, Art. 171 and 802 (domain knowledge)

- **[MEDIUM] Return of the body to the family (1 month after the autopsy): 25/10/2026 (in 21 days)** (DL-05, INDIVIDUAL_DEADLINE)
  Autopsy on 25/09/2026. Since the July 2026 reform, the body is in principle returned within one month unless the investigation requires otherwise: decide, or record the reasons for keeping it.
  - Who: Public Prosecutor / investigating judge
  - For the prosecutor: Action for you
  - Sources: D13 p.1
  - Law: Code of Criminal Procedure, Art. 230-28 and 230-29 (web-checked (JCRV law 2026-651))

- **[MEDIUM] Defence request for acts: judge's answer: 30/10/2026 (in 26 days)** (DL-06, INDIVIDUAL_DEADLINE)
  Check that the judge grants the request or issues a reasoned refusal order. Computed: 3 steps (Art. 801 applied).
  - Who: Investigating judge
  - For the prosecutor: Monitor
  - Sources: C03 p.1
  - Law: Code of Criminal Procedure, Art. 82-1 (web-checked); Code of Criminal Procedure, Art. 801 (web-checked); Code of Criminal Procedure, Art. 173-1 (domain knowledge + JCRV note)

- **[MEDIUM] Expert report due (date written in the appointment order): 30/10/2026 (in 26 days)** (DL-07, INDIVIDUAL_DEADLINE)
  Date found in a document (no rule applied).
  - Who: Appointed expert
  - For the prosecutor: Monitor
  - Sources: D22 p.1
  - Law: Code of Criminal Procedure, Art. 156 and 161 (domain knowledge)

- **[LOW] Rogatory commission to be returned (date written in the order): 30/11/2026 (in 57 days)** (DL-08, INDIVIDUAL_DEADLINE)
  Date found in a document (no rule applied).
  - Who: Investigators
  - For the prosecutor: Monitor
  - Sources: D21 p.1
  - Law: Code of Criminal Procedure, Art. 81 (domain knowledge); Code of Criminal Procedure, Art. 230-28 and 230-29 (web-checked (JCRV law 2026-651))

- **[LOW] Right to demand an interrogation after 4 months without appearance: 26/01/2027 (in 114 days)** (DL-09, GLOBAL_DEADLINE)
  Last appearance: 26/09/2026. From 26/01/2027, the person may demand an interrogation; the judge must then carry it out within 30 days of receipt.
  - Who: Investigating judge (on written demand of the defence)
  - For the prosecutor: Monitor
  - Sources: D20 p.1
  - Law: Code of Criminal Procedure, Art. 82-1 (web-checked); Code of Criminal Procedure, Art. 173-1 (domain knowledge + JCRV note); Code of Criminal Procedure, Art. 116 (domain knowledge)

- **[LOW] Window for defence nullity requests (Art. 173-1): 26/03/2027 (in 173 days)** (DL-10, GLOBAL_DEADLINE)
  Placed under formal investigation on 26/09/2026: nullities of earlier acts (custody, search) can be raised until 26/03/2027 (26/01/2027 under the 4-month rule of the 2026 reform, date of entry into force to check).
  - Who: Defence (you monitor the risk)
  - For the prosecutor: Monitor
  - Sources: D20 p.1
  - Law: Code of Criminal Procedure, Art. 173-1 (domain knowledge + JCRV note); Code of Criminal Procedure, Art. 171 and 802 (domain knowledge)

- **[LOW] Pre-trial detention: initial one-year term: 26/09/2027 (in 357 days)** (DL-11, GLOBAL_DEADLINE)
  Detention ordered on 26/09/2026. Initial term ends 26/09/2027; extensions of up to 6 months require a reasoned order before expiry. Absolute ceiling: 26/09/2029 (3 years, sentence incurred of 20 years or more). File your submissions on any extension well before the term.
  - Who: JLD, on referral by the investigating judge
  - For the prosecutor: Action for you
  - Sources: C01 p.1
  - Law: Code of Criminal Procedure, Art. 145-2 (web-checked (partial) + domain knowledge); Code of Criminal Procedure, Art. 137 and 144 (domain knowledge)

## Quality agent (upload) · 3 flag(s) · 9 ms
_Sorts reports and images into essential, useful and low-value, and flags data-quality issues (unreadable scans, uncertain classification, missing images)._

- **[INFO] Reading priority: 23 essential, 4 useful, 0 low-value document(s)** (QA-03, SORTING)
  Images: 4 evidential, 4 context, 1 missing.

- **[INFO] 4 context photo(s) without evidential content** (QA-01, SORTING)
  Photo 1: façade de l'immeuble, 14 rue des Glycines, vue depuis la chaussée. | Photo 2: caméra de vidéoprotection municipale VP-112, angle de l'avenue Jean-Jaurès. | Photo 5: séjour de l'appartement 32, vue générale. | Photo 9: hall d'entrée du bâtiment B, vue vers l'accès au parking souterrain.
  - Sources: D04 p.1, D04 p.1, D04 p.3, D04 p.5

- **[LOW] Photo 6 in D04: image not reproduced in this copy** (QA-02, DATA_QUALITY)
  Caption: "position du corps (image non reproduite).". Ask for the original photograph if needed.
  - Sources: D04 p.3

## Inconsistency agent (upload) · 8 flag(s) · 3 ms
_Detects contradictions between documents (statements, times, exhibits) and procedural irregularities that could ground a nullity request._

- **[HIGH] Julien DUBOIS's account vs a witness sighting at about 22:30** (INC-01, CONTRADICTION)
  Julien DUBOIS states he did not leave his home that evening (D09, D11, D11, D20); Karim BENSAÏD states he saw him on the landing at about 22:30 (D06). The statements appear incompatible. Indication for human review only: no conclusion on guilt, credibility or the outcome of the case.
  - Risk: Merits issue (assessment of evidence), not a procedural defect: consider a confrontation or further hearing.
  - Sources: D09 p.1, D11 p.1, D11 p.1, D20 p.1, D06 p.1
  - Law: Code of Criminal Procedure, Art. 81 (domain knowledge)

- **[HIGH] Julien DUBOIS's statement on phone use vs operator records** (INC-02, CONTRADICTION)
  Julien DUBOIS states he did not touch his phone after 21:00; the operator records show an outgoing call at 22:33:17 (00:00:52) to Thomas DUBOIS. Data sessions in the same period were set aside (possibly automatic). Indication for human review only: no conclusion on guilt, credibility or the outcome of the case.
  - Risk: Merits issue: the phone extraction report (missing) is needed to clarify who used the device.
  - Sources: D09 p.2, D15 p.35
  - Law: Code of Criminal Procedure, Art. 60-1 (domain knowledge)

- **[MEDIUM] Different arrival times for the same police crew (22:54 / 23:02 / 23:04)** (INC-03, CONTRADICTION)
  3 different times are recorded: 22:54 in D02; 23:02 in D14; 23:04 in D01, D23. The tool does not decide which one is correct. Indication for human review only: no conclusion on guilt, credibility or the outcome of the case.
  - Risk: Reliability of the fine chronology; check the original logs (control room, CCTV time-stamp).
  - Sources: D02 p.1, D14 p.1, D01 p.1, D23 p.1
  - Law: Code of Criminal Procedure, Art. 54 (domain knowledge)

- **[MEDIUM] Change between successive statements of Sylvie LEROY** (INC-04, CONTRADICTION)
  Time of the shouting: 22:00 (D02) then 22:15 (D05). In the first account the witness did not know who was shouting; in the formal hearing she thinks she recognised Julien DUBOIS's voice. Indication for human review only: no conclusion on guilt, credibility or the outcome of the case.
  - Risk: Reliability of a witness statement; the point was not raised in the hearings on file.
  - Sources: D02 p.1, D02 p.1, D05 p.1, D05 p.1
  - Law: Code of Criminal Procedure, Art. 81 (domain knowledge)

- **[MEDIUM] Julien DUBOIS's denial vs voice identification by Sylvie LEROY** (INC-05, CONTRADICTION)
  Julien DUBOIS says he did not go to the victim's flat; the witness thinks she recognised his voice there at about 22:15, while expressing doubt herself. Weak contradiction. Indication for human review only: no conclusion on guilt, credibility or the outcome of the case.
  - Risk: Merits issue; a confrontation has been requested by the defence.
  - Sources: D09 p.2, D05 p.1, D05 p.1
  - Law: Code of Criminal Procedure, Art. 82-1 (web-checked); Code of Criminal Procedure, Art. 81 (domain knowledge)

- **[HIGH] Exhibit numbering inconsistency: hammer (seal no.5 / seal no.6)** (INC-06, PROCEDURAL_DEFECT_RISK)
  The hammer appears under seal no.5 in D12, D22 and under seal no.6 in D17. The same number also designates another exhibit. Chain-of-custody point to clear before relying on lab results. Indication for human review only: no conclusion on guilt, credibility or the outcome of the case.
  - Risk: Procedural risk: an unexplained break in the chain of custody may lead to annulment of the seizure or of the expert analysis.
  - Sources: D12 p.1, D22 p.1, D17 p.1, D17 p.1, D17 p.1, D17 p.1
  - Law: Code of Criminal Procedure, Art. 56 (domain knowledge); Code of Criminal Procedure, Art. 171 and 802 (domain knowledge)

- **[HIGH] Custody start time recorded 35 min after the apprehension** (INC-07, PROCEDURAL_DEFECT_RISK)
  Apprehension at 25/09/2026 00:35; custody notified "from 25/09/2026 01:10". By law the start time is, where applicable, the time of apprehension. Indication for human review only: no conclusion on guilt, credibility or the outcome of the case.
  - Risk: May ground a nullity request against the custody and the acts that depend on it.
  - Sources: D08 p.1, D08 p.1
  - Law: Code of Criminal Procedure, Art. 63 (web-checked); Code of Criminal Procedure, Art. 171 and 802 (domain knowledge); Code of Criminal Procedure, Art. 173-1 (domain knowledge + JCRV note)

- **[HIGH] Custody extension authorised 15 min after the 24-hour limit** (INC-08, PROCEDURAL_DEFECT_RISK)
  Counted from the apprehension, the first 24 hours ended at 26/09/2026 00:35; the written extension is dated 26/09/2026 00:50. Indication for human review only: no conclusion on guilt, credibility or the outcome of the case.
  - Risk: Custody beyond the limit without a prior extension may be annulled with the statements taken during that period.
  - Sources: D10 p.1, D08 p.1
  - Law: Code of Criminal Procedure, Art. 63 (web-checked); Code of Criminal Procedure, Art. 171 and 802 (domain knowledge)

## Progress agent (upload) · 2 flag(s) · 2 ms
_Compares the documents in the file with the steps of the criminal procedure (knowledge base) and reports a checklist and a completion rate per phase._

- **[INFO] Procedure 62% complete. Current stage: Phase 2 - Judicial investigation and detention** (PRG-01, PROGRESS)
  Phase 1 - Police investigation (flagrance and custody): 100% (13/13) | Phase 2 - Judicial investigation and detention: 50% (5/10) | Phase 3 - Trial and appeals: not started

- **[LOW] Next milestones: DNA expert report; Toxicology report; Phone extraction report; Criminal record (bulletin no.1)** (PRG-02, PROGRESS)
  DNA expert report (pending; by Appointed DNA expert) | Toxicology report (missing; by Toxicology laboratory) | Phone extraction report (missing; by Digital forensics unit) | Criminal record (bulletin no.1) (missing; by National criminal records office) | Personality inquiry (missing; by Investigator or social inquirer appointed by the judge) | Notice of end of investigation (later; by Investigating judge)
  - Law: Code of Criminal Procedure, Art. 156 and 161 (domain knowledge); Code of Criminal Procedure, Art. 230-28 and 230-29 (web-checked (JCRV law 2026-651)); Code of Criminal Procedure, Art. 60-1 (domain knowledge)

## Procedure checklist

**Phase 1 - Police investigation (flagrance and custody)**: 100%
- [x] Initial intervention report · DONE (D02, D01)
- [x] Scene examination report · DONE (D03)
- [x] Photographs and scene plan · DONE (D04)
- [x] Witness hearings · DONE (D05, D06, D07)
- [x] Custody placement and notification of rights · DONE (D08)
- [x] Suspect hearings in custody · DONE (D09, D11)
- [x] Written authorisation to extend custody · DONE (D10)
- [x] Search and seizure report · DONE (D12)
- [x] Autopsy report · DONE (D13)
- [x] CCTV exploitation · DONE (D14)
- [x] Telephone records from the operator · DONE (D15)
- [x] Forensic laboratory reports · DONE (D17, D16)
- [x] Investigation summary report · DONE (D23)

**Phase 2 - Judicial investigation and detention**: 50%
- [x] Introductory submission (requisitoire introductif) · DONE (D19)
- [x] First appearance and formal investigation · DONE (D20)
- [x] Pre-trial detention order · DONE (C01)
- [x] Rogatory commission · DONE (D21)
- [x] Expert appointment order · DONE (D22)
- [ ] DNA expert report · PENDING
- [ ] Toxicology report · MISSING
- [ ] Phone extraction report · MISSING
- [ ] Criminal record (bulletin no.1) · MISSING
- [ ] Personality inquiry · MISSING
- [ ] Psychiatric expert opinion (customary in homicide cases) · OPTIONAL
- [ ] Notice of end of investigation · LATER
- [ ] Prosecutor's final submissions · LATER
- [ ] Indictment order (referral to the Assize Court) · LATER

**Phase 3 - Trial and appeals**: not started
- [ ] Assize Court verdict · LATER
- [ ] Appeal decision · LATER
- [ ] Cassation decision · LATER

## Deadline table
| Scope | Deadline | Due | Status | Actor | Law |
|---|---|---|---|---|---|
| INDIVIDUAL | Release request: judge must forward it to the JLD | 07/10/2026 (3 d) | UPCOMING | Investigating judge | CPP-148, CPP-801, CPP-145-2 |
| INDIVIDUAL | Private CCTV recordings may be overwritten | 09/10/2026 (5 d) | UPCOMING | Investigators, on instruction | CPP-60-1 |
| INDIVIDUAL | Release request: JLD decision | 12/10/2026 (8 d) | UPCOMING | Liberty and detention judge (JLD) | CPP-148, CPP-801 |
| GLOBAL | Police custody: 24 h + 24 h ceiling | - | TO_CHECK | Judicial police officer, under your control | CPP-63, CPP-706-88, CPP-171 |
| INDIVIDUAL | Return of the body to the family (1 month after the autopsy) | 25/10/2026 (21 d) | UPCOMING | Public Prosecutor / investigating judge | CPP-230-28 |
| INDIVIDUAL | Defence request for acts: judge's answer | 30/10/2026 (26 d) | UPCOMING | Investigating judge | CPP-82-1, CPP-801, CPP-173-1 |
| INDIVIDUAL | Expert report due (date written in the appointment order) | 30/10/2026 (26 d) | UPCOMING | Appointed expert | CPP-156 |
| INDIVIDUAL | Rogatory commission to be returned (date written in the order) | 30/11/2026 (57 d) | UPCOMING | Investigators | CPP-81, CPP-230-28 |
| GLOBAL | Right to demand an interrogation after 4 months without appearance | 26/01/2027 (114 d) | UPCOMING | Investigating judge (on written demand of the defence) | CPP-82-1, CPP-173-1, CPP-116 |
| GLOBAL | Window for defence nullity requests (Art. 173-1) | 26/03/2027 (173 d) | UPCOMING | Defence (you monitor the risk) | CPP-173-1, CPP-171 |
| GLOBAL | Pre-trial detention: initial one-year term | 26/09/2027 (357 d) | UPCOMING | JLD, on referral by the investigating judge | CPP-145-2, CPP-144 |
| GLOBAL | Flagrance investigation window (8 days, extendable to 16) | - | MET | Public Prosecutor (directs the judicial police) | CPP-53, CPP-74 |
| GLOBAL | End-of-investigation submissions (Art. 175) | - | NOT_YET_TRIGGERED | Public Prosecutor, defence, civil parties | CPP-175 |
| GLOBAL | Appeals after the Assize verdict | - | NOT_YET_TRIGGERED | Prosecution, defence, civil party | CPP-380-9, CPP-568 |

## Legal RAG check
- "how long can police custody last for a murder" -> CPP-63 (10.337), CPP-62-2 (5.559)
- "deadline to appeal to the court of cassation" -> CPP-568 (13.737), CPP-380-9 (9.589)
- "is a personality inquiry mandatory" -> CPP-81 (13.81), CPP-79 (4.541)
- "what happens if the chain of custody of seals is broken" -> CPP-56 (16.02), CPP-54 (2.793)