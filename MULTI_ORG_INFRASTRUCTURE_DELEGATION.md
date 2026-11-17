# Multi-Organization Hyperledger Fabric Infrastructure Delegation Document
## Operational Integration Blueprint for HospitalOrg, LabOrg, and PharmacyOrg

**Document Version:** 1.0.0  
**Effective Date:** November 4, 2026  
**Target Channel:** `ehrchannel`  
**Classification:** Internal Engineering Specification  
**Status:** Approved for Implementation Planning (Pre-Execution Phase)

---

## A. Project Overview

### 1. Purpose and Target Architecture
The Electronic Health Record (EHR) blockchain project is transitioning from a single-organization test deployment to an enterprise multi-organization consortium. The ecosystem comprises three participating healthcare organizations:
1. **LabMSP (`lab.example.com`):** Diagnostic center, specimen testing, and lab result issuance.
2. **HospitalMSP (`hospital.example.com`):** Clinical care, patient admission, medical record authoring, and doctor consultations.
3. **PharmacyMSP (`pharmacy.example.com`):** Prescription validation, drug inventory, and medication dispensation.

The target state requires all three organizations to participate as peer nodes on a single, shared Hyperledger Fabric channel (`ehrchannel`), governed by a shared ordering service (`orderer.example.com:7050`). This unified channel underpins the cross-organization **DigiLocker** decentralized record and consent verification contract.

### 2. Operational Baseline
* **LabMSP is the ACTIVE FOUNDATION.** A live Fabric network is currently running with `orderer.example.com:7050`, `peer0.lab.example.com:7051`, and `couchdb-peer0.lab.example.com`. Channel `ehrchannel` is live at **block height 8**, storing active `labresults` chaincode transactions. This foundation must be preserved without ledger resets, container recreation, or volume destruction.
* **HospitalMSP is the IMMEDIATE REMEDIATION TARGET.** Cryptographic materials and Docker configurations exist on disk, but containers are stopped. The peer must be migrated from LevelDB to CouchDB, isolated from stale ledger data, re-networked to `fabric_labnet`, and configured to trust the Lab orderer.
* **PharmacyMSP is the FUTURE INTEGRATION TARGET.** Current repository templates point to generic `Org1MSP` and `mychannel`. Cryptographic identities, Docker services, and connection profiles must be authored in a future dedicated phase.

### 3. Architecture Topology Diagram

```mermaid
flowchart TD
    subgraph SharedOrdering ["Shared Ordering Service (Preserved Foundation)"]
        Orderer["orderer.example.com:7050<br/>(Lab Managed Orderer)"]
    end

    subgraph ChannelBoundary ["Shared Channel Boundary: ehrchannel (Live Height: 8)"]
        subgraph LabOrg ["LabMSP (Active Foundation)"]
            LabPeer["peer0.lab.example.com<br/>Host: 7051 | Internal: 7051"]
            LabDB[("couchdb-peer0.lab.example.com<br/>Internal: 5984")]
            LabPeer --- LabDB
        end

        subgraph HospitalOrg ["HospitalMSP (Remediation Target)"]
            HospPeer["peer0.hospital.example.com<br/>Host: 7058 | Internal: 7051"]
            HospDB[("couchdb-peer0.hospital.example.com<br/>Host: 5985 | Internal: 5984")]
            HospPeer --- HospDB
        end

        subgraph PharmacyOrg ["PharmacyMSP (Future Target)"]
            PharmPeer["peer0.pharmacy.example.com<br/>Host: 9051 | Internal: 7051"]
            PharmDB[("couchdb-peer0.pharmacy.example.com<br/>Host: 7984 | Internal: 5984")]
            PharmPeer --- PharmDB
        end
    end

    subgraph DockerBridge ["Shared Docker Network: fabric_labnet (Subnet: 172.19.0.0/16)"]
        LabPeer --- DockerBridge
        HospPeer --- DockerBridge
        PharmPeer -. Future Connect .- DockerBridge
        Orderer --- DockerBridge
    end

    LabPeer --- Orderer
    HospPeer --- Orderer
    PharmPeer -. Future Deliver .- Orderer
```

---

## B. HospitalOrg Responsibilities

The Hospital engineering team is responsible for remediating its local node configuration so that `peer0.hospital.example.com` can start safely, execute rich JSON queries against CouchDB, and establish verified mutual TLS communication with the shared Lab orderer.

> [!IMPORTANT]
> **Scope Restriction (Initial Single-Hospital-Peer Onboarding):**
> Hospital's legacy Docker Compose configuration declares multiple peer nodes (`peer0.hospital.example.com`, `peer1.hospital.example.com`, `peer2.hospital.example.com`, `peer0.diagnostic.example.com`, and `peer0.provider.example.com`).
> For this initial multi-organization integration phase:
> - **ONLY `peer0.hospital.example.com` and `couchdb-peer0.hospital.example.com` should be started.**
> - Keep `peer1.hospital.example.com`, `peer2.hospital.example.com`, diagnostic, and provider peers stopped.
> - **Host Port Collision Guard:** Hospital `peer1.hospital.example.com` is configured to bind to host port `9051:9051`. This directly conflicts with the planned Pharmacy peer (`peer0.pharmacy.example.com`), which is designated for host port `9051:7051`. Starting `peer1` will block Pharmacy onboarding.
> - **Preservation:** Do NOT delete the service configurations or existing volumes for `peer1`, `peer2`, or secondary peers; leave them safely stopped and unreferenced during this phase.

