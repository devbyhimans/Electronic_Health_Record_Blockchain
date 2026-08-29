# Electronic Health Record (EHR) System 🏥💊
**Hyperledger Fabric Swarm Network - Pharmacy Organization Module**

The **EHR Pharmacy Organization Module** is a secure, decentralized, and scalable platform designed for hospital administration, pharmaceutical inventory management, and patient record tracking. Built on **Hyperledger Fabric v2.5** and orchestrated across a multi-node **Docker Swarm**, it guarantees high-availability, immutable record keeping, and patient privacy through Attribute-Based Access Control (ABAC) and Self-Sovereign Identity.

---

## 👥 Contributors & Roles

This enterprise-grade system was designed and deployed as a collaborative effort:
- **Ankit Chaudhari (25CSM2R03)** - *Infrastructure Architect & Swarm Master (PC1)*
  - Docker Swarm orchestration, Fabric CA, Raft Orderer, and the Manager Governance Portal.
- **Mohit Tomar (25CSM2R13)** - *Smart Contract Lead & Clinical Portals (PC2)*
  - Node.js Chaincode (Smart Contracts), CouchDB Rich Queries, Patient Portal, and Pharmacist Portal.
- **Ronitsingh Rawat (25CSM2S06)** - *API Gateway Architect & Inventory Lead (PC3)*
  - Central Node.js API Gateway (Fabric SDK), Wallet Mapping, High-Availability Peer Redundancy, and Inventory Supply Chain Portal.

---

## 🏗️ System Architecture

The overarching system abstracts into four primary layers:
1. **Presentation Layer:** 4 Custom React (Vite) Dashboards mapping distinct access scopes.
2. **Application Layer:** Express.js Native SDK Bridge enabling JSON requests to map to cryptographic gRPC blocks.
3. **Blockchain Layer:** Hyperledger Fabric blockchain with Raft consensus. 
4. **Storage Layer:** Dual-storage strategy. On-chain metadata validation coupled with explicit off-chain heavy document storage acting on an **IPFS (Kubo)** decentralized network.

---

## 🚀 Key Features

- **Attribute-Based Access Control (ABAC):** Guarantees pharmacists only see what has been prescribed and hospital managers cannot view explicit diagnostic patient history.
- **Self-Sovereign Identity:** Patients explicitly own and can cryptographically revoke viewing rights of their medical reports to healthcare individuals via IPFS integration.
- **Atomic Supply Chain Deductions:** Successfully ties billing prescription fulfillments implicitly to global hospital inventory supply stock. 
- **Gossip Protocol Distribution:** Decentralizes the CouchDB world state flawlessly across physical machines `PC1`, `PC2`, and `PC3` connected via a Tailscale VPN mesh.

---

## ⚙️ Dependencies & Requirements

Please thoroughly view the heavily detailed **[`SUPPLEMENTARY.md`](./SUPPLEMENTARY.md)** file available in the root of this project. It outlines:
- Complete Hardware Specifications per node.
- Linux / Ubuntu / Docker environment configurations.
- Recommended LTS versions (Hyperledger Fabric v2.5, Node.js v18.x, CouchDB v3.3.2).

---

## 🛠️ Deployment Instructions

The repository uniquely features a universal `deploy.sh` script to streamline the intensive procedure of tearing down and deploying multi-node Fabric test-networks.

### Step 1: Pre-requisites & Cleanup
Ensure your Tailscale topology successfully maps ping requests between all your worker nodes. From the primary manager (`PC1`), execute:
```bash
# This cleanly stops the old containers and eliminates dangling chaincode volumes.
./deploy.sh --teardown
```

### Step 2: Distribution and Startup
Trigger the central deployment from `PC1`:
```bash
./deploy.sh --start
```
**Deployment Cycle Steps Executed Automatically:**
1. Packages the EHR `.tar.gz` chaincode.
2. Formats all Organization MSP/TLS certificates strictly using the `cryptogen` tool and the Fabric CA.
3. Launches the Raft Orderer and genesis block bindings.
4. Performs an automated secure shell transfer (`scp`) pushing the `crypto-config/` state and compiled channel blocks exactly to Worker Nodes `PC2` and `PC3`.
5. Connects all 3 remote peers natively via Docker Swarm topologies to join the primary overarching `mychannel`.
6. Invokes the chaincode ledger instantiation sequence.

### Step 3: API & Frontends
Once the internal `.sh` processes have finalized network synchronization:
1. Navigate to `app/backend/` and run `npm start` to spin up the API gateway on port `4000`.
2. Navigate to your desired frontend module (e.g. `app/manager/`, `app/patient/`) and execute `npm run dev`.
