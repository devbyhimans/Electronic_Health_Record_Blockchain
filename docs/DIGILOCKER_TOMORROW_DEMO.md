# DigiLocker Live Fabric Demonstration

This guide provides a step-by-step presentation procedure for demonstrating the DigiLocker Fabric chaincode implementation live on `ehrchannel`. Follow this procedure line-by-line during the presentation.

---

## A. Before Starting Checklist

Ensure the following prerequisites are met prior to beginning the presentation:

- [ ] Docker Desktop is running.
- [ ] WSL environment is active (`wsl`).
- [ ] Fabric binaries (`peer`, `fabric-ca-client`) are available in PATH (`/mnt/d/Javed/PBL_EHR/CODESAPCE/bin`).
- [ ] Orderer container (`docker-orderer.example.com-1`) is running.
- [ ] Hospital peer container (`docker-peer0.hospital.example.com-1`) is running (port `7058`).
- [ ] Diagnostics peer container (`docker-peer0.diagnostic.example.com-1`) is running (port `8051`).
- [ ] Provider peer container (`docker-peer0.provider.example.com-1`) is running (port `11051`).
- [ ] Channel `ehrchannel` is active.
- [ ] Chaincode `digilocker` version 1.0 sequence 1 is committed.

---

## B. Start & Verify Fabric Network

Open a terminal and run the status check script or Docker command to verify running containers:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

**What to point out to the evaluator**:
> "As shown in docker status, all three peer nodes — Hospital (`7058`), Diagnostics (`8051`), and Provider (`11051`) — are active along with the raft Orderer (`7050`)."

---

## C. Verify All Three Organizations

Run `peer channel list` on each organization's peer endpoint:

```bash
export PATH=/mnt/d/Javed/PBL_EHR/CODESAPCE/bin:$PATH
export FABRIC_CFG_PATH=/mnt/d/Javed/PBL_EHR/CODESAPCE/config
cd /mnt/d/Javed/PBL_EHR/CODESAPCE/orgs/hospital/EHR_hospitalOrg-main/ehr-network
source scripts/utils.sh
source scripts/envVar.sh

echo "=== Hospital Org (Port 7058) ==="
setGlobals 1
peer channel list

echo "=== Diagnostics Org (Port 8051) ==="
setGlobals 2
peer channel list

echo "=== Provider Org (Port 11051) ==="
setGlobals 3
peer channel list
```

**Expected Output**:
Every organization peer returns `ehrchannel`.

---

## D. Verify DigiLocker Chaincode Commitment

Run `querycommitted` to demonstrate multi-organization approval:

```bash
ORDERER_TLS="/mnt/d/Javed/PBL_EHR/CODESAPCE/orgs/hospital/EHR_hospitalOrg-main/ehr-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"

setGlobals 1
peer lifecycle chaincode querycommitted --channelID ehrchannel --name digilocker --tls --cafile $ORDERER_TLS
```

**What to point out to the evaluator**:
> "Notice the approvals array: `[DiagnosticsMSP: true, HospitalMSP: true, ProviderMSP: true]`. DigiLocker has been packaged, installed, and approved unanimously across all three network authorities."

---

## E. Live Demo — Create Document Metadata

Run `CreateDocument` using a clean demo document ID (`DOC2001`):

```bash
setGlobals 3

peer chaincode invoke \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile $ORDERER_TLS \
  -C ehrchannel \
  -n digilocker \
  --peerAddresses localhost:11051 \
  --tlsRootCertFiles $PEER0_PROVIDER_CA \
  -c '{"Args":["DigilockerContract:CreateDocument","DOC2001","PAT001","HOSP_001","HospitalMSP","DischargeSummary","Live Demo Discharge Summary","a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0","QmLiveDemoCID123456789"]}'
```

**What to point out**:
> "We just registered a new medical document metadata record (`DOC2001`) for patient `PAT001`. The transaction returned `status:200` with the immutable record payload."

*Note: Allow 2–3 seconds for the orderer to cut a block and commit state to ledger.*