### Task H1: Inspect and Preserve Existing Hospital Peer Volume
* **Objective:** Ensure existing volume `docker_peer0.hospital.example.com` is preserved as an offline forensic archive and not overwritten or corrupted.
* **Exact Repository Path:** Docker local volume storage (`/var/lib/docker/volumes/docker_peer0.hospital.example.com/_data`).
* **Required Action:** Do not delete or prune this volume. Document its contents (109.6 KB `blockfile_000000` from an isolated, defunct test ledger).
* **Verification Command:**
  ```powershell
  docker volume inspect docker_peer0.hospital.example.com
  ```
* **Expected Result:** Volume inspection returns valid JSON metadata confirming volume exists and is detached from running containers.
* **Risks & Precautions:** Never run `docker volume rm docker_peer0.hospital.example.com` or `docker compose down -v`.

---

### Task H2: Prepare a Fresh Peer Production Volume
* **Objective:** Prevent fatal genesis block hash collisions when `peer0.hospital.example.com` joins the live `ehrchannel`.
* **Exact Repository File:** `orgs/hospital/EHR_hospitalOrg-main/ehr-network/docker/docker-compose-network.yaml`
* **Required Change:** Under `volumes:`, declare a fresh named volume `docker_peer0.hospital.production`, and mount it to `/var/hyperledger/production` in the `peer0.hospital.example.com` service block:
  ```yaml
  # Replace:
  # - peer0.hospital.example.com:/var/hyperledger/production
  # With:
  - docker_peer0.hospital.production:/var/hyperledger/production
  ```
* **Verification Command:** Inspect updated volume mapping in `docker-compose-network.yaml`.
* **Expected Result:** The peer starts with a clean `/var/hyperledger/production` filesystem, ready to sync authentic blocks from block 0 to 8+ upon joining `ehrchannel`.
* **Risks & Precautions:** If the peer is booted against the old volume, Fabric's blockprovider service will encounter a block 0 hash mismatch and crash with an unrecoverable `FORBIDDEN` error.

---

### Task H3: Configure Hospital Peer to Use CouchDB
* **Objective:** Replace embedded GoLevelDB with CouchDB to support rich JSON queries (`patientId`, status filtering) required by hospital clinical workflows and DigiLocker.
* **Exact Repository Files:**
  - `orgs/hospital/EHR_hospitalOrg-main/ehr-network/docker/docker-compose-network.yaml`
  - `orgs/hospital/EHR_hospitalOrg-main/ehr-network/configtx/core.yaml`
* **Required Change:**
  1. Add a CouchDB service block to `docker-compose-network.yaml`:
     ```yaml
     couchdb-peer0.hospital.example.com:
       container_name: couchdb-peer0.hospital.example.com
       image: couchdb:3.3
       environment:
         - COUCHDB_USER=admin
         - COUCHDB_PASSWORD=adminpw
       ports:
         - "5985:5984"
       networks:
         - default
     ```
  2. Configure peer environment variables in `peer0.hospital.example.com`:
     ```yaml
     - CORE_LEDGER_STATE_STATEDATABASE=CouchDB
     - CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS=couchdb-peer0.hospital.example.com:5984
     - CORE_LEDGER_STATE_COUCHDBCONFIG_USERNAME=admin
     - CORE_LEDGER_STATE_COUCHDBCONFIG_PASSWORD=adminpw
     ```
  3. Add `depends_on: [ couchdb-peer0.hospital.example.com ]`.
* **Verification Command:**
  ```powershell
  curl -s http://admin:adminpw@localhost:5985/
  ```
* **Expected Result:** CouchDB welcome JSON `{"couchdb":"Welcome","version":"3.3.3"}`.
* **Risks & Precautions:** Never expose CouchDB on port `5984` on the host, as it may conflict with default local developer database instances. Use `5985:5984`.

---

### Task H4: Update Docker Compose Network to `fabric_labnet`
* **Objective:** Enable direct, low-latency inter-container network routing between the Hospital peer and the shared Lab orderer without host proxy hops.
* **Exact Repository File:** `orgs/hospital/EHR_hospitalOrg-main/ehr-network/docker/docker-compose-network.yaml`
* **Required Change:** Change network definition from internal `ehr_network` to external `fabric_labnet`:
  ```yaml
  # Replace:
  # networks:
  #   ehr_network:
  # With:
  networks:
    default:
      name: fabric_labnet
      external: true
  ```
* **Verification Command:**
  ```powershell
  docker network inspect fabric_labnet
  ```
* **Expected Result:** `fabric_labnet` is listed as an active external bridge network on subnet `172.19.0.0/16`.
* **Risks & Precautions:** Do not delete or recreate `fabric_labnet`. It is actively serving `orderer.example.com` and `peer0.lab.example.com`.

---

### Task H5: Configure Peer and Chaincode Container Networking
* **Objective:** Ensure user chaincode containers spawned by `peer0.hospital.example.com` attach to `fabric_labnet` so they can communicate back to the peer.
* **Exact Repository File:** `orgs/hospital/EHR_hospitalOrg-main/ehr-network/docker/docker-compose-network.yaml`
* **Required Change:** In the `peer0.hospital.example.com` environment section:
  ```yaml
  # Replace:
  - CORE_VM_DOCKER_HOSTCONFIG_NETWORKMODE=ehr_network
  # With:
  - CORE_VM_DOCKER_HOSTCONFIG_NETWORKMODE=fabric_labnet
  ```
