# PROJECT_CONTEXT — EHR Blockchain

Describes the system as it stands on branch `finish/integration-phases` (2026-11-19). The core flows were run on
a network built from scratch on WSL2; `STATUS.md` lists what was not exercised and what is not real, and
`BUGS.md` has the audit and fix log. Items marked **(not traced)** were not read line by line.

## 1. Architecture

One Fabric network, **two channels** (`ehrchannel` for clinical/lab/pharmacy consortium workflows; `insurancechannel` strictly between HospitalMSP and ProviderMSP for confidential zero-PHI claims adjudication and settlement), chaincode `ehr` (thirteen contracts deployed across both channels), Kubo IPFS for
off-chain content, Express gateways per peer/role, React portals, an nginx hub on port 80.

| Service (compose name) | Port | Stack | Talks to | Purpose |
| --- | --- | --- | --- | --- |
| `nginx` | 80 | nginx | all below | Hub page (`nginx/hub`) and path routing (`/api/hospital/peer0|peer1|peer2|extorg|ext|patient/`, `/api/dashboard/`, `/api/pharmacy/`, `/api/lab/`, `/api/insurance/`, `/ai-agent/`, `/dashboard/`, `/lab/`, `/insurance/`) |
| `h-peer0-api` | 4001 | Express | peer0.hospital, ipfs-service, Gemini | Receptionist/admin: patients, visits, staff users, symptom intake, timeline; publishes the code template at start |
| `h-peer1-api` | 4002 | Express | peer1.hospital, ipfs-service | Doctor: diagnosis, prescription, forward to nurse/lab, disease code, timeline, finalize, EHR |
| `h-peer2-api` | 4003 | Express | peer2.hospital, ipfs-service | Nurse, pharmacist (dispense), medical-records officer; login for pharmacy accounts |
| `h-extorg-api` | 4004 | Express + Static UI | peer0.diagnostic (ehrchannel), peer0.provider (ehrchannel + insurancechannel), ipfs-service | Lab workflow (worklist, results, attachments, verify/reject), multi-channel claims router (`ehrchannel` + `insurancechannel`), and dedicated Insurance & TPA Claims Deck frontend (`/insurance/`) |
| `h-patient-api` | 4005 | Express + SQLite | peer0.hospital, ipfs-service | Patient sign-up/login, profile, EHR, visits, timeline, consent, OCR, signatures |
| `h-ipfs-service` | 4006 | Express | Kubo `ipfs.ehr.local:5001` | Pin/fetch; encrypts JSON documents (AES-256-GCM); guarded by `X-IPFS-Key`; reports timing to the dashboard |
| `h-digilocker-service` | 4007 | Express | peer0.hospital, ipfs-service | DigiLocker vault (sandbox provider by default) |
| `clinical-ai-agent` | 8000 | FastAPI | local JSON files | Rule-based lab-report check and Q&A (`EHR_OFFLINE_MODE=true`); needs a staff token |
| `h-dashboard-api` (profile `dashboard`) | 4010 | Express + WS | peer0.hospital (own read-only identity), health URLs | Block collector, event ingest, analytics, explorer, realtime stream |
| `h-dashboard-portal` (profile `dashboard`) | 5176 (served at `/dashboard/`) | React/Vite | dashboard-api | Dashboard |
| `h-hospital-portal` | 5173 | React/Vite dev server | peer0/1/2/ext APIs and AI agent via Vite proxy | Staff portal (all hospital and lab roles) |
| `h-patient-portal` | 5174 | React/Vite dev server | patient-api via Vite proxy (`/api/patient`), digilocker (`localhost:4007`) | Patient portal |
| `p-backend` | 3000 | Express | Kubo, local JSON store | Pharmacy inventory, bills, staff list; token and role check on every data route. No Fabric client |
| `p-frontend` | 5175 | React/Vite | p-backend, peer2-api | Pharmacy portal |
| `l-node-gateway` | 3006→3000 | Express + static UI | peer0.diagnostic (`labresults` chaincode, not deployed), Kubo, extorg-api (sign-in) | Lab deck; needs a lab staff token |
| `fhir-deps` | — | one-shot | — | Installs the FHIR module's dependencies into a volume the hospital APIs mount |

