# Supplementary File: System & Project Requirements

This document outlines the comprehensive hardware, software, and networking requirements necessary to deploy, maintain, and interact with the **Electronic Health Record (EHR) Pharmacy Organization** platform built using Hyperledger Fabric.

---

## 1. Hardware Requirements

The system relies on a strictly decentralized physical infrastructure consisting of three separate worker machines structured into a Docker Swarm.

### Physical Node Specification
*Minimum suggested requirements per physical PC:*
- **CPU:** Dual-core processor (x86_64 architecture). Quad-core recommended for `PC1` (Manager node).
- **RAM:** 4 GB minimum. (8 GB recommended to smoothly handle Docker, Fabric Peers, CouchDB, and Node.js containers simultaneously).
- **Storage:** 20 GB available disk space for Docker image layers, chaincode bindings, and persistent block ledger volumes.
- **Network Interface:** Stable broadband connection.

### Node Allocation Mapping
- **PC1 (Manager Node):** Hosts the Fabric Root CA, Raft Orderer, Peer0, CouchDB0, and the Manager Governance Portal.
- **PC2 (Worker Node):** Hosts Peer1, CouchDB1, Patient Portal, and Pharmacist Portal.
- **PC3 (Worker Node):** Hosts Peer2 (Redundancy array), CouchDB2, Central API Gateway, and Inventory Portal.

---

## 2. Operating System & Core Dependencies

The entire deployment shell script (`deploy.sh`) is designed targeting a Debian-based Linux environment.
- **Operating System:** Ubuntu 22.04 LTS (Jammy Jellyfish). 
- **Privileges:** Sudo / Root access is strictly required to orchestrate Docker Swarm states and bind server ports.

### Network Prerequisites
- **Tailscale VPN:** A secure WireGuard overlay mesh network (Tailscale) must be installed to bridge `PC1`, `PC2`, and `PC3` across potentially disparate subnets, allowing native ping behavior across the swarm.
- **Port Availability:** Specifically ports `7051`, `7054` (Fabric), `5984` (CouchDB), `4000` (API Gateway), and `5173` (Vite Frontends) must be clear and not bound by other host processes.

---

## 3. Software Dependencies

The project demands specific Long Term Support (LTS) versions of multiple frameworks. Ensure these dependencies are installed natively on the host systems before triggering the deployment vectors:

### Container Orchestration
- **Docker Engine:** `v24.x` or superior.
- **Docker Compose:** `v2.x` plugin architecture (e.g. `docker compose up` rather than `docker-compose`).
- **Docker Swarm:** Must be explicitly initialized on PC1 (`docker swarm init`) with worker nodes having joined the Swarm token.

### Blockchain & Distributed Tech
- **Hyperledger Fabric Docker Images:** `v2.5` (LTS releases for natively integrated chaincode-as-a-service compliance).
- **Fabric CA Server Image:** `v1.5`.
- **CouchDB:** `v3.3.2` Image (Mandatory replacing LevelDB for enabling JSON/Mango Rich Queries).
- **IPFS (InterPlanetary File System):** Kubo implementation (`v0.18+`) for off-chain large storage hashing (handling patient medical PDF reports).

### Application Layer
- **Node.js:** `v18.x` LTS runtime environment (mandatory for compatibility with the `fabric-network` SDK).
- **NPM Package Manager:** `v9.x` or higher.
- **Fabric Client SDK:** `@hyperledger/fabric-network` standard library for Node.
- **Frontend Engine:** React executed using the Vite build tool (`create-vite`).

---

## 4. Cryptographic Provisioning Requirements

- The system relies explicitly on an internal Public Key Infrastructure (PKI). All participants (managers, pharmacists, patients) strictly require X.509 format digital certificates to submit transactions.
- Worker nodes must receive `mychannel.block`, `ehr.tar.gz` (chaincode), and the `crypto-config/` payload directory securely transferred via SCP *before* raising the worker peer containers.

---

## 5. Security Protocols 

- **Attribute-Based Access Control (ABAC):** Identity attributes (e.g., `role: pharmacist`) must be strictly bound into the X.509 enrollment certs via the Fabric CA.
- **Gossip Protocol Parameters:** To effectively broadcast ledger updates across the Tailscale VPN array without delays, environmental peer declarations must statically resolve the internal VPN IPs mapped via local proxy variables.
