# DigiLocker Implementation — Work Completed Today

## 1. Objective
The primary objective of integrating DigiLocker into the EHR (Electronic Health Records) Hyperledger Fabric blockchain network is to establish a **tamper-proof, verifiable metadata registry for medical documents** while keeping raw files off-chain.

Storing large binary files (e.g., MRI scans, lab PDFs, discharge summaries) directly on the Fabric ledger is inefficient and degrades performance. Instead, DigiLocker employs a **hybrid storage model**:
- **Off-Chain Storage (IPFS)**: The encrypted medical document is stored on IPFS, generating a Content Identifier (`ipfsCID`).
- **Cryptographic Fingerprint (SHA-256)**: A SHA-256 hash (`fileHash`) is computed from the document bytes.
- **On-Chain Ledger (Fabric)**: Immutable document metadata (`documentId`, `patientId`, `issuerId`, `issuerOrg`, `documentType`, `title`, `fileHash`, `ipfsCID`, `createdAt`) is recorded on `ehrchannel`.

This architecture enables instant cryptographic verification of document authenticity without exposing sensitive medical payloads to unauthorized parties.

---

## 2. Starting State
Prior to today's operations, the network architecture and status stood as follows:

- **Active Network Containers**:
  - `orderer.example.com` (Raft Orderer, ports `7050`, `7053`)
  - `peer0.lab.example.com` (Diagnostics org peer, port `7051`)
  - `couchdb-peer0.lab.example.com` (CouchDB instance)
  - Fabric CA containers (`ca-hospital`, `ca-diagnostics`, `ca-provider`, `ca-orderer`)
- **Exited/Unconfigured Containers**:
  - `peer0.hospital.example.com` had previously exited (code 1) due to missing MSP cryptographic identities (`signcerts/` missing).
  - `peer0.provider.example.com` was not yet enrolled or running on `ehrchannel`.
- **Existing Channel & Chaincodes**:
  - Channel `ehrchannel` existed on Orderer and Hospital/Diagnostics orgs.
  - Pre-existing chaincodes: `ehr` and `labresults`.

---

## 3. ProviderMSP Integration

To make DigiLocker a shared authority across all network stakeholders, `ProviderMSP` (`peer0.provider.example.com`) was fully integrated as a third equal member of `ehrchannel`.

### A. Provider Identity Registration & Enrollment
Using `fabric-ca-client` (v1.5.17), cryptographic materials were generated from `ca-provider` (port `7057`):
1. **CA Admin Enrollment**: Enrolled `admin` with `ca-provider` to obtain admin credentials.
2. **Peer Identity Registration**: Registered `peer0` with secret `peer0pw` under type `peer`.
3. **Peer MSP Enrollment**:
   ```bash
   fabric-ca-client enroll \
     -u https://peer0:peer0pw@localhost:7057 \
     --caname ca-provider \
     -M /mnt/d/Javed/PBL_EHR/CODESAPCE/orgs/hospital/EHR_hospitalOrg-main/ehr-network/organizations/peerOrganizations/provider.example.com/peers/peer0.provider.example.com/msp \
     --tls.certfiles /mnt/d/Javed/PBL_EHR/CODESAPCE/orgs/hospital/EHR_hospitalOrg-main/ehr-network/organizations/fabric-ca/provider/tls-cert.pem
   ```
4. **Peer TLS Enrollment**:
   ```bash
   fabric-ca-client enroll \
     -u https://peer0:peer0pw@localhost:7057 \
     --caname ca-provider \
     -M /mnt/d/Javed/PBL_EHR/CODESAPCE/orgs/hospital/EHR_hospitalOrg-main/ehr-network/organizations/peerOrganizations/provider.example.com/peers/peer0.provider.example.com/tls \
     --enrollment.profile tls \
     --csr.hosts peer0.provider.example.com,localhost \
     --tls.certfiles /mnt/d/Javed/PBL_EHR/CODESAPCE/orgs/hospital/EHR_hospitalOrg-main/ehr-network/organizations/fabric-ca/provider/tls-cert.pem
   ```
5. **Provider Admin Enrollment**: Enrolled `provideradmin` to obtain `PROVIDER_ADMIN_MSP`.

### B. Provider Peer Startup
- **Docker Service**: Started `docker-peer0.provider.example.com-1`.
- **Port Allocation**: Host `11051` mapped to container `11051` (`0.0.0.0:11051->11051/tcp`).
- **Container Health**: Peer started cleanly without errors, displaying active Gossip and gRPC endpoints.