---

## F. Live Demo — Retrieve Document Metadata

Query the on-chain metadata for `DOC2001`:

```bash
peer chaincode query \
  -C ehrchannel \
  -n digilocker \
  -c '{"Args":["DigilockerContract:GetDocument","DOC2001"]}'
```

**Expected Output**:
```json
{
  "docType": "digilockerDocument",
  "documentId": "DOC2001",
  "patientId": "PAT001",
  "issuerId": "HOSP_001",
  "issuerOrg": "HospitalMSP",
  "documentType": "DischargeSummary",
  "title": "Live Demo Discharge Summary",
  "fileHash": "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
  "ipfsCID": "QmLiveDemoCID123456789",
  "createdAt": "..."
}
```

---

## G. Live Demo — Verify Authentic Document

Execute `VerifyDocument` using the correct SHA-256 hash:

```bash
peer chaincode query \
  -C ehrchannel \
  -n digilocker \
  -c '{"Args":["DigilockerContract:VerifyDocument","DOC2001","a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"]}'
```

**Expected Output**:
```json
{
  "documentId": "DOC2001",
  "valid": true,
  "storedHash": "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
  "calculatedHash": "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"
}
```

---

## H. Live Demo — Detect Tampered Document

Execute `VerifyDocument` with a modified hash (simulating a altered PDF):

```bash
peer chaincode query \
  -C ehrchannel \
  -n digilocker \
  -c '{"Args":["DigilockerContract:VerifyDocument","DOC2001","9999999999999999999999999999999999999999999999999999999999999999"]}'
```

**Expected Output**:
```json
{
  "documentId": "DOC2001",
  "valid": false,
  "storedHash": "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
  "calculatedHash": "9999999999999999999999999999999999999999999999999999999999999999"
}
```

**What to point out**:
> "Even if a single byte in the medical record is altered off-chain, the verification call instantly detects hash mismatch and returns `valid: false`."

---

## I. Multi-Organization Capability

Execute `GetDocument` from a different organization node (e.g., `DiagnosticsMSP` on port `8051`):

```bash
setGlobals 2
peer chaincode query \
  -C ehrchannel \
  -n digilocker \
  -c '{"Args":["DigilockerContract:GetDocument","DOC2001"]}'
```

**What to point out**:
> "Because `digilocker` is committed on `ehrchannel`, all three member organizations share the exact same ledger state and can query records seamlessly."

---

## J. 30-Second IPFS Explanation Script

> "To protect patient privacy and keep the blockchain performant, we never store heavy medical PDFs on the ledger. Instead, the document is saved on IPFS, which generates a unique Content Identifier (`ipfsCID`). We also generate a cryptographic SHA-256 hash (`fileHash`). Only these reference strings are stored immutably on Fabric. Anyone with the file can verify its hash against the ledger to prove it has not been forged."

---

## K. 30-Second Why Fabric Explanation Script

> "DigiLocker is deployed as chaincode directly on `ehrchannel` alongside `ehr` and `labresults`. This eliminates central points of failure and prevents any single hospital or insurer from tampering with document records. Every healthcare authority validates document transactions using Fabric's distributed consensus and smart contract lifecycle."

---

## L. Prepared Answer for Known Limitation (`GetPatientDocuments`)

**If asked: "Can you list all documents for a patient?"**

> "The contract includes a `GetPatientDocuments` function designed to perform JSON selector queries across state keys. In Hyperledger Fabric, rich queries require CouchDB as the peer state database. Our current container deployment uses default LevelDB, which supports key-value lookups (`GetDocument`) but not rich queries. Provisioning CouchDB sidecars is documented as Phase 1 of our future roadmap."

---

## M. Final Demo Summary

Concluding statement:
> "In summary, we have established a multi-organization DigiLocker chaincode on `ehrchannel` shared by HospitalMSP, DiagnosticsMSP, and ProviderMSP. We have verified document creation, metadata retrieval, authentic hash verification (`valid: true`), and tamper detection (`valid: false`)."
