# EHR Blockchain Project — Migration & Recovery Notes

> **Date:** October 14, 2026  
> **Target OS:** Ubuntu 26.04.1 LTS (Resolute Raccoon), x86_64  
> **Source Platform:** Windows / WSL  
> **Git Branch:** `fix-recover-and-run`  

---

## 1. Executive Summary

This project was originally developed across fragmented folders from 5 student team members on Windows and partially migrated to Ubuntu. During inspection, the project could not run due to missing OS packages (Docker, Node.js), invalid file permissions, corrupted Git configuration, hardcoded Windows paths (`/mnt/c/Users/...`), and Windows line endings (CRLF).

Through systematic phases (0 to 5), the entire codebase has been audited, repaired, and brought to a **100% operational state**. The Hyperledger Fabric network (v2.5.15) with 5 peers, 1 Raft orderer, 4 CAs, and an IPFS Kubo node is running and verified with real blockchain transactions.

---

## 2. Inventory of BASE Modules & Recovery Status

| Module | Source in BASE | Location in NEW | Status & Recovery Details |
|---|---|---|---|
| **Hospital Org** | `EHR_hospitalOrg-main/` | `orgs/hospital/EHR_hospitalOrg-main/` | **100% Intact**. 0 missing files. All backend APIs, contracts, network configs, and frontends verified. Content differences were intentional improvements. |
| **Lab Org** | `EHR-LABORG-main/` | `orgs/lab/EHR-LABORG-main/` | **100% Intact**. 0 missing files. Clean configs and contracts present. Deployed artifacts separated. |
| **Pharmacy Org** | `base work/` (PPT only) | `orgs/pharmacy/fabric-network-swarm/` | Present in NEW repo with 6 sub-applications. Hardcoded Windows paths replaced with dynamic path resolvers. |
| **Digilocker Module** | `base work/` (Not present) | `orgs/digilocker/` | Design specification README only. Deferred per user preference. |
| **Fabric Binaries** | `bin/` | `bin/` | Verified Linux ELF x86-64 binaries for Fabric v2.5.15 and Fabric CA v1.5.17 (`peer`, `orderer`, `cryptogen`, `configtxgen`, `fabric-ca-client`, etc.). Fully functional. |

---

## 3. Detailed Fixes by Category