### C. Joining `ehrchannel`
Using `ProviderMSP` identity and `PROVIDER_ADMIN_MSP`:
```bash
export CORE_PEER_LOCALMSPID="ProviderMSP"
export CORE_PEER_ADDRESS="localhost:11051"
export CORE_PEER_MSPCONFIGPATH="$PROVIDER_ADMIN_MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_PROVIDER_CA"

peer channel join -b ./channel-artifacts/ehrchannel.block
```
*Verification*: `peer channel list` returned `ehrchannel` on all three peer endpoints (`Hospital`: `7058`, `Diagnostics`: `8051`, `Provider`: `11051`).

---

## 4. DigiLocker Multi-Organization Integration

DigiLocker is deployed as a single shared chaincode on `ehrchannel`. The Fabric 2.x chaincode lifecycle process was executed across all member organizations:

```text
Package Chaincode
       │
       ▼
Install on Peers (Hospital, Diagnostics, Provider)
       │
       ▼
Approve for my Org (HospitalMSP, DiagnosticsMSP, ProviderMSP)
       │
       ▼
Check Commit Readiness (All orgs = true)
       │
       ▼
Commit Definition to Channel
```

### Lifecycle Commands Executed:

1. **Packaging**:
   ```bash
   peer lifecycle chaincode package channel-artifacts/digilocker_1.0.tar.gz \
     --path ../../../digilocker/chaincode \
     --lang node \
     --label digilocker_1.0
   ```
   *Generated Package ID*: `digilocker_1.0:76cd11ffeb89928802da1da8f867499c71a24e66a7ac57c979d04048e50f6735`

2. **Installation**:
   Installed package on `peer0.hospital.example.com`, `peer0.diagnostic.example.com`, and `peer0.provider.example.com`.

3. **Approval across Orgs**:
   Approved definition for `HospitalMSP`, `DiagnosticsMSP`, and `ProviderMSP` with explicit signature endorsement policy:
   ```bash
   peer lifecycle chaincode approveformyorg \
     -o localhost:7050 \
     --ordererTLSHostnameOverride orderer.example.com \
     --channelID ehrchannel \
     --name digilocker \
     --version 1.0 \
     --package-id digilocker_1.0:76cd11ffeb89928802da1da8f867499c71a24e66a7ac57c979d04048e50f6735 \
     --sequence 1 \
     --signature-policy "OR('HospitalMSP.peer','DiagnosticsMSP.peer','ProviderMSP.peer')" \
     --tls \
     --cafile $ORDERER_TLS
   ```

4. **Commitment**:
   Committed definition to `ehrchannel` targeting peer addresses from all participating organizations.

---

## 5. Final Chaincode State

Querying the committed chaincode definition (`peer lifecycle chaincode querycommitted`) across all three peer nodes confirms:

```text
Committed chaincode definition for chaincode 'digilocker' on channel 'ehrchannel':
Version: 1.0, Sequence: 1, Endorsement Plugin: escc, Validation Plugin: vscc, 
Approvals: [DiagnosticsMSP: true, HospitalMSP: true, ProviderMSP: true]
```

- **Chaincode Name**: `digilocker`
- **Version**: `1.0`
- **Sequence**: `1`
- **Channel**: `ehrchannel`
- **Endorsement Policy**: `OR('HospitalMSP.peer','DiagnosticsMSP.peer','ProviderMSP.peer')`
- **Approvals**: `HospitalMSP: true`, `DiagnosticsMSP: true`, `ProviderMSP: true`

---

## 6. ProviderMSP Verification

Transactions were submitted targeting `peer0.provider.example.com` (`localhost:11051`) using `ProviderMSP` credentials:

1. **`CreateDocument` (`DOC1002`)**:
   - Registered insurance policy metadata.
   - On-chain status: `200 (VALID)`.

2. **`CreateDocument` (`DOC1003`)**:
   - Registered insurance claim metadata.
   - On-chain status: `200 (VALID)`.

3. **`GetDocument` (`DOC1003`)**:
   - Query returned the exact JSON payload stored on-chain.

4. **`VerifyDocument` (`DOC1003`)**:
   - Verified matching SHA-256 hash -> returned `{"valid": true}`.

---

## 7. DigiLocker Data Model

Every DigiLocker document metadata record is stored under key `DOC:<documentId>` with the following schema:

```json
{
  "docType": "digilockerDocument",
  "documentId": "DOC1003",
  "patientId": "PAT003",
  "issuerId": "INSURER_001",
  "issuerOrg": "ProviderMSP",
  "documentType": "InsuranceClaim",
  "title": "Discharge Summary & Claim",
  "fileHash": "f0e1d2c3b4a59876543210123456789abcdef0123456789abcdef0123456789a",
  "ipfsCID": "QmProviderClaimCID987654321",
  "createdAt": "2026-09-27T22:29:54.587Z"
}
```

