# 👨‍💻 My Contribution — EHR Blockchain Project

> **Author:** Himanshu (`devbyhimans`)  
> **Role:** Lead System Orchestrator & Real-Time Event Architect  
> **Team:** Group 1 (Observability, Event Pipeline & Core Infrastructure)  

---

## 🌟 1. Executive Summary (In Plain English)

When this project started, it was split into three separate, broken pieces (Hospital, Pharmacy, and Lab) that could not talk to each other, crashed on startup, and had to be run on dozens of confusing ports.

**My job in this project was twofold:**
1. **The System Orchestrator:** I connected all the broken pieces together into **one single unified system**. I built the master startup script (`./start.sh`), the main front door (`Nginx` on Port 80), and solved all the critical crashes (Orderer TLS failures, Docker volume issues, and process leaks) so that anyone can clone the repository and run the entire hospital network with a single command.
2. **The Real-Time Event Architect (Group 1 Track):** As documented in the main `README.md`, my core innovation track is building the **Real-Time Event Architecture**. Instead of forcing users to constantly refresh their web pages to see new blockchain transactions or AI actions, I designed the event listener and WebSocket pipeline that streams live updates from the blockchain directly to the screen instantly.

---

## 🏗️ 2. The Big Picture: Before Me vs. After Me

| Feature / Problem | Before My Work (Base Prototype) | After My Work (What I Built & Fixed) |
| :--- | :--- | :--- |
| **How to run the project** | 3 separate folders; had to manually open 10 terminal tabs with confusing commands. | **One single command (`./start.sh`)** starts everything: blockchain, IPFS, microservices, and frontends. |
| **Website addresses & ports** | Total mess: Ports `3000`, `3001`, `4001`, `5173`, `5174`, `5175`. Browsers blocked requests due to CORS errors. | **One main front door (Port 80 via Nginx)**. Everything is accessible cleanly at `http://localhost/`, `/patient/`, `/pharmacy/`, and `/lab/`. |
| **Blockchain Orderer crash** | The Orderer node crashed immediately on startup due to a TLS certificate mismatch. | **Fixed completely (Commit `e697a3e`)**. Generated matching genesis blocks and restored clean Raft consensus. |
| **Docker crashes on Windows/Linux** | Running on Windows/WSL crashed because host `node_modules` broke Linux binaries. | **Fixed with Named Docker Volumes**. Node modules live purely inside Linux containers, preventing all binary crashes. |
| **Real-time screen updates** | Zero real-time updates. The user had to manually refresh the page over and over. | **WebSocket / SSE Event Pipeline** listening directly to Fabric blockchain blocks and pushing live updates to the screen. |
| **Shutting down the app** | Running `./stop.sh` left hidden background processes running, locking ports 5173–5175. | **Engineered automated port-sweeping** in `./stop.sh` that kills all orphaned processes cleanly. |

---

## 🎯 3. Exactly What I Did (Point-by-Point Breakdown)

### A. Real-Time Event Architecture (My Assigned Track in `README.md`)
* **Fabric Block & Event Collector:** Created the listener that taps directly into Hyperledger Fabric (`ehrchannel`). Whenever a doctor writes a prescription or a lab technician uploads a test result, my listener detects the block immediately.
* **Auto-Reconnect & Checkpointing:** If a peer node restarts, my collector remembers the last block it read and automatically reconnects without losing any medical events.
* **Event Normalizer (Zero-PHI Rule):** Raw blockchain events look messy and could leak private patient data. My normalizer cleans the data into a standard **Event Envelope** and strictly removes private names or clinical text, passing only secure hashes and IDs.
* **WebSocket & SSE Gateway:** Built the live communication pipes (`ws://localhost/api/dashboard/ws` and `GET /api/dashboard/stream`) so the frontend gets live push notifications with zero browser polling.
* **Internal Event Ingestion (`POST /internal/events`):** Created a secure endpoint so other team members' AI agents and security modules can push their progress stages into the live stream.

---

### B. Core System Orchestration & Single Gateway (The Glue of the System)
* **Built the Nginx Reverse Proxy (Port 80):**
  * Created `nginx/nginx.conf` to serve as the unified API Gateway.
  * Mapped all web portals:
    * `http://localhost/` $\rightarrow$ Hospital Portal
    * `http://localhost/patient/` $\rightarrow$ Patient Self-Service Portal
    * `http://localhost/pharmacy/` $\rightarrow$ Pharmacy Management
    * `http://localhost/lab/` $\rightarrow$ Diagnostics Lab
  * Mapped all APIs (`/api/hospital/...`, `/api/pharmacy/...`) so frontend developers never face CORS errors.
* **Engineered One-Click Startup & Teardown:**
  * Created `start.sh` to automatically bring up the Fabric Docker containers, check and deploy the smart contract (`ehr:1.0`), and launch backend APIs in sequence.
  * Created `start-sequential.sh` and `stop.sh` with automated port hunting (`lsof -ti :<port> | xargs kill -9`) to guarantee clean shutdowns.

---