* **Verification Command:** Inspect container environment via `docker inspect`.
* **Expected Result:** `CORE_VM_DOCKER_HOSTCONFIG_NETWORKMODE` equals `fabric_labnet`.
* **Risks & Precautions:** If misconfigured, chaincode containers will launch on the default bridge and immediately time out attempting to connect to the peer's internal gRPC interface.

---

### Task H6: Resolve Peer and CouchDB Host-Port Conflicts
* **Objective:** Map Hospital services to unique host ports to avoid collisions with LabMSP and future PharmacyMSP.
* **Exact Repository File:** `orgs/hospital/EHR_hospitalOrg-main/ehr-network/docker/docker-compose-network.yaml`
* **Required Change:** Verify port bindings and restrict container scope:
  - `peer0.hospital.example.com`: `"7058:7051"` (gRPC), `"17051:17051"` (operations).
  - `couchdb-peer0.hospital.example.com`: `"5985:5984"`.
  - **Secondary Peers Status:** Ensure `peer1.hospital.example.com`, `peer2.hospital.example.com`, `peer0.diagnostic.example.com`, and `peer0.provider.example.com` remain in stopped state. Specifically, `peer1.hospital` maps host port `9051`, which is reserved for Pharmacy's `peer0.pharmacy.example.com`. Do not delete their configuration or volume blocks.
* **Verification Command:**
  ```powershell
  Get-NetTCPConnection -LocalPort 7058, 5985, 9051 -ErrorAction SilentlyContinue
  ```
* **Expected Result:** Ports `7058`, `5985`, and `9051` are completely free prior to container launch.
* **Risks & Precautions:** Under no circumstances bind `peer0.hospital` to host port `7051` (held by `peer0.lab.example.com`) or start `peer1.hospital` on port `9051` (reserved for `peer0.pharmacy.example.com`).

---

### Task H7: Disable Obsolete Standalone Orderer
* **Objective:** Eliminate container name and port collisions (`7050:7050`) caused by Hospital's legacy standalone orderer.
* **Exact Repository File:** `orgs/hospital/EHR_hospitalOrg-main/ehr-network/docker/docker-compose-network.yaml`
* **Required Change:** Comment out or remove the `orderer.example.com` service block and its volume declaration.
* **Verification Command:**
  ```powershell
  docker ps -a --filter "name=docker-orderer.example.com-1"
  ```
* **Expected Result:** Container remains stopped and will not be restarted by subsequent `docker compose up` invocations.
* **Risks & Precautions:** Starting Hospital's compose without disabling this service will fail immediately due to `Bind for 0.0.0.0:7050 failed: port is already allocated`.

---

### Task H8: Configure TLS Trust for Shared Lab Orderer
* **Objective:** Supply the Hospital peer and admin tools with the root TLS CA certificate of `orderer.example.com:7050`.
* **Exact Repository Files & Directories:**
  - `orgs/hospital/EHR_hospitalOrg-main/ehr-network/organizations/ordererOrganizations/example.com/msp/tlscacerts/`
  - Mount destination in peer container: `/etc/hyperledger/fabric/orderer-tls/tlsca.orderer.example.com-cert.pem`
* **Required Change:** Mount the shared public certificate `tlsca.orderer.example.com-cert.pem` (exported from LabOrg in Task L4) into `peer0.hospital.example.com`:
  ```yaml
  volumes:
    - ../../../../../shared/fabric-ca-certs/tlsca.orderer.example.com-cert.pem:/etc/hyperledger/fabric/orderer-tls/tlsca.orderer.example.com-cert.pem:ro
  ```
* **Working Directory & Path Resolution Requirements:**
  - The relative path `../../../../../shared/fabric-ca-certs/` depends strictly on the working directory used to execute Docker Compose (`orgs/hospital/EHR_hospitalOrg-main/ehr-network/docker/`).
  - Engineers must verify the resolved absolute certificate path on the host before starting services.
  - A stable shared artifact directory must be used (reference location: `<WORKSPACE_ROOT>/shared/fabric-ca-certs/tlsca.orderer.example.com-cert.pem`).
  - Where practical or when executing from outside the compose directory, use an appropriate absolute mount path or environment-variable configuration (e.g. `${SHARED_CA_CERTS_DIR}/tlsca.orderer.example.com-cert.pem`).
  - **SECURITY MANDATE:** Never attempt to solve path resolution issues by copying private keys into shared folders or altering key permissions.
* **Verification Command:**
  ```powershell
  docker exec peer0.hospital.example.com test -f /etc/hyperledger/fabric/orderer-tls/tlsca.orderer.example.com-cert.pem
  ```
* **Expected Result:** Exit code 0 (file exists and is readable).
* **Risks & Precautions:** Never attempt to connect over mutual TLS without specifying `--cafile`. Doing so causes gRPC handshake failure with `remote error: tls: bad certificate`.

---

