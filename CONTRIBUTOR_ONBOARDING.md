# CONTRIBUTOR_ONBOARDING.md

## 1. Project Overview

The **Enterprise Blockchain Electronic Health Record (EHR) System** is a Hyperledger Fabric v2.5 based network that federates multiple healthcare organisations (Hospital, Lab, Pharmacy, Digilocker) onto a shared channel **`ehrchannel`**.  Each organisation runs its own peers, CAs and micro‑service gateways, but all transactions are committed to the same ledger.

- **Lab** – provides JWT‑based authentication, role‑scoped authorisation, patient‑level access checks, audit attribution and Fabric‑Gateway integration.  The source lives under `orgs/lab/EHR-LABORG-main/` and is fully covered by unit tests.
- **Digilocker** – implements a chaincode contract for patient‑owned document storage, MSP‑based access control and API integration.  The contract and its tests are under `orgs/digilocker/chaincode/`.
- **Hospital** – UI front‑ends, dashboard, and core business logic (appointments, records, dispensing) located in `orgs/hospital/EHR_hospitalOrg-main/`.
- **Pharmacy** – a separate organisation with its own peer and front‑end (currently scaffolded).

All components sit on top of a Fabric network that provides ordering, endorsement policies and immutable storage.  The **implemented** functionality includes the Lab authentication/security stack and the Digilocker chaincode with unit tests.  **Planned** work includes multi‑org chaincode deployment for Digilocker, full end‑to‑end Fabric integration for the Pharmacy UI and additional cross‑organisation endorsement policies.

---

## 2. Branch and Git Instructions

```bash
# Clone the repository (use the URL from the repo config)
git clone https://github.com/devbyhimans/Electronic_Health_Record_Blockchain.git
cd Electronic_Health_Record_Blockchain

# Fetch all remote branches
git fetch origin

# Switch to the publication branch
git checkout feat/lab-security-digilocker-publication
```

If you already have the repo locally:

```bash
git fetch origin
git checkout feat/lab-security-digilocker-publication
```

---

## 3. Repository Structure (relevant parts)

| Path | Purpose |
|------|---------|
| `orgs/lab/EHR-LABORG-main/` | Lab gateway client, JWT auth, role/scope authorisation, Fabric‑Gateway code, tests, scripts. |
| `orgs/digilocker/` | Digilocker chaincode (`chaincode/`), contract implementation, unit tests, docs. |
| `orgs/hospital/EHR_hospitalOrg-main/` | Hospital UI (React/Vite), dashboard, workflow runner, API gateway configs, network deployment scripts. |
| `orgs/pharmacy/` | Pharmacy organisation scaffolding (frontend, API gateway – currently minimal). |

**Key sub‑folders**
- `orgs/lab/EHR-LABORG-main/client/node-gateway/auth/` – `authenticate.js`, `authorize.js`, `jwtService.js`, `loginHandler.js`, `userRegistry.js`.
- `orgs/lab/EHR-LABORG-main/client/node-gateway/gateway.js` – Fabric‑Gateway wrapper used by the Lab services.
- `orgs/lab/EHR-LABORG-main/client/node-gateway/scripts/` – helper scripts for creating test users and E2E verification.
- `orgs/digilocker/chaincode/` – `index.js` (contract entry point), `lib/` (contract logic), `test/` (unit tests).
- `orgs/hospital/EHR_hospitalOrg-main/ehr-frontend-v2/dashboard-portal/` – React components (`AgentCard.jsx`, `LiveWorkflowRunner.jsx`, etc.) and configuration (`agentConfig.js`).
- `orgs/hospital/EHR_hospitalOrg-main/ehr-network/` – Fabric Docker compose, chaincode deployment scripts, CA setup.

---

## 4. Environment Setup

### Required software
| Tool | Minimum version |
|------|-----------------|
| Docker Engine + Docker Compose v2 | 24.0 |
| Node.js | 20.x |
| npm | 10.x |
| WSL2 (on Windows) | Ubuntu 22.04+ |
| IPFS Kubo | latest (Docker image) |
| Hyperledger Fabric binaries (via Docker images) | v2.5 |

