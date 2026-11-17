# DigiLocker Demonstration — One-Page Cheat Sheet

## 1. Architecture Diagram
```text
                      ehrchannel
                          │
       ┌──────────────────┼──────────────────┐
      ehr            labresults          digilocker
                                             │
                       ┌─────────────────────┼─────────────────────┐
                  HospitalMSP          DiagnosticsMSP         ProviderMSP
                  (Port 7058)           (Port 8051)           (Port 11051)
```

---

## 2. Environment & Network Verification Commands
```bash
# Set environment
export PATH=/mnt/d/Javed/PBL_EHR/CODESAPCE/bin:$PATH
export FABRIC_CFG_PATH=/mnt/d/Javed/PBL_EHR/CODESAPCE/config
cd /mnt/d/Javed/PBL_EHR/CODESAPCE/orgs/hospital/EHR_hospitalOrg-main/ehr-network
source scripts/utils.sh && source scripts/envVar.sh
ORDERER_TLS="/mnt/d/Javed/PBL_EHR/CODESAPCE/orgs/hospital/EHR_hospitalOrg-main/ehr-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"

# Check containers
docker ps --format "table {{.Names}}\t{{.Status}}"
```

---

## 3. Channel Membership Verification
```bash
setGlobals 1 && peer channel list   # Hospital  -> ehrchannel
setGlobals 2 && peer channel list   # Diagnostics -> ehrchannel
setGlobals 3 && peer channel list   # Provider  -> ehrchannel
```

---

## 4. Chaincode Commitment Verification
```bash
setGlobals 1
peer lifecycle chaincode querycommitted --channelID ehrchannel --name digilocker --tls --cafile $ORDERER_TLS
# Expected: Approvals: [DiagnosticsMSP: true, HospitalMSP: true, ProviderMSP: true]
```

---

## 5. Live Demo Commands

### Create Document (`DOC2001`)
```bash
setGlobals 3
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_TLS -C ehrchannel -n digilocker --peerAddresses localhost:11051 --tlsRootCertFiles $PEER0_PROVIDER_CA -c '{"Args":["DigilockerContract:CreateDocument","DOC2001","PAT001","HOSP_001","HospitalMSP","DischargeSummary","Live Demo Summary","a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0","QmLiveDemoCID123456789"]}'
```
*Wait 3 seconds for block commit.*

### Retrieve Document (`DOC2001`)
```bash
peer chaincode query -C ehrchannel -n digilocker -c '{"Args":["DigilockerContract:GetDocument","DOC2001"]}'
```

### Verify Authentic Document (Matching Hash)
```bash
peer chaincode query -C ehrchannel -n digilocker -c '{"Args":["DigilockerContract:VerifyDocument","DOC2001","a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"]}'
# Output: {"valid": true, ...}
```

### Verify Tampered Document (Modified Hash)
```bash
peer chaincode query -C ehrchannel -n digilocker -c '{"Args":["DigilockerContract:VerifyDocument","DOC2001","9999999999999999999999999999999999999999999999999999999999999999"]}'
# Output: {"valid": false, ...}
```

---

## 6. Expected Output Summary
- `querycommitted`: Version `1.0`, Sequence `1`, `Approvals: [DiagnosticsMSP: true, HospitalMSP: true, ProviderMSP: true]`.
- `invoke`: `Chaincode invoke successful. result: status:200`.
- `query GetDocument`: JSON object with doc metadata.
- `VerifyDocument` valid: `{"documentId":"DOC2001","valid":true,...}`.
- `VerifyDocument` tampered: `{"documentId":"DOC2001","valid":false,...}`.

---

## 7. 10 Likely Teacher Questions & Fast Answers

1. **Q: Why is DigiLocker on `ehrchannel` instead of a new channel?**
   - *A: `ehrchannel` represents the shared EHR ledger where Hospital, Diagnostics, and Insurance Provider collaborate on common patient records.*

2. **Q: Is the actual PDF file stored on the blockchain?**
   - *A: No. Heavy files are stored off-chain on IPFS (`ipfsCID`). Only SHA-256 metadata (`fileHash`) is saved on Fabric for performance and privacy.*

3. **Q: How does DigiLocker detect tampered documents?**
   - *A: `VerifyDocument` re-calculates the SHA-256 hash of the presented file and compares it with the immutable `fileHash` stored on-chain.*

4. **Q: What endorsement policy is configured for DigiLocker?**
   - *A: `OR('HospitalMSP.peer','DiagnosticsMSP.peer','ProviderMSP.peer')`, allowing any of the three authorized organization peers to endorse transactions.*

5. **Q: What chaincode sequence and version are deployed?**
   - *A: Version `1.0`, Sequence `1` across all three organizations.*

6. **Q: How are organization identities managed?**
   - *A: Each organization has its own Fabric CA (`ca-hospital`, `ca-diagnostics`, `ca-provider`) issuing X.509 certificates and TLS certificates.*

7. **Q: Why is `GetPatientDocuments` currently disabled?**
   - *A: `GetPatientDocuments` relies on CouchDB rich queries (`getQueryResult`). The current peer containers run default LevelDB; CouchDB setup is in Phase 1 roadmap.*

8. **Q: What happens if a duplicate `documentId` is registered?**
   - *A: The contract checks `getState(key)` and throws `Document <id> already exists` error.*

9. **Q: Can ProviderMSP read documents issued by HospitalMSP?**
   - *A: Yes, because DigiLocker is a shared chaincode on `ehrchannel`, all joined peers share the ledger state database.*

10. **Q: How is IPFS linked to Fabric?**
    - *A: IPFS provides a Content Identifier (`ipfsCID`) which is stored in the ledger state record alongside `fileHash`.*

---

## 8. Emergency Troubleshooting Commands

```bash
# Restart missing container (e.g. Provider peer)
docker start docker-peer0.provider.example.com-1

# Check container logs
docker logs --tail 50 docker-peer0.provider.example.com-1

# Verify port bindings
netstat -ano | grep 11051
```