### C. Major Bug Fixes & Rescues
1. **Raft Orderer TLS Verification Failure:** Fixed the mismatch between the committed April 18 certificates and the old September 27 genesis block that was preventing the blockchain from booting up.
2. **Docker Native Binary Crash:** Fixed compiled module errors (`bcrypt`, `esbuild`) by creating isolated Docker volumes (`h-peer0-api-modules`, etc.).
3. **Frontend API Broken Links:** Fixed `Visits.jsx` and `Staff.jsx` which were failing to fetch users due to hardcoded, non-existent ports, routing them correctly through `peer0-api:4001`.
4. **React Router Flags & Missing Favicons:** Cleared annoying console warnings and 404 errors by adding SVG icons and updating router future flags.
5. **Pharmacy Stale Port 4000 Fix & Sub-Portal Recovery:** 
   * Eliminated the stale `:4000/all?user=...` `ERR_CONNECTION_REFUSED` crash in `app/frontend/src/Dashboard.jsx` by routing to `/api/pharmacy/api/inventory` with graceful fallback.
   * Fixed missing Linux binary bindings (`@rolldown/binding-linux-x64-gnu` and `framer-motion`) across Pharmacy Manager (`:3001`), Inventory (`:3003`), and Billing (`:3005`).
   * Wired the Pharmacy Backend (`:3000`) directly into `start-sequential.sh`, making all pharmacy portals live and fully functional.

---

## 📁 4. List of My Files and Folders

Here are all the files and directories in this repository that represent my work:

### 1. Master Startup & Orchestration Scripts (Root)
* `start.sh` — Master launch script (Fabric network + chaincode deployment + microservices).
* `start-sequential.sh` — Smart sequential launcher with health-check waiting and port management.
* `stop.sh` — Clean shutdown script that stops Docker containers and sweeps orphaned processes.
* `docker-compose.yaml` — Multi-container orchestration uniting Nginx, all backend APIs, and frontends with named volume isolation.

### 2. Central API Gateway & Reverse Proxy
* `nginx/nginx.conf` — Nginx configuration file routing all frontends, APIs, and WebSockets through Port 80.

### 3. Real-Time Dashboard Architecture (Documented in `README.md`)
Located under: `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/src/`
* `collector/` — Fabric block listener, chaincode event listener, and service health poller.
* `normalizer/` — Event translator formatting raw events into the Zero-PHI Common Event Envelope.
* `realtime/` — WebSocket (`/ws`) and Server-Sent Events (`/stream`) live streaming engine.
* `POST /internal/events` — Secure internal event ingestion endpoint.

### 4. Documentation & Evaluation Guides
* `MY_CONTRIBUTION.md` — This plain-English contribution summary.
* `EHR_BLOCKCHAIN_COMPLETE_EVALUATION_GUIDE.md` — 46KB comprehensive guide with Mermaid diagrams, cryptography explanation, and 15 viva defense Q&As.
* `README.md` (Lines 140–300) — Group 1 Observability Dashboard track architecture and event specifications.

---

## 🎤 5. What to Say in Your Evaluation (Speaking Scripts)

### The 30-Second Elevator Pitch
> *"In this project, my role is the **Lead System Orchestrator and Real-Time Event Architect**. When we received the base prototype, it was divided into three disconnected repositories that crashed on startup and ran across dozens of conflicting ports. I united the entire platform behind a single Nginx gateway on Port 80, fixed the critical Orderer TLS and Docker crashes so the system boots with a single `./start.sh` command, and designed the real-time WebSocket event pipeline that streams live blockchain transactions to users without requiring manual page refreshes."*

---

### The 2-Minute Detailed Walkthrough

1. **Step 1: The Problem I Solved**  
   *"First, I tackled system stability. The base project had broken Raft TLS certificates in the Orderer node and crashed on Windows/Linux environments due to volume leakage. I fixed the cryptographic genesis synchronization, isolated `node_modules` in Docker named volumes, and built `start.sh` and `stop.sh` so the entire network starts and stops cleanly."*

2. **Step 2: The Unified Gateway**  
   *"Second, I solved the user experience and port conflict problem. Instead of forcing users to remember 10 different ports (3000, 4001, 5173, etc.) which caused browser CORS blocking, I deployed an Nginx reverse proxy on Port 80. Now, Hospital, Patient, Pharmacy, and Lab portals all live under clean, professional web addresses."*

3. **Step 3: My Core Novelty (Real-Time Events)**  
   *"Third, for my track in Group 1, I designed the Real-Time Event Architecture. In traditional healthcare systems, users must constantly refresh their screens to check if a lab report is ready or a prescription is approved. I built an event collector that listens directly to Hyperledger Fabric block commits and streams sanitized, privacy-compliant events over WebSockets straight to the dashboard in real time."*

---

## ❓ 6. Quick Viva Questions on Your Contribution

#### Q1: "What was your specific role compared to your teammates?"
**Answer:** *"Dhruv focused on the REST aggregation API and SQLite cache, and Harsh built the frontend React UI shell. My role was the **foundation and real-time backbone**: I made the entire multi-org network run together via Nginx and Docker orchestration, and I designed the event collector and WebSocket pipeline that feeds live blockchain events to their frontend."*

#### Q2: "Why did you add Nginx if Docker already exposes ports?"
**Answer:** *"Exposing 10 different ports to the browser causes severe Cross-Origin Resource Sharing (CORS) errors and makes the app fragile. Nginx gives us a single production gateway on Port 80, routes WebSocket connections smoothly, and allows any frontend to call any backend using simple relative paths like `/api/hospital/peer0/`."*

#### Q3: "What was the Orderer TLS issue you fixed?"
**Answer:** *"The genesis block was generated with an old September 27 certificate, but the repository held April 18 certificates. Because Hyperledger Fabric's Raft consensus validates the node's TLS cert against the genesis block on startup, the mismatch caused the Orderer to reject itself and crash. I regenerated the genesis block with `configtxgen` matching the committed keys and reset the stale ledger block, allowing the orderer to boot cleanly."*

---

<div align="center">
  <b>🏆 You have made this project work as a cohesive, professional enterprise system. Speak with confidence!</b>
</div>
