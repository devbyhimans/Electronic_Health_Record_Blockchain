# DigiLocker — Future Improvements & Roadmap

## Phase 1 — Immediate (Infrastructure & Query Enhancements)
*Target Timeline: Next Sprint*

- **Enable CouchDB State Database**:
  - Update `docker-compose.yaml` to spin up dedicated CouchDB sidecars for `peer0.hospital`, `peer0.diagnostic`, and `peer0.provider` (e.g., `couchdb-hospital`, `couchdb-diagnostic`, `couchdb-provider`).
  - Configure peer environment variables: `CORE_LEDGER_STATE_STATEDATABASE=CouchDB` and `CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS`.
- **Enable `GetPatientDocuments()` Rich Queries**:
  - Verify CouchDB indexing for `docType` and `patientId` selector fields.
  - Test patient-wise document listing across `HospitalMSP`, `DiagnosticsMSP`, and `ProviderMSP`.
- **Complete Multi-Org Automated Test Suite**:
  - Expand test scripts to automate cross-org transaction submission and validation across all three peer nodes simultaneously.

---

## Phase 2 — Security & Authorization (Contract-Level RBAC)
*Target Timeline: Phase 2 Development*

*Note: The current chaincode implements core document registration and verification logic. The following access controls are identified for future implementation:*

- **Caller MSP Validation (`ctx.clientIdentity`)**:
  - Enforce that only authorized organization MSPs can issue specific document types.
  - Example rules:
    - `HospitalMSP`: Authorized for `DischargeSummary`, `Prescription`, `MedicalReport`.
    - `DiagnosticsMSP`: Authorized for `LabReport`, `RadiologyScan`.
    - `ProviderMSP`: Authorized for `InsurancePolicy`, `ClaimApproval`.
- **Patient Consent & Access Control**:
  - Implement access control lists (ACL) or encrypted key sharing on-chain.
  - Restrict `GetDocument` queries so only the patient (`patientId`) or authorized healthcare providers can retrieve metadata records.
- **Document Revocation & Expiration**:
  - Add `RevokeDocument(documentId, reason)` transaction to mark obsolete or revoked credentials without deleting ledger history.

---

## Phase 3 — Real IPFS Integration Workflow
*Target Timeline: Phase 3 Development*

*Current Status: IPFS CID is currently accepted as a string parameter. Full end-to-end client integration pipeline planned:*

```text
[ Client App / Portal ]
       │
       ├─► 1. Select Medical Document (PDF)
       ├─► 2. Compute Client-Side SHA-256 Hash
       ├─► 3. Encrypt File Payload (AES-256)
       ├─► 4. Upload Encrypted File to IPFS Node (`ipfs.add()`)
       │        └─► Returns `ipfsCID`
       │
       └─► 5. Invoke Fabric DigiLocker Chaincode:
                `CreateDocument(docId, patId, issuerId, issuerOrg, docType, title, fileHash, ipfsCID)`
```

---

## Phase 4 — Backend / REST API Integration
*Target Timeline: Phase 4 Development*

- **Node.js Express Gateway Integration**:
  - Build REST API endpoints exposing DigiLocker features using `@hyperledger/fabric-gateway` (or `fabric-network` SDK):
    - `POST /api/digilocker/documents` -> `CreateDocument`
    - `GET /api/digilocker/documents/:id` -> `GetDocument`
    - `POST /api/digilocker/documents/verify` -> `VerifyDocument`
    - `GET /api/digilocker/patients/:patientId/documents` -> `GetPatientDocuments`
- **Wallet & Connection Profile Management**:
  - Maintain identity wallets for Hospital Admins, Doctors, Lab Techs, and Insurance Agents.

---

## Phase 5 — Frontend User Interfaces
*Target Timeline: Phase 5 Development*

- **Patient DigiLocker Portal**:
  - **My Health Wallet**: View list of all issued medical records and insurance policies.
  - **Document Viewer**: Download encrypted file from IPFS CID and decrypt locally.
  - **Integrity Checker Widget**: Drag-and-drop any local medical PDF to instantly verify its SHA-256 hash against `ehrchannel` ledger.
  - **Consent Manager**: Share specific document CIDs with doctors or insurance providers with temporary expiration.

---

## Phase 6 — Advanced Features & Governance
*Target Timeline: Future Roadmap*

- **On-Chain Verification Audit Trail**:
  - Record log entries whenever an external entity verifies a document's hash to prevent unauthorized document probing.
- **Document Versioning**:
  - Support document update chains (`supersedesDocumentId`) for amended lab reports or renewed insurance policies while preserving immutable audit logs.
- **Cross-Channel Interoperability**:
  - Enable chaincode-to-chaincode calls between `digilocker` and core `ehr` or `labresults` chaincodes.