---

## 8. Hash + IPFS + Fabric Architecture

```text
                  Medical Document File (PDF / Image)
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       Compute SHA-256 Hash              Upload to IPFS
                 │                               │
                 ▼                               ▼
        fileHash (64 hex)                ipfsCID (Qm...)
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                     DigiLocker Chaincode
                     (CreateDocument Call)
                                 │
                                 ▼
                     Fabric Ledger (ehrchannel)
             [Immutably stored document metadata]
```

- **Stored on Fabric Ledger**: `documentId`, `patientId`, `issuerId`, `issuerOrg`, `documentType`, `title`, `fileHash`, `ipfsCID`, `createdAt`.
- **Stored on IPFS**: The actual binary file content. The ledger holds only the Content Identifier (`ipfsCID`) and the cryptographic checksum (`fileHash`).

---

## 9. Transactions Tested

| Transaction | Organization | Parameters / Document ID | Result |
| :--- | :--- | :--- | :--- |
| `CreateDocument` | `HospitalMSP` | `DOC1001`, `PAT001`, `HOSP_001`, `HospitalMSP`, `LabReport`, `Blood Test`, hash, CID | **SUCCESS** |
| `GetDocument` | `HospitalMSP` | `DOC1001` | **SUCCESS** |
| `VerifyDocument` (authentic) | `HospitalMSP` | `DOC1001`, correct hash | **SUCCESS** (`valid: true`) |
| `VerifyDocument` (tampered) | `HospitalMSP` | `DOC1001`, modified hash | **SUCCESS** (`valid: false`) |
| `CreateDocument` | `ProviderMSP` | `DOC1002`, `PAT002`, `INSURER_001`, `ProviderMSP`, `InsurancePolicy`, title, hash, CID | **SUCCESS** |
| `CreateDocument` | `ProviderMSP` | `DOC1003`, `PAT003`, `INSURER_001`, `ProviderMSP`, `InsuranceClaim`, title, hash, CID | **SUCCESS** |
| `GetDocument` | `ProviderMSP` | `DOC1003` | **SUCCESS** |
| `VerifyDocument` | `ProviderMSP` | `DOC1003`, correct hash | **SUCCESS** (`valid: true`) |

---

## 10. Known Issue

### `GetPatientDocuments()` Rich Query Limitation
- **Status**: Currently unavailable in the active test environment.
- **Root Cause**: `GetPatientDocuments()` invokes `ctx.stub.getQueryResult(JSON.stringify(query))` which executes a JSON selector query (`docType == 'digilockerDocument'` AND `patientId == patientId`).
- **Database Dependency**: Fabric requires **CouchDB** state database to process `getQueryResult` rich queries. The active peer containers are running with default **LevelDB** key-value storage.
- **Planned Fix**: Transition peer state database configurations to CouchDB (Phase 1 Roadmap).

---

## 11. Final Architecture

```text
                                ehrchannel
                                    │
           ┌────────────────────────┼────────────────────────┐
           │                        │                        │
          ehr                  labresults                digilocker
  (EHR Medical Record)    (Diagnostic Lab Results)   (Document Verification)
                                                             │
                                ┌────────────────────────────┼────────────────────────────┐
                                │                            │                            │
                           HospitalMSP                 DiagnosticsMSP                ProviderMSP
                       (peer0.hospital:7058)      (peer0.diagnostic:8051)      (peer0.provider:11051)
```

---

## 12. What We Accomplished Today

- Repaired and started `peer0.hospital.example.com` and `peer0.provider.example.com`.
- Configured MSP cryptographic identities and TLS certificates for `ProviderMSP`.
- Joined `peer0.provider.example.com` to `ehrchannel`.
- Successfully deployed `digilocker` v1.0 sequence 1 across `HospitalMSP`, `DiagnosticsMSP`, and `ProviderMSP`.
- Achieved unanimous lifecycle approvals (`3/3 orgs: true`).
- Verified multi-organization transaction execution (`CreateDocument`, `GetDocument`, `VerifyDocument`) from `ProviderMSP`.
- Confirmed cryptographic document integrity verification (`valid: true` for authentic hash, `valid: false` for tampered hash).

---

## 13. What We Did NOT Change

- `ehr` chaincode contract logic and code remain **100% unchanged**.
- `labresults` chaincode contract logic and code remain **100% unchanged**.
- Existing core EHR records, channel policies, and orderer configurations remain **100% unchanged**.