Fabric containers (compose files under `orgs/hospital/EHR_hospitalOrg-main/ehr-network/docker`): orderer (7050),
peer0/1/2.hospital (7051/9051/10051), peer0.diagnostic (8051), peer0.provider (11051), four CAs (7054–7057),
and Kubo as `ipfs.ehr.local` (API 5001, gateway 8090).

Shared backend code is in `ehr-backend-v3/shared`, mounted into every hospital API at `/shared`:
`labReport.js` (test catalogue, validation, flags, report hash), `diseaseCodes.js` + `icd10-template.json`,
`symptomAgent.js`, `intake.js`, `timeline.js`, `patientDirectory.js`, `dashboardEmitter.js`, `fhir.js`, `users.json`.

### How to start

```
./setup.sh                  # first time: images and host-side dependencies
./start.sh                  # everything
./stop.sh                   # stop, keep data
./stop.sh --reset --yes     # delete ledger, identities and application data
```

`start.sh` creates `.env` if missing (`scripts/init-env.js`), then: if there are no Fabric identities it builds
the network (`network-up.sh`); if identities exist but the peers are not on the channel it wipes application
state and rebuilds; otherwise it reuses the ledger. `ehr-network/scripts/ensure-chaincode.sh` hashes the
chaincode source and deploys or upgrades `ehr` only when it changed. `scripts/setup-dashboard-identity.sh`
enrols the dashboard's read-only identity. The script ends when all health checks pass. Linux or WSL2 only.

## 2. Fabric network

- Orgs: `HospitalMSP` (3 peers), `DiagnosticsMSP` (1 peer), `ProviderMSP` (1 peer), `OrdererMSP` (1 Raft orderer).
- Channels:
  - `ehrchannel`: joined by `HospitalMSP` (`peer0:7051`, `peer1:9051`, `peer2:10051`), `DiagnosticsMSP` (`peer0.diagnostic:8051`), and `ProviderMSP` (`peer0.provider:11051`). Used for patient encounters, clinical documentation, laboratory orders/reports, and pharmacy medication dispensing.
  - `insurancechannel`: joined exclusively by `HospitalMSP` (all 3 peers) and `ProviderMSP` (`peer0.provider:11051`). `DiagnosticsMSP` is excluded at both network and cryptographic levels, ensuring confidential zero-PHI claims adjudication, patient co-pay settlement, and billing reconciliation between hospital and insurer.
- Chaincode `ehr` (Node, `ehr-chaincode-v3`), deployed across both channels:
  - On `ehrchannel`: v3.1, endorsement policy `OR('HospitalMSP.peer','DiagnosticsMSP.peer','ProviderMSP.peer')` — any single org endorses.
  - On `insurancechannel`: v1.1 Sequence 2, endorsement policy `OR('HospitalMSP.peer','ProviderMSP.peer')`.
- Role comes from the `role` attribute in the caller's X.509 certificate (`lib/accessControl.js`). `role=admin` is scoped by MSP: hospital `admin`, diagnostics `labadmin`, provider `provideradmin`.
- All timestamps come from the transaction (`getTxTimestamp`), not the peer's clock.
- The gateways pick the Fabric identity by role, not by person; the username travels as data.
- Chaincode `labresults` (`orgs/lab/EHR-LABORG-main/chaincode/lab-results`) is what the lab deck calls; it is not deployed on this network.

### Chaincode functions (`ehr`)