### Task H9: Update Hospital Backend API Configuration
* **Objective:** Align the Hospital Node.js gateway with the new peer port and shared orderer TLS certificate.
* **Exact Repository Files:**
  - `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/peer0-api/.env`
  - `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/peer0-api/src/fabric/gatewayManager.js`
  - `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/peer0-api/src/fabric/peerRouter.js`
* **Required Change:** In `peer0-api/.env`:
  ```env
  PEER_ADDRESS=localhost:7058
  FABRIC_CHANNEL=ehrchannel
  ORDERER_TLS_CA=../../../../../shared/fabric-ca-certs/tlsca.orderer.example.com-cert.pem
  ```
* **Working Directory & Path Resolution Requirements:**
  - In `peer0-api`, relative paths are resolved relative to the Node.js process working directory (`process.cwd()`).
  - Engineers must verify that `ORDERER_TLS_CA` resolves to an authentic existing file before starting the API service.
  - Use a stable shared artifact directory (reference: `<WORKSPACE_ROOT>/shared/fabric-ca-certs/tlsca.orderer.example.com-cert.pem`) or configure an absolute path in `.env` if starting the service via process managers (e.g., PM2 or Docker).
  - **SECURITY MANDATE:** Never attempt to resolve path issues by copying private keys or admin keystores between organizations.
* **Verification Command:** Run syntax verification:
  ```powershell
  node -e "require('./src/fabric/peerRouter'); console.log('Router valid');"
  ```
* **Expected Result:** Router loads without throwing configuration errors.
* **Risks & Precautions:** Ensure `gatewayManager.js` uses `sig.toDERRawBytes()` when signing with modern `@noble/curves` to avoid protobuf serialization exceptions.

---

### Task H10: Resolve Legacy `DiagnosticsMSP` References
* **Objective:** Standardize organization identification strictly on `HospitalMSP`.
* **Exact Repository File:** `orgs/hospital/EHR_hospitalOrg-main/ehr-network/configtx/configtx.yaml`
* **Required Change:** Verify that `HospitalMSP` definition (MSPDir: `../organizations/peerOrganizations/hospital.example.com/msp`) is cleanly isolated from `DiagnosticsMSP`. Ensure export scripts only generate channel updates for `HospitalMSP`.
* **Verification Command:** Search for unresolved references:
  ```powershell
  Select-String -Path orgs/hospital/EHR_hospitalOrg-main/ehr-network/configtx/configtx.yaml -Pattern "DiagnosticsMSP"
  ```
* **Expected Result:** Legacy `DiagnosticsMSP` blocks are documented as deprecated and excluded from channel definition payloads submitted to `ehrchannel`.
* **Risks & Precautions:** Do not submit an MSP update naming `DiagnosticsMSP` to `ehrchannel`. The live channel already uses `LabMSP` for laboratory workflows.

---

### Task H11: Prepare Hospital Peer to Join `ehrchannel`
* **Objective:** Stage admin credentials and join scripts to execute immediately after central channel approval.
* **Exact Repository Directory:** `orgs/hospital/EHR_hospitalOrg-main/ehr-network/scripts/`
* **Required Action:** Author `join-shared-channel.sh` specifying:
  ```bash
  export CORE_PEER_LOCALMSPID="HospitalMSP"
  export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/users/Admin@hospital.example.com/msp
  export CORE_PEER_ADDRESS=peer0.hospital.example.com:7051
  export ORDERER_CA=/etc/hyperledger/fabric/orderer-tls/tlsca.orderer.example.com-cert.pem

  # Fetch block 0 from shared orderer
  peer channel fetch 0 ehrchannel.block -o orderer.example.com:7050 -c ehrchannel --tls --cafile $ORDERER_CA

  # Join peer to channel
  peer channel join -b ehrchannel.block
  ```
* **Verification Command:** Shell syntax lint (`bash -n join-shared-channel.sh`).
* **Expected Result:** Script is syntactically valid with CRLF converted to LF.
* **Risks & Precautions:** **DO NOT EXECUTE** until Central Integration confirms that `HospitalMSP` has been committed to `ehrchannel` configuration block. Fetching block 0 prior to channel authorization results in `ACCESS_DENIED`.

---

### Task H12: Test Peer Health, CouchDB, and Orderer Connectivity
* **Objective:** Confirm local container infrastructure is healthy prior to channel federation.
* **Required Steps:**
  1. Start `couchdb-peer0.hospital.example.com` and `peer0.hospital.example.com`:
     ```powershell
     docker compose -f orgs/hospital/EHR_hospitalOrg-main/ehr-network/docker/docker-compose-network.yaml up -d couchdb-peer0.hospital.example.com peer0.hospital.example.com
     ```
  2. Verify peer process:
     ```powershell
     docker logs peer0.hospital.example.com --tail 20
     ```
  3. Test gRPC reachability to Lab Orderer across `fabric_labnet`:
     ```powershell
     docker exec peer0.hospital.example.com nc -zv orderer.example.com 7050
     ```
* **Expected Result:** Peer logs report successful CouchDB connection on port `5984` and `nc -zv` reports `open` for `orderer.example.com 7050`.
* **Risks & Precautions:** If network probe fails, verify container is connected to `fabric_labnet` via `docker network inspect fabric_labnet`.

---

## C. LabOrg Responsibilities

The Lab engineering team is responsible for safeguarding the live network, maintaining uninterrupted `labresults` ledger transactions, and preparing governance artifacts for multi-organization channel federation.