### Dependency installation
```bash
# Run once from the repo root
./setup.sh
```
The script installs npm dependencies for every sub‑project and pulls required Docker images.

### Environment variables
- `.env.example` provides a template.  Copy it to `.env` and fill in **local** values (e.g., ports, IP addresses).  **Never** commit real secrets.
- For Fabric MSP material, the scripts under `orgs/*/ehr-network/` generate certificates on‑the‑fly; no manual env vars are needed.

### Local Fabric network start‑up
```bash
# Initialise the Fabric network, deploy chaincode and start all services
./start.sh
```
The script:
1. Brings up CAs, orderer and peers (`docker-compose.yaml`).
2. Creates `ehrchannel` and installs/commits chaincode.
3. Starts the IPFS node and all API gateways.
4. Launches the four front‑ends (Hospital, Patient, Pharmacy, Lab).

### IPFS requirements
The IPFS service runs in Docker (`port 4006` for the REST bridge, `8090` for the web gateway). No additional local setup is needed beyond Docker.

---

## 5. Lab Authentication and Security

- **JWT authentication** – implemented in `orgs/lab/EHR-LABORG-main/client/node-gateway/auth/jwtService.js`. Tokens contain role claims (`receptionist`, `doctor`, `labtechnician`, etc.).
- **Role & scope authorisation** – `authorize.js` checks the JWT role against the requested route.  Scopes are defined per‑service (e.g., `lab:read`, `lab:write`).
- **MSP restrictions** – each gateway connects to its organisation’s MSP; the Fabric‑Gateway enforces identity validation.
- **Patient‑level access** – the Lab APIs verify the `patientIdHash` supplied in the payload against the caller’s ACL stored on‑chain.
- **Audit attribution** – every transaction logs an audit event (`emitEvent`) with the caller’s MSP ID; see `test/audit.test.js` for verification.
- **Input validation & error handling** – all request bodies are validated in the route handlers; malformed inputs return `400` with a clear message.
- **Fabric Gateway error handling** – `gateway.js` wraps SDK calls with try/catch and returns standardized error objects.

**Relevant tests** – `orgs/lab/EHR-LABORG-main/client/node-gateway/test/auth.test.js`, `audit.test.js`, `cross-org.test.js`, `transaction.test.js`.

---

## 6. Digilocker Chaincode

- **Contract entry point** – `orgs/digilocker/chaincode/index.js` registers the Digilocker contract with the Fabric shim.
- **Transaction methods** – `createDocument`, `readDocument`, `shareDocument`, `revokeAccess` (implemented in `lib/`).
- **MSP authorisation** – the contract checks `ctx.clientIdentity.getMSPID()` against allowed organisations before allowing writes.
- **Document handling** – documents are stored as base64‑encoded strings on the ledger; the hash is pinned to IPFS (via the Lab gateway) for off‑chain storage.
- **Running tests** – from the digilocker directory:
```bash
cd orgs/digilocker/chaincode
npm test   # runs the Mocha/Node tests in test/ folder
```
- **Deployment status** – the chaincode is compiled and packaged, but **has not been deployed** to the live Fabric network in this branch.  It is exercised only by unit tests and the Lab integration scripts.

---

## 7. Running Tests

| Area | Command | Description |
|------|---------|-------------|
| Digilocker unit tests | `cd orgs/digilocker/chaincode && npm test` | Runs Mocha tests for contract logic. |
| Lab authentication & security unit tests | `cd orgs/lab/EHR-LABORG-main/client/node-gateway && npm test` | Executes `auth.test.js`, `audit.test.js`, `cross-org.test.js`, `transaction.test.js`. |
| Lab live Fabric E2E (optional) | `node scripts/verify-live-fabric-e2e.js` (requires the Fabric network started with `./start.sh`) | Performs a real transaction against the running network and validates the audit event. |
| Full project sanity (scripts) | `./setup.sh && ./start.sh && ./stop.sh` | Installs dependencies, starts the entire stack, then shuts it down. |