| Contract | Function | Who may call (enforced in chaincode) |
| --- | --- | --- |
| PatientContract | RegisterPatient(patientId, profileCID, profileHash, initialEhrCID) | receptionist, admin. Creates the DID |
| | UpdatePatientInfo(patientId, profileCID, profileHash), SetPatientEhrCID, ListAllPatients | receptionist, admin |
| | GetPatient, GetPatientHistory, GetPatientVisits | staff roles; others need a grant |
| | PatientExists | anyone |
| VisitContract | OpenVisit, AssignDoctor | receptionist, admin |
| | AssignNurse | receptionist, doctor, admin |
| | FinalizeVisit | doctor |
| | FinalizeRecord | medrecordofficer |
| | DischargePatient | admin |
| | ListAllVisits | staff roles |
| | UpdateVisitCID, GetVisitCID, GetVisit, GetVisitHistory, GetCIDHistory, GetPatientVisitsFull | **(checks not traced)** |
| ForwardContract | ForwardToNurse | doctor |
| | ForwardToLab(visitId, labRequestId, visitCID) | doctor. Creates the `LABREQ` record |
| | ForwardToDoctor | nurse |
| ClinicalContract | UpdateDiagnosisNotes, UpdatePrescription | doctor |
| | RecordVitals, AddCareNote | nurse |
| | DispenseMedication | pharmacist (visit must be finalized) |
| LabContract | AcknowledgeLabRequest | labreceptionist, labadmin |
| | SubmitLabResult(…, resultsHash) | labtechnician, radiologist, labadmin |
| | ApproveLabResult(…, resultsHash) | labsupervisor, labadmin; must not be the person who submitted; hash must match |
| | RejectLabResult(…, reason) | labsupervisor, labadmin |
| | ListLabRequests(status) | lab roles and staff who read the queue |
| | GetLabRequest, GetLabRequestHistory | **(checks not traced)** |
| DidContract | AppendDocument(patientId, cid, type, ref, note) | staff roles; types SYMPTOM_ANALYSIS, DOCUMENT, DIGILOCKER_DOCUMENT, FHIR_BUNDLE |
| | GetDID, ResolveDID, ListCIDs, GetCIDEntry | read-access check **(not traced)** |
| CodeContract | SetTemplate(cid, version, sha256, codeSystem) | admin |
| | AssignProvisionalCode | receptionist, admin |
| | UpdateDiseaseCode(patientId, newCode, name, reason, visitId) | doctor; a change needs a reason |
| | GetTemplate, GetDiseaseCode | **(checks not traced)** |
| StatsContract | GetStats | admin, observer (counts only) |
| ClaimsContract | SubmitClaim(visitId, claimId, amount, CID, patientId, policyId) | billingofficer (on `insurancechannel`) |
| | AuditClaim(visitId, auditNotes, CID) | claimsauditor (on `insurancechannel`) |
| | ProcessClaim(visitId, decision, reason, CID, approvedAmount, copayAmount) | insuranceofficer (on `insurancechannel`; emits `ClaimSettled` event) |
| | GetClaim(id), GetAllClaims() | billingofficer, claimsauditor, insuranceofficer, provideradmin |
| EhrContract | InitEHR | receptionist, admin |
| | UpdateEHRCID | doctor, nurse (with patient grant), admin, patientService |
| | GetCurrentCID, GetEHRCIDHistory, GetEHRRecord, GetEHRBlockHistory | read-access check **(not traced)** |
| AccessContract | GrantAccess, RevokeAccess, ApproveAccessRequest, RejectAccessRequest | patientService, admin |
| | RequestAccess, HasAccess, GetAccessList, GetActiveGrants, LogAccess, GetAccessRequests, GetAuditLog | **(not traced)** |
| FhirContract | AnchorFHIRRecord | a fixed list of write roles |
| | UpdateFHIRAnchorStatus | admin, labadmin, provideradmin, patientService |
| | GetFHIRAnchor, ListFHIRAnchors, AnchorExists, GetFHIRAnchorHistory | **(not traced)** |
| DigiLockerContract | AnchorDocument, RevokeDocument | patientService, admin |
| | GetDocument, ListDocuments, VerifyDocument, GetDocumentHistory | those two, plus doctor/nurse with consent |

Visit statuses: OPEN → WITH_DOCTOR ⇄ WITH_NURSE / WITH_LAB → VISIT_FINALIZED → RECORD_FINALIZED →
CLAIM_SUBMITTED → CLAIM_UNDER_AUDIT → CLAIM_APPROVED / CLAIM_REJECTED → DISCHARGED.

Lab request statuses: REQUESTED → ACKNOWLEDGED → RESULT_SUBMITTED → APPROVED, or REJECTED → RESULT_SUBMITTED again.

Every write to a `VISIT:` or `EHR:` key also appends the new CID to the patient's DID (`lib/did.js`,
called from `accessControl.putState`), so the timeline is built by the chaincode, not by the APIs.