### A. Windows to Ubuntu Compatibility
1. **CRLF Line Endings:**
   - **Problem:** Shell scripts and Docker Compose YAML files had Windows `\r\n` line endings, causing `\r: command not found` errors in bash.
   - **Fix:** Converted all `.sh` and `.yaml` files across all modules to Unix LF format.
   - **Prevention:** Expanded [`.gitattributes`](file:///home/himanshu/Desktop/EHR_blockchain/.gitattributes) with `* text=auto eol=lf` and explicit definitions for shell scripts and configs.
2. **File Permissions:**
   - **Problem:** Files copied from Windows external storage lacked execute bits (`chmod +x`).
   - **Fix:** Applied executable permissions to all `.sh` scripts and binaries in `bin/`.
3. **Hardcoded Windows Paths:**
   - **Problem:** Hospital backend `.env` files and Pharmacy connection profiles contained `/mnt/c/Users/himan/Desktop/EHR_blockchain/...`.
   - **Fix:** Updated all `.env` files to `/home/himanshu/Desktop/EHR_blockchain/...` and updated [`registerAdmin.js`](file:///home/himanshu/Desktop/EHR_blockchain/orgs/pharmacy/fabric-network-swarm/app/backend/registerAdmin.js) to resolve paths dynamically relative to `__dirname`.
4. **Windows Startup Scripts:**
   - **Problem:** `start-sequential.ps1` only worked in PowerShell on Windows.
   - **Fix:** Created [`start-sequential.sh`](file:///home/himanshu/Desktop/EHR_blockchain/start-sequential.sh) providing full service lifecycle management (`install`, `start`, `stop`, `restart`, `status`).

### B. Git Configuration
1. **Corrupt `.gitignore`:**
   - **Problem:** The original `.gitignore` contained UTF-16 BOM mixed with UTF-8 (`p\0a\0c\0k\0a\0g\0e...`), breaking git operations.
   - **Fix:** Replaced with a clean, comprehensive UTF-8 `.gitignore` covering `node_modules`, `wallet`, `channel-artifacts`, `*.log`, and temporary build outputs.

### C. Hyperledger Fabric Network & Orchestration
1. **Dynamic Path Resolution in Scripts:**
   - **Problem:** Network startup scripts (`network-up.sh`, `enroll.sh`, `deployChaincode.sh`, `test-chaincode-v2.sh`) failed because Fabric binaries were not in the default system `PATH`.
   - **Fix:** Added automatic `REPO_ROOT/bin` discovery to each script so they execute reliably from any directory.
2. **Docker Environment & Images:**
   - **Problem:** Host lacked Docker, Docker Compose, Node.js, and Fabric container images.
   - **Fix:** Installed Docker 29.1, Compose 2.40, Node.js v22.22, and pulled official images:
     - `hyperledger/fabric-peer:2.5.15` (tagged `latest`)
     - `hyperledger/fabric-orderer:2.5.15` (tagged `latest`)
     - `hyperledger/fabric-ca:1.5.17` (tagged `latest`)
     - `hyperledger/fabric-nodeenv:2.5`
     - `hyperledger/fabric-ccenv:2.5`
     - `ipfs/kubo:latest`

### D. Node Modules & Dependencies
1. **Windows Native Node Addons:**
   - **Problem:** Existing `node_modules` contained Windows prebuilt binaries (e.g. `debug/src/node.js` missing error).
   - **Fix:** Purged Windows-built `node_modules` across backends, chaincodes, and frontends and cleanly installed fresh Linux packages.

---

## 4. Operational Verification Evidence

| Component | Port | Health Check / Verification Output |
|---|---|---|
| **Fabric CAs (4)** | 7054, 7055, 7056, 7057 | `All 4 CA certs found. Enrolled admin, peer, and user identities.` |
| **Orderer (Raft)** | 7050, 7053 | `Status: 201 - Channel 'ehrchannel' active on orderer` |
| **Hospital Peers (3)** | 7051, 9051, 10051 | `All 3 peers joined ehrchannel. Anchor peer committed.` |
| **Diagnostics Peer** | 8051 | `Joined ehrchannel. Anchor peer committed.` |
| **Provider Peer** | 11051 | `Joined ehrchannel. Anchor peer committed.` |
| **IPFS Kubo Node** | 5001, 8090 | `{"online":true,"nodeId":"12D3KooWHJ2hdv8zrJzpW1GGmUAyz7oPAaUmovcKeA7WrsPAgAiz"}` |
| **IPFS Service** | 4006 | `{"success":true,"service":"ipfs-service","online":true}` |
| **Reception / Admin API** | 4001 | `Login OK. Patient PAT-DEMO-001 registered on-chain with IPFS CID.` |
| **Doctor API** | 4002 | `Diagnosis & prescription recorded on-chain. Visit finalized.` |
| **Nurse / Pharmacy API** | 4003 | `Medication dispensed on-chain by pharmacist with CID update.` |
| **Hospital Web Portal** | 5173 | `Vite build completed (598ms). HTTP 200 OK serving React app.` |
| **Patient Web Portal** | 5174 | `Vite build completed (675ms). HTTP 200 OK serving React app.` |

---

## 5. Leftover Risks & Notes
1. **Docker Socket Permission:** On system reboot, if your user session does not inherit the `docker` group automatically, run `sudo chmod 666 /var/run/docker.sock`.
2. **Digilocker Module:** Currently exists as a design specification only (`orgs/digilocker/README.md`). If required in future sprints, the encryption and IPFS vault frontend can be implemented according to that specification.
3. **Avijit .env Reference Material:** Reference `.env` values and mock dumps are preserved in `base work/` for review if needed.