### Task L1: Preserve Running Lab Infrastructure and Ledger Data
* **Objective:** Guarantee 100% operational continuity for the live `LabMSP` node.
* **Exact Containers & Volumes:**
  - Container `orderer.example.com` (`25da61119e5b`)
  - Container `peer0.lab.example.com` (`262f07794a50`)
  - Container `couchdb-peer0.lab.example.com` (`78c2fc2b4c3c`)
  - Docker named volumes: `labfabric_orderer.example.com`, `labfabric_peer0.lab.example.com`
* **Mandatory Rule:** Do NOT execute `docker compose down`, `docker stop`, `docker rm`, or `docker volume prune` against any Lab container or volume.
* **Verification Command:**
  ```powershell
  docker ps --filter "name=lab.example.com" --filter "name=orderer.example.com"
  ```
* **Expected Result:** All three containers show continuous uptime without restart count increments.
* **Risks & Precautions:** Any restart of `orderer.example.com` without persisting state resets in-flight gRPC streams.

---

### Task L2: Verify `ehrchannel` State and Block Height
* **Objective:** Audit the current state of the ledger before initiating channel governance modifications.
* **Exact Repository Path:** `orgs/lab/EHR-LABORG-main/scripts/`
* **Verification Command:**
  ```powershell
  docker exec -e CORE_PEER_LOCALMSPID=LabMSP -e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/msp peer0.lab.example.com peer channel getinfo -c ehrchannel
  ```
* **Expected Result:**
  ```json
  {"height":8,"currentBlockHash":"yxkb3vCHn3wXttIye3CGmigRyW4duXGM+05HjAeD47w=","previousBlockHash":"v2yDbioCBvDblNByMwnoTJ8vzpbR0yDk1YNdLI6ka2w="}
  ```
* **Risks & Precautions:** If block height is less than 8, a transaction has been dropped or an uncommitted ledger state exists.

---

### Task L3: Identify Lab Orderer and Peer TLS CA Certificates
* **Objective:** Locate authentic public TLS CA certificates for the ordering service and endorser.
* **Exact Repository Paths:**
  - Orderer TLS CA: `orgs/lab/EHR-LABORG-main/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem`
  - Lab Peer TLS CA: `orgs/lab/EHR-LABORG-main/organizations/peerOrganizations/lab.example.com/tlsca/tlsca.lab.example.com-cert.pem`
* **Verification Command:** Verify validity and expiration using OpenSSL:
  ```powershell
  openssl x509 -in orgs/lab/EHR-LABORG-main/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem -noout -subject -issuer -dates
  ```
* **Expected Result:** Subject: `CN = tlsca.example.com`, Issuer: `CN = tlsca.example.com`, Validity: 2026 to 2036.
* **Risks & Precautions:** Ensure certificates are public certificates (`-----BEGIN CERTIFICATE-----`) and contain no private keys.

---

### Task L4: Prepare Public TLS CA Certificates for Partner Trust
* **Objective:** Stage public trust certificates in a shared artifact folder accessible to Hospital and Pharmacy teams.
* **Target Path:** `shared/fabric-ca-certs/`
* **Required Action:**
  1. Create directory `shared/fabric-ca-certs/`.
  2. Copy `tlsca.example.com-cert.pem` to `shared/fabric-ca-certs/tlsca.orderer.example.com-cert.pem`.
  3. Copy `tlsca.lab.example.com-cert.pem` to `shared/fabric-ca-certs/tlsca.lab.example.com-cert.pem`.
* **Verification Command:**
  ```powershell
  Get-ChildItem -Path shared/fabric-ca-certs/
  ```
* **Expected Result:** Both `.pem` files exist and are readable by all OS user accounts.
* **Risks & Precautions:** Restrict permissions to read-only (`chmod 644`).

---

### Task L5: Strict Private Key Protection
* **Objective:** Guarantee that private keys never leak into shared directories or version control.
* **Mandatory Rule:** Private key files (`priv_sk`, `*.key`, `server.key`) located in:
  - `orgs/lab/EHR-LABORG-main/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/keystore/`
  - `orgs/lab/EHR-LABORG-main/organizations/peerOrganizations/lab.example.com/peers/peer0.lab.example.com/msp/keystore/`
  - `orgs/lab/EHR-LABORG-main/organizations/peerOrganizations/lab.example.com/users/Admin@lab.example.com/msp/keystore/`
  **MUST NEVER BE COPIED OR SHARED.**
* **Verification Command:**
  ```powershell
  git status --ignored shared/
  ```
* **Expected Result:** No private key files tracked or staged.

---

### Task L6: Prepare Lab Anchor Peer Configuration
* **Objective:** Author anchor peer definition for `peer0.lab.example.com:7051` to enable inter-organization gossip routing once partner orgs join.
* **Exact Repository Path:** `orgs/lab/EHR-LABORG-main/channel-artifacts/`
* **Required Action:** Generate JSON anchor peer payload:
  ```json
  {
    "AnchorPeers": [
      {
        "host": "peer0.lab.example.com",
        "port": 7051
      }
    ]
  }
  ```
* **Expected Result:** Payload formatted for injection into `.channel_group.groups.Application.groups.LabMSP.values.AnchorPeers`.
* **Risks & Precautions:** Submitting an anchor peer update directly without integration coordination can alter channel sequence numbers unexpectedly.

