# Implementation Roadmap & Gap Analysis 🗺️🚀

> **Project Manager Analysis, Gap Identification, Actionable Next Steps & Technical Debt**

---

## 1. Gap Analysis (Current Codebase vs Production EHR Standards)

Comparing the current codebase against enterprise-grade Electronic Health Record (EHR) standards:

| Functional Area | Standard Requirement | Current Codebase State | Critical Gap |
| :--- | :--- | :--- | :--- |
| **Interoperability** | HL7 FHIR v4.0.1 Data Standard | Custom JSON structures | Records lack standardized FHIR resource schemas (e.g. `Patient`, `Observation`, `DiagnosticReport`). |
| **Authentication** | OAuth2 / OIDC / PKI Web3 Auth | Local JWT & Static Fabric CA | OAuth2 / SSO integration is missing; relies on local identity wallets. |
| **Encryption at Rest** | Client-Side Zero-Knowledge Encryption | Plaintext IPFS JSON storage | IPFS files are unencrypted; anyone with the CID can read raw clinical JSON payloads. |
| **Audit Compliance** | Full HIPAA Immutable Audit Logging | On-chain ledger history | Comprehensive audit search dashboards across organizations are missing. |
| **Multi-Org Sync** | Automated Cross-Org Consent Transfer | Isolated Org Networks | Hospital, Pharmacy, and Lab operate as separate Fabric channels without unified cross-channel chaincode calls. |

---

## 2. Actionable Technical Tasks (Prioritized Backlog)

### Phase 1: High-Priority Fixes & Security Hardening (Sprint 1-2)
- [ ] **Task 1.1: Client-Side File Encryption before IPFS Upload**  
  Integrate AES-256-GCM encryption before sending buffers to IPFS. Store the symmetric key in `ACCESS:<patientId>` encrypted with the recipient clinician's public key.
- [ ] **Task 1.2: Standardize Data Models to HL7 FHIR**  
  Refactor `ehrContract.js` and `labresults` chaincode to accept valid FHIR JSON schemas for `Patient`, `Observation`, and `MedicationRequest`.
- [ ] **Task 1.3: Unified Cross-Org Fabric Channel (`ehr-federated-channel`)**  
  Merge `HospitalOrg`, `PharmacyOrg`, and `LabOrg` into a single multi-organization Fabric channel (`ehrchannel`) with explicit endorsement policies requiring `AND('HospitalMSP.peer', 'LabMSP.peer')`.

### Phase 2: Core Feature Extensions (Sprint 3-4)
- [ ] **Task 2.1: Native Patient Consent Management UI**  
  Expand the React frontend to display a real-time list of active doctor grants, with interactive time sliders (1 hr, 24 hrs, 7 days) and instant one-click revocation buttons.
- [ ] **Task 2.2: Automated Pharmacy Stock Deduction Chaincode Hook**  
  Implement chaincode event listeners (`ctx.stub.setEvent`) so when a Doctor signs a prescription in `HospitalOrg`, an event triggers `PharmacyOrg` chaincode to reserve stock.
- [ ] **Task 2.3: Agentic AI Multimodal Image Parsing**  
  Extend `ai-agent.js` to send raw X-ray/MRI image buffers directly to Gemini 2.5 Flash Vision capabilities for diagnostic annotation.

### Phase 3: Production Deployment Readiness (Sprint 5-6)
- [ ] **Task 3.1: Kubernetes (k8s) Helm Chart Orchestration**  
  Migrate standalone Docker Swarm compose files to Kubernetes Helm charts for auto-scaling Fabric peers and IPFS nodes.
- [ ] **Task 3.2: Automated CI/CD Pipeline & Chaincode Testing**  
  Add GitHub Actions workflows to run unit tests (`npm test` via Fabric MockStub) and linting on every pull request.

---

## 3. Known Technical Debt & Immediate Refactoring Targets

1. **Hardcoded IP Addresses in Host Template Files:**  
   `templates/hosts.final` contains hardcoded IPs (`10.166.46.138`, `10.166.46.204`). Must be replaced with dynamic DNS resolution or environment variable substitution.
2. **Duplicate Codebases Across Student Folders:**  
   `Avijit_Ram` and `Rahul` folders contain identical copies of `ehr-backend-v3` and `ehr-chaincode-v3`. Consolidate into a single version-controlled root repository.
3. **Synchronous File Upload Handling:**  
   `server.js` processes PDF OCR and IPFS upload synchronously inside `POST /api/records/ipfs`. For large files, this can cause HTTP request timeouts. Should be converted to an asynchronous worker queue (e.g. BullMQ / Redis).