## 3. Organisations and roles

Staff accounts are in `ehr-backend-v3/shared/users.json` (bcrypt hashes). Demo passwords are in `README.md`.

| Org | Role | Work | UI |
| --- | --- | --- | --- |
| Hospital | receptionist | Register patients (with symptoms), open visits, assign doctor/nurse | Hospital portal: Patients, Visits, Open Visit |
| | admin | Same plus discharge and staff management; signs in to the dashboard | Hospital portal: + Staff, Discharge; Dashboard |
| | doctor | Diagnosis, prescription, forward to nurse/lab, disease code, timeline, finalize, edit EHR (with consent) | Hospital portal: My Visits |
| | nurse | Vitals, care notes, forward to doctor | Hospital portal: My Visits |
| | pharmacist | Dispense after the visit is finalized | Pharmacy portal; Hospital portal: Dispense |
| | medrecordofficer | Finalize the record | Hospital portal: Finalize |
| | inventory, billing, manager | Pharmacy stock, bills, staff list and audit (accounts log in through peer2-api) | Pharmacy portal |
| Diagnostics | labreceptionist | Accept a lab order | Hospital portal: Lab worklist |
| | labtechnician, radiologist | Enter results | Hospital portal: Lab worklist |
| | labsupervisor | Verify and sign, or reject with a reason | Hospital portal: Lab worklist |
| | labadmin | All of the above | Hospital portal: Lab worklist |
| Provider | billingofficer, claimsauditor, insuranceofficer, provideradmin | Submit, audit, decide and settle claims via `insurancechannel` with selective disclosure IPFS packets | Insurance & TPA Claims Deck (`/insurance/` / :4004) with role authentication gate and separate workspaces |
| Dashboard | observer (`dashboardobserver`) | Read blocks and counts | Used by dashboard-api only |
| Patient | patient (SQLite account; on-chain via `patientService`) | Profile, EHR, visits, timeline, consent, DigiLocker, signature checks | Patient portal |

## 4. Portals and pages

**Hospital portal** (5173): `/login`, `/patients` and `/register` (registry and registration with Symptoms; result
card with DID, provisional code and AI cross-reference), `/visits`, `/visits/:id`, `/open-visit`, `/discharge`,
`/staff`, `/my-visits` (doctor tabs: Overview, Clinical, Lab Results, Disease Code, Timeline, Patient EHR; nurse
view), `/dispense`, `/finalize`, `/lab-queue` (lab worklist: role queue, status filters, result entry from the
test catalogue, attachments, review and sign-off).

**Patient portal** (5174): Login/Sign-up (needs the phone number given at reception), Overview, My Visits (lab
report shown only after verification), My Timeline (disease code history and every entry under the DID),
Record Vault / Consent Centre / On-Chain Proof, DigiLocker, Profile.

**Pharmacy portal** (5175): sign-in with a pharmacy account; the workspace follows the role on the account.
Doctor Orders & Dispense (pharmacist), Stock & Inventory, POS Billing, Patient Pharmacy Records, Operations &
Staff (manager).

**Lab deck** (`/lab/`, static page served by `l-node-gateway`): sign-in form, then record list, report upload,
AI analysis, agent run with human approval, integrity check. Its ledger calls fail (see section 2).

**Insurance & TPA Claims Deck** (`/insurance/`, static SPA served by `h-extorg-api` at `:4004` and proxied via Nginx at `http://localhost/insurance/`): secure Login gate with role selection (`billingofficer`, `claimsauditor`, `insuranceofficer`), role-segregated workspaces, claims queue with live status badges (`SUBMITTED`, `UNDER_AUDIT`, `APPROVED`, `REJECTED`), a 3-stage Cryptographic Provenance Stepper (`1. IPFS Ingest & Redaction` → `2. Medical Necessity Audit` → `3. Dual-Channel Ledger Settlement`), a Digital Explanation of Benefits (EOB) / Settlement Certificate with print view, and a collapsible raw ledger state drawer.