All tests currently pass (26 Digilocker tests, 52 Lab tests).  The live E2E script is safe to run after the network is up; it does not modify persistent state beyond a temporary test record which is cleaned up by the script.

---

## 8. Current Implementation Status

| Feature / Component | Status | Key Files | Remaining Work / Known Limitations |
|---------------------|--------|----------|-----------------------------------|
| Lab JWT authentication | Implemented & Tested | `orgs/lab/EHR-LABORG-main/client/node-gateway/auth/*` | None immediate – consider token expiry handling. |
| Lab role‑based authorisation | Implemented & Tested | `authorize.js` | Scope matrix could be expanded for new services. |
| Lab patient‑level access checks | Implemented & Tested | `gateway.js`, `auth/*` | None reported. |
| Lab audit attribution | Implemented & Tested | `test/audit.test.js` | None. |
| Lab Fabric‑Gateway error handling | Implemented & Tested | `gateway.js` | Add retry logic for transient network errors. |
| Digilocker chaincode | Implemented & Unit‑tested | `orgs/digilocker/chaincode/*` | **Not yet deployed** to the live network; integration with Lab gateway pending. |
| Digilocker API integration | Partial – chaincode tests exist, but no live gateway endpoint. | `orgs/digilocker/README.md` | Build a REST wrapper and add to `extorg-api`. |
| Hospital UI enhancements (Agent Dashboard, LiveWorkflowRunner) | Implemented (committed) | `orgs/hospital/EHR_hospitalOrg-main/ehr-frontend-v2/dashboard-portal/*` | UI polishing, responsive layout fixes. |
| Pharmacy onboarding | Scaffolded | `orgs/pharmacy/` | Implement chaincode endorsement policy, gateway routes, and tests. |
| Multi‑org endorsement policies | Planned | `network-up.sh`, `deployChaincode.sh` | Define and apply org‑specific policies for Digilocker contract. |
| Cross‑organisation workflow documentation | Drafted (docs/architecture) | `docs/architecture/*` | Convert to formal onboarding steps for new orgs. |

---

## 9. Safe Contribution Guidelines

1. **Create a feature branch** from `feat/lab-security-digilocker-publication`:
```bash
git checkout -b feature/your‑feature-name
```
2. **Never commit**:
   - `.env` files containing real secrets.
   - Private keys, certificates, wallet JSONs.
   - Anything under `backups/` or `.temporary_artifacts_phase5b/`.
   - Large generated binaries or logs.
3. **Do not reset or recreate** the existing Lab Fabric network; use the provided `./start.sh` / `./stop.sh` scripts.
4. **Do not create new orderers or channels** for Hospital/Pharmacy.  All organisations must join the existing `ehrchannel`.
5. **Do not modify shared channel configuration** (endorsement policies) without coordination – open a PR and discuss with the core maintainers.
6. **Push only after review** – never push directly to `feat/lab-security-digilocker-publication`; open a pull request against it.
7. **Run the full test suite** before committing any change.

---

## 10. First Tasks for a New Contributor

### Independent tasks (no coordination needed)
- **Run the quick‑start** (`./setup.sh` then `./start.sh`) and verify all services are healthy.
- **Add a new unit test** for an existing Lab route (e.g., a missing edge‑case in `auth.test.js`).
- **Improve documentation** – flesh out the Digilocker API guide in `docs/`.
- **Polish the Hospital UI** – address any lint warnings or responsiveness issues in the newly added components.

### Tasks requiring central coordination
- **Deploy Digilocker chaincode** to the live network – requires approval from the maintainer to update endorsement policies.
- **Implement the Digilocker REST wrapper** in `extorg-api` and agree on the endpoint contract.
- **Onboard Pharmacy** – coordinate with the core team to define its MSP, CA and channel join steps.

### Not ready yet
- **Cross‑org governance UI** – the dashboard integration for multi‑org consent is still in design.
- **FHIR R4 interoperability** – roadmap item, not yet coded.

---

*This onboarding guide reflects the actual repository state as of the current commit.  Keep it updated as new features land.*