---

### Task L7: Verify `Admin@lab.example.com` Signing Identity Readiness
* **Objective:** Confirm Lab administrator identity is loaded and capable of signing channel configuration update transactions.
* **Exact Repository Path:** `orgs/lab/EHR-LABORG-main/organizations/peerOrganizations/lab.example.com/users/Admin@lab.example.com/`
* **Verification Command:** Verify keypair match:
  ```powershell
  $certPub = openssl x509 -in orgs/lab/EHR-LABORG-main/organizations/peerOrganizations/lab.example.com/users/Admin@lab.example.com/msp/signcerts/Admin@lab.example.com-cert.pem -pubkey -noout
  $keyPub = openssl pkey -in orgs/lab/EHR-LABORG-main/organizations/peerOrganizations/lab.example.com/users/Admin@lab.example.com/msp/keystore/priv_sk -pubout
  if ($certPub -eq $keyPub) { Write-Output "KEYPAIR MATCHES" } else { Write-Output "MISMATCH" }
  ```
* **Expected Result:** `KEYPAIR MATCHES`.
* **Risks & Precautions:** Do not rename `priv_sk`.

---

### Task L8: Document Anchor Peer Update Commands
* **Objective:** Record exact Fabric CLI commands needed to commit the anchor peer update to `ehrchannel`.
* **Reference Command Sequence:**
  ```bash
  # 1. Fetch current channel config
  peer channel fetch config config_block.pb -o orderer.example.com:7050 -c ehrchannel --tls --cafile $ORDERER_CA

  # 2. Decode block to JSON
  configtxlator proto_decode --input config_block.pb --type common.Block --output config_block.json
  jq .data.data[0].payload.data.config config_block.json > config.json

  # 3. Add AnchorPeers to LabMSP
  jq '
    .channel_group.groups.Application.groups.LabMSP.values =
      ((.channel_group.groups.Application.groups.LabMSP.values // {}) +
        {"AnchorPeers": {
          "mod_policy": "Admins",
          "value": {
            "anchor_peers": [
              {"host": "peer0.lab.example.com", "port": 7051}
            ]
          },
          "version": "0"
        }})
  ' config.json > modified_config.json

  # 4. Compute update delta protobuf
  configtxlator proto_encode --input config.json --type common.Config --output config.pb
  configtxlator proto_encode --input modified_config.json --type common.Config --output modified_config.pb
  configtxlator compute_update --channel_id ehrchannel --original config.pb --updated modified_config.pb --output lab_anchor_update.pb
  ```
* **Expected Result:** Documented procedure ready for Central Integration execution.

---

### Task L9: Provide Lab Network Connection Details
* **Objective:** Publish network coordinates to the central integration repository.
* **Connection Manifest:**
  - Orderer Endpoint: `orderer.example.com:7050` (Internal Docker network & Host)
  - Orderer MSP ID: `OrdererMSP`
  - Lab Peer Endpoint: `peer0.lab.example.com:7051`
  - Lab Peer MSP ID: `LabMSP`
  - Docker Network: `fabric_labnet`
  - Gateway Host: `localhost:7051` (Host loopback)

---

### Task L10: Coordinate with Central Integration Owner
* **Objective:** Enforce channel change governance.
* **Mandatory Rule:** LabOrg will NOT independently increment channel configuration version or modify channel policies without written sign-off from the Central Integration Lead.

---

## D. Central Integration Responsibilities

Individual organization teams must not unilaterally alter channel-level governance. The Central Integration Lead is exclusively responsible for cross-organization orchestration.

```
                      [Central Integration Lead]
                                  |
         +------------------------+------------------------+
         |                                                 |
         v                                                 v
[Channel Governance Updates]                     [DigiLocker Lifecycle]
 - Fetch config block                             - Update authorized MSP whitelist
 - Encode partner MSP definitions                 - Multi-org role-based permissions
 - Inject Anchor Peers (Lab, Hosp, Pharm)         - Package chaincode (v1.0, Seq 1)
 - Sign with LabMSP Admin                         - Coordinate lifecycle approvals
 - Submit update to orderer.example.com           - Commit to ehrchannel
```

### 1. Channel Configuration Federation (`ehrchannel`)
* **Add Partner MSP Definitions:** Fetch current block 8 config, convert to JSON, inject `HospitalMSP` and `PharmacyMSP` MSP definition blocks into `.channel_group.groups.Application.groups`, and compute the protobuf delta.
* **Inject Anchor Peers for All Organizations:**
  - `LabMSP`: `peer0.lab.example.com:7051`
  - `HospitalMSP`: `peer0.hospital.example.com:7051`
  - `PharmacyMSP`: `peer0.pharmacy.example.com:7051`
* **Submit Channel Update Transaction:** Coordinate signature from `Admin@lab.example.com` and submit to `orderer.example.com:7050`.

### 2. Peer Join Coordination
* Issue authorization for Hospital and Pharmacy teams to fetch genesis block 0 and execute `peer channel join`.
* Verify block height synchronization across all peers until height reaches parity.