**Dashboard** (`/dashboard/`): Overview, Network, Agents, Transactions, Analytics, Explorer, Security, IPFS,
Logs, Alerts. Analytics and Explorer read `/analytics/summary` and `/explorer/...`; the rest read the
aggregation routes and the `/stream` WebSocket.

**Hub** (`/`): static cards with health probes.

## 5. AI agents

| Agent | Where | Trigger | Input | Output | Shown |
| --- | --- | --- | --- | --- | --- |
| Symptom agent (Gemini) | `shared/symptomAgent.js`, run by `shared/intake.js` in peer0-api | Patient registration; opening a visit with a chief complaint | symptoms, age, gender, the code template | likely conditions, suggested ICD-10 codes (template codes only), urgency, suggested tests, summary | Registration result card; doctor's Disease Code tab, labelled "AI cross-reference, not a diagnosis"; stored as a document under the DID |
| Clinical agent — analyze-report | `services/ai-agent` `/api/v1/agent/analyze-report` | Lab technician asks for a check while entering results | report text | findings, abnormal flags, follow-ups | Lab worklist; saved with the report |
| Clinical agent — query | same service, `/agent/query` | Hospital portal chat | question + patient id | answer | Hospital portal |
| Lab agent, History agent, Clinical agent (lab side), Governance, VCAP provenance | `l-node-gateway` (`agents/`, `orchestrator/`, `governance/`, `provenance/`) | Lab deck | report / patient id | findings, trend, allow/block, provenance CID | Lab deck |
| Clinical decision support (LangGraph + Gemini) | `services/clinical-decision-support` | **none — not in compose** | — | — | — |

The symptom agent is the only part that calls a language model. It tries `GEMINI_MODEL`, then
`GEMINI_FALLBACK_MODELS` when the API answers 429/500/503 or times out, and records which model answered. With
no key or no answer it returns status UNAVAILABLE with the reason and no clinical content; registration still
compleches with the template match.

`clinical-ai-agent` is rule and keyword matching over bundled JSON, not a model. The lab deck's clinical step
calls an endpoint that only `clinical-decision-support` serves, so it reports AI as unavailable.

## 6. Data flow of one record

1. **Registration** — receptionist → peer0-api `POST /patients`: profile and EHR documents are encrypted and pinned → `PatientContract:RegisterPatient` stores the profile CID and hash and creates the DID → `EhrContract:InitEHR` → FHIR Patient anchor.
2. **Intake** — the symptoms are matched against the ICD-10 template and sent to the symptom agent; the analysis document is pinned and appended to the DID (`DidContract:AppendDocument`); `CodeContract:AssignProvisionalCode` records the provisional code with the AI's suggested codes.
3. **Visit** — `POST /visits`: pin visit document → `VisitContract:OpenVisit`; assign doctor/nurse.
4. **Consultation** — each doctor or nurse edit fetches the visit document, changes it, re-pins it and calls the matching function with the new CID.
5. **Disease code** — doctor `PUT /doctor/visits/:id/disease-code` → `CodeContract:UpdateDiseaseCode`; the entry records whether it matched the provisional code and the AI suggestion.
6. **Lab** — doctor orders (`ForwardToLab` creates `LABREQ:<visitId>-L<n>`) → lab accepts → technician submits a structured report (its SHA-256 goes on the ledger) → supervisor verifies against that hash, or rejects with a reason → visit returns to the doctor.
7. **Finalize and dispense** — doctor finalizes; pharmacist dispenses through peer2-api (`ClinicalContract:DispenseMedication`).
8. **Reading back** — the timeline (`shared/timeline.js`) lists the DID's entries and fetches any document by its sequence number; the patient's copy hides lab values that are not yet verified.
9. **Insurance claims adjudication & settlement** — billing officer in `/insurance/` builds a Selective Disclosure IPFS Packet (stripping psychotherapy notes, genetic markers, and unconsented PHI under DPDP Act / HIPAA) → `POST /claims/visits/:id/submit` invokes `SubmitClaim` on `insurancechannel` → claims auditor validates medical necessity and ICD-10 diagnostic codes via `AuditClaim` → insurance officer calculates deductible/co-pay (e.g. 15% co-pay, 85% approved payout) and executes `ProcessClaim` → Fabric peer commits settlement to `insurancechannel` and emits `ClaimSettled` event → digital EOB certificate and cryptographic audit trail are generated.

Every gateway wraps its contract object so each submit reports its submit and commit times to the dashboard.

## 7. Where data lives

| Store | Contents |
| --- | --- |
| Ledger (`ehr` on `ehrchannel`) | `PATIENT:<id>` — DID, profile CID and hash, visit IDs, EHR CID; **no name, age, contact or address**. `DID:` / `DIDIDX:` / `DIDCID:<did>:<seq>` — the identifier and its numbered CID entries. `VISIT:<id>` — status, assigned staff, current CID, CID history. `LABREQ:<id>` — status, who did each step and when, report hash. Disease code record per patient — current code and name **in plain form**, full history. Code template pointer (CID, version, hash). `EHR:<id>` CID index; `ACCESS:<id>` grants, requests, audit log; FHIR anchors (hashes + CID); DigiLocker anchors. |
| Ledger (`ehr` on `insurancechannel`) | `CLAIM:<claimId>` — pointer linking claim to visit and financial summary. `VISIT:<visitId>` — isolated claim projection with status (`CLAIM_SUBMITTED`, `CLAIM_UNDER_AUDIT`, `CLAIM_APPROVED`, `CLAIM_REJECTED`), selective disclosure IPFS packet CID (`claimCID`), itemized charges, approved payout, co-pay split, audit notes, and settlement timestamps. |
| IPFS | Profile, EHR, visit, symptom-analysis and FHIR documents — encrypted JSON (AES-256-GCM, key in `.env`). ICD-10 template. Lab attachments and OCR uploads — **not encrypted**. DigiLocker documents (encrypted by that service). Pharmacy bill documents — **not encrypted**, pinned straight to Kubo. **Selective Disclosure Claim Packets** — sanitized non-PHI JSON packets (`docType: SelectiveDisclosureClaimPacket`) containing only insurance-admissible ICD-10/CPT codes and billed services. |
| SQLite (`patient-api/data/patients.db`) | Patient portal accounts. |
| Files | `shared/users.json` staff accounts; dashboard event store and block checkpoint (volume); dashboard identity (`dashboard-api/credentials`); DigiLocker link store; pharmacy store (`backend/data/pharmacy_store.json`: inventory, bills, staff list, access list — **not on the ledger**); ai-agent `patient_data/patients.json`. |

## 8. Feature status

| Feature | Status | Note |
| --- | --- | --- |
| Network build, chaincode deploy and upgrade from `./start.sh` | Working | Run from scratch |
| Reset (`./stop.sh --reset`) | Working | Needs `sudo` for Fabric's root-owned files |
| Registration, visits, doctor, finalize, dispense | Working | |
| One DID per patient and timeline | Working | Doctor and patient views |
| Disease code template, provisional code, doctor confirm/change with history | Working | |
| Symptom agent | Working | Depends on Google answering; fell back to a lighter model on the test day |
| Lab workflow and structured report | Working | Print dialog not opened in testing |
| FHIR anchoring | Working | |
| Demographics off the ledger; JSON on IPFS encrypted | Working | Binary uploads not encrypted |
| Patient portal | Working | DigiLocker page checked by hand only |
| Pharmacy sign-in, role checks, dispense | Working | |
| Pharmacy inventory and bills | Partial | Real records, but in the pharmacy's own store, not on the ledger |
| Dashboard analytics and explorer | Working | Charts not seen drawn in testing |
| Lab deck | Partial | Sign-in works; ledger actions fail (chaincode not deployed) |
| Clinical AI agent (report check, chat) | Partial | Rule-based, not a model |
| clinical-decision-support | Missing wiring | Not deployed, not called |
| Nurse, records-officer, discharge screens; insurance claim API | Unverified | Unchanged code, not exercised in the last pass |
| Insurance / provider screens | Working | Dedicated `/insurance/` Claims Deck with Auth Gate, Role Switcher, Cryptographic Stepper & Digital EOB |
| Staff creation from the admin page | Broken in Docker | No enrolment tool in the container |
| Per-patient staff access, per-user Fabric identities, multi-org endorsement | Missing | See `STATUS.md` |