### 3. DigiLocker Chaincode Multi-Organization Hardening
* Refactor [`orgs/digilocker/chaincode/lib/digilockerContract.js`](file:///d:/Javed/PBL_EHR/CODESAPCE/orgs/digilocker/chaincode/lib/digilockerContract.js) line 15:
  ```javascript
  // REMOVE single-org lock:
  // const AUTHORIZED_MSPS = ['LabMSP'];

  // IMPLEMENT Role-Based Access Control:
  const ROLE_PERMISSIONS = {
    HospitalMSP: ['ISSUE_MEDICAL_RECORD', 'READ_RECORD', 'REVOKE_RECORD'],
    LabMSP:      ['ISSUE_LAB_RESULT',     'READ_RECORD'],
    PharmacyMSP: ['DISPENSE_MEDICATION',  'READ_RECORD']
  };
  ```
* Package the contract (`digilocker_1.0.tar.gz`) and coordinate `peer lifecycle chaincode approveformyorg` across all participating MSPs with endorsement policy:
  ```bash
  --signature-policy "OR('HospitalMSP.peer', 'LabMSP.peer', 'PharmacyMSP.peer')"
  ```
* Commit definition to `ehrchannel` and execute cross-organization end-to-end integration tests.

---

## E. Shared Rules and Security Restrictions

Every engineer working across HospitalOrg, LabOrg, and PharmacyOrg must comply with the following 12 strict operational rules:

1. **Zero-Reset Mandate:** Never reset, recreate, or destroy the live Lab network (`orderer.example.com`, `peer0.lab.example.com`, `couchdb-peer0.lab.example.com`).
2. **Volume Preservation:** Never delete or prune Docker volumes associated with active or historical peer nodes.
3. **Forensic Backup:** Preserve Hospital's legacy volume `docker_peer0.hospital.example.com` as an unmounted backup. Mount a fresh volume (`docker_peer0.hospital.production`) for the shared channel.
4. **Key Isolation:** Never share private keys (`priv_sk`, `*.key`), keystore directories, or wallet files across organization boundaries.
5. **No Independent Orderers:** Do not spin up separate ordering services or create independent channels. The entire consortium must share `orderer.example.com:7050` and `ehrchannel`.
6. **No Pre-Authorization Joins:** Never execute `peer channel join` on Hospital or Pharmacy peers before their MSP definitions are formally committed to `ehrchannel`.
7. **No Autonomous DigiLocker Deployment:** Do not package, approve, or commit DigiLocker chaincode independently. Chaincode lifecycle operations must follow the agreed multi-org approval policy.
8. **Secrets Sanitization:** Never commit `.env` files, credentials, private keys, or ledger block files to version control.
9. **Branch Isolation:** Conduct all configuration updates in dedicated feature branches (`feature/hospital-infra-remediation`, `feature/lab-anchor-prep`).
10. **Evidence-Based Reporting:** Every deliverable must include verifiable logs, Docker status outputs, and cryptographic hash verifications.
11. **Gossip Endpoint Discipline:** Configure `CORE_PEER_GOSSIP_EXTERNALENDPOINT` to match each peer's canonical DNS hostname and port, not localhost.
12. **Approval Gate:** No configuration changes may be merged to the main branch without code review and approval from the responsible organization lead and Central Integration Lead.

---

## F. Definition of Done (DoD)

### 1. HospitalMSP Infrastructure Ready Checklist
- [ ] Stale volume `docker_peer0.hospital.example.com` preserved and detached.
- [ ] Fresh production volume `docker_peer0.hospital.production` allocated and mounted.
- [ ] `couchdb-peer0.hospital.example.com` running on `fabric_labnet` and accessible at `http://admin:adminpw@localhost:5985`.
- [ ] `docker-peer0.hospital.example.com-1` started on `fabric_labnet` with host port `7058:7051`.
- [ ] Obsolete standalone orderer disabled; zero port collisions on `7050`.
- [ ] Shared Lab Orderer root CA cert mounted into peer container.
- [ ] Peer logs confirm successful startup and zero CouchDB connection errors.
- [ ] Network probe confirms gRPC reachability from Hospital peer to `orderer.example.com:7050`.
- [ ] Hospital backend `.env` updated with `PEER_ADDRESS=localhost:7058` and shared `ORDERER_TLS_CA`.

### 2. LabMSP Preparation Ready Checklist
- [ ] Continuous uptime verified on `orderer.example.com`, `peer0.lab.example.com`, and `couchdb-peer0.lab.example.com`.
- [ ] `ehrchannel` block height verified at 8 (or greater).
- [ ] Lab Orderer TLS CA cert and Lab Peer TLS CA cert copied to `shared/fabric-ca-certs/`.
- [ ] Zero private keys exposed in public directories or git tracking.
- [ ] Anchor peer JSON specification for `peer0.lab.example.com:7051` staged.
- [ ] `Admin@lab.example.com` signing certificate and private key matched and verified ready for config updates.
- [ ] Lab Results chaincode (`labresults`) fully operational with zero regression.

### 3. Central Integration Ready Checklist
- [ ] DigiLocker contract refactored with granular multi-org role permissions.
- [ ] `config_block.pb` fetched from live orderer and decoded.
- [ ] `HospitalMSP` and `PharmacyMSP` MSP definitions appended to channel configuration.
- [ ] Anchor peers configured for all three organizations.
- [ ] Channel update signed by `Admin@lab.example.com` and committed to `orderer.example.com:7050`.
- [ ] Hospital peer and Pharmacy peer joined to `ehrchannel`.
- [ ] Block height parity verified across all active peer nodes.
- [ ] DigiLocker chaincode committed and cross-organization transactions verified.

---

## G. Delegation and Handover Matrix

| Task Identifier | Task Description | Responsible Group | Supporting Group | Deliverable | Approval Owner |
|---|---|---|---|---|---|
| **H-TASK-01** | Volume preservation & fresh volume setup | HospitalOrg | Central Integration | Updated `docker-compose-network.yaml` | Infrastructure Lead |
| **H-TASK-02** | Hospital CouchDB deployment & peer configuration | HospitalOrg | LabOrg | CouchDB container running on `5985` | Infrastructure Lead |
| **H-TASK-03** | Hospital network bridging to `fabric_labnet` | HospitalOrg | LabOrg | Peer connected to `fabric_labnet` | Network Admin |
| **H-TASK-04** | Orderer TLS trust & backend API alignment | HospitalOrg | LabOrg | Updated `peer0-api/.env` & TLS mounts | Security Auditor |
| **L-TASK-01** | Lab infrastructure preservation & health verification | LabOrg | Central Integration | Ledger height & uptime audit log | LabOrg Lead |
| **L-TASK-02** | Export public TLS CA certificates | LabOrg | HospitalOrg / PharmacyOrg | Public `.pem` files in `shared/` | Security Auditor |
| **L-TASK-03** | Anchor peer payload & Admin signer readiness | LabOrg | Central Integration | Valid anchor peer update block | Central Integration |
| **I-TASK-01** | Channel configuration update transaction | Central Integration | LabOrg | Committed config block with 3 MSPs | Consortium Board |
| **I-TASK-02** | Peer channel join orchestration | Central Integration | HospitalOrg / PharmacyOrg | Verified `peer channel list` logs | Central Integration |
| **I-TASK-03** | DigiLocker RBAC refactoring & deployment | Central Integration | All Organizations | Committed chaincode definition | Application Lead |
| **I-TASK-04** | Cross-organization end-to-end testing | Central Integration | All Organizations | Verified ledger transaction report | Lead QA Engineer |

---

## H. Execution Sequence and Dependency Graph

The transition must strictly follow this chronological sequence. No step may proceed until its predecessor has met its Definition of Done:

```mermaid
flowchart TD
    Step1["Step 1: LabMSP Foundation Preservation & Public TLS Export<br/>(LabOrg)"]
    Step2["Step 2: HospitalMSP Volume, CouchDB & Port Remediation<br/>(HospitalOrg)"]
    Step3["Step 3: PharmacyMSP Greenfield Cryptogen & Compose Authoring<br/>(PharmacyOrg - Future Assignment)"]
    Step4["Step 4: Central Channel Configuration Update on ehrchannel<br/>(Central Integration Lead)"]
    Step5["Step 5: Hospital & Pharmacy Peer Channel Joins & Block Replication<br/>(HospitalOrg & PharmacyOrg)"]
    Step6["Step 6: DigiLocker Chaincode Packaging, Multi-Org Approval & Commit<br/>(Central Integration & All Orgs)"]
    Step7["Step 7: Cross-Organization End-to-End Verification<br/>(All Orgs)"]

    Step1 --> Step2
    Step2 --> Step3
    Step3 --> Step4
    Step4 --> Step5
    Step5 --> Step6
    Step6 --> Step7
```

1. **Step 1 — LabMSP Preservation & Public TLS Export:** LabOrg verifies live network health (height 8) and copies public root CA certs (`tlsca.orderer.example.com-cert.pem`, `tlsca.lab.example.com-cert.pem`) to `shared/fabric-ca-certs/`.
2. **Step 2 — HospitalMSP Infrastructure Remediation:** HospitalOrg applies volume, CouchDB, and networking changes to `docker-compose-network.yaml`. Launches `peer0.hospital.example.com` and `couchdb-peer0.hospital.example.com` on `fabric_labnet`. Verifies TLS reachability to `orderer.example.com:7050`.
3. **Step 3 — PharmacyMSP Greenfield Preparation:** (Separate upcoming assignment) Author `crypto-config-pharmacy.yaml`, generate crypto identities via `cryptogen`, create `docker-compose-pharmacy.yaml` (peer on host `9051`, CouchDB on `7984`), and join `fabric_labnet`.
4. **Step 4 — Central Channel Governance Update:** Central Integration Lead fetches `config_block.pb` from `orderer.example.com:7050`, injects `HospitalMSP` and `PharmacyMSP` MSP definitions plus anchor peers for all three orgs, signs with `Admin@lab.example.com`, and submits the update.
5. **Step 5 — Peer Channel Joins & Block Synchronization:** Hospital and Pharmacy admins fetch channel block 0 from `orderer.example.com:7050` and execute `peer channel join`. Both peers replicate blocks 0 through 8+ from the ordering service.
6. **Step 6 — DigiLocker Multi-Organization Lifecycle:** Central Integration Lead updates `digilockerContract.js` with RBAC permissions. All three organizations approve the chaincode definition. Central lead commits the definition to `ehrchannel`.
7. **Step 7 — Cross-Organization Verification:** Execute real clinical transactions (Hospital issues discharge summary, Lab records diagnostic results, Pharmacy verifies prescription). Ledger state and audit consistency verified across all three peer nodes.

---
*End of Operational Delegation Document. Issued by Central Blockchain Architecture Lead.*
