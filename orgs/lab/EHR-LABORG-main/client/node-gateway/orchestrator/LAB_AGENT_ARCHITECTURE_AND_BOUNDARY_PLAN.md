# Lab Agent Architecture & Boundary Plan

> **Author: Core Agentic Architecture & Orchestration Lead (Javed)**  
> **Status: ARCHITECTURE & BOUNDARY MAPPING COMPLETE — READ-ONLY PLANNING (NO CODE/CRYPTO/DOCKER MODIFIED)**  
> **Target System: Lab Organization (`orgs/lab/EHR-LABORG-main/client/node-gateway/`)**  
> **Date: 2026-09-27**  

---

## 1. Current Architecture

The Lab Organization currently consists of:
- **Blockchain Layer**: Fabric 2.5 LTS network on `ehrchannel` (`LabMSP`) with 3 peer nodes (`peer0.lab.example.com:7051`, `peer1`, `peer2`) and chaincode `labresults` (`LabResultsContract`).
- **Storage Layer**: Containerized IPFS Kubo node (`ipfs.lab.example.com:5001/8080`).
- **Application Layer**: Monolithic `node-gateway` (`server.js`, `gateway.js`, `ai-agent.js`, `ipfs.js`, `report-extractor.js`).
- **AI Integration**: Gemini 2.5 Flash API calls directly executed inside `ai-agent.js` (`callGeminiJson`).
- **Identity**: Pre-generated crypto artifacts via `cryptogen` using identity `User1@lab.example.com`.

---

## 2. Proposed Lab Agent Architecture

```
                                 FABRIC ORGANIZATION (LabMSP)
                                              │
  ┌───────────────────────────────────────────┴───────────────────────────────────────────┐
  │                                                                                       │
  │  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
  │  │                            LAB AGENT SERVICE CONTAINER                          │  │
  │  │                           (App-Layer Service / Client)                          │  │
  │  │                                                                                 │  │
  │  │   ┌─────────────────────────────────────────────────────────────────────────┐   │  │
  │  │   │                         AI Reasoning Engine                             │   │  │
  │  │   │      (Gemini Flash API — runLabReportAnalysisAgent / ai-agent.js)       │   │  │
  │  │   └────────────────────────────────────┬────────────────────────────────────┘   │  │
  │  │                                        │                                        │  │
  │  │                                        ▼                                        │  │
  │  │   ┌─────────────────────────────────────────────────────────────────────────┐   │  │
  │  │   │                         Tool Abstraction Layer                          │   │  │
  │  │   │                     (tools/fabric-tools.js, ipfs-tools.js)              │   │  │
  │  │   └────────────────────────────────────┬────────────────────────────────────┘   │  │
  │  │                                        │                                        │  │
  │  └────────────────────────────────────────┼────────────────────────────────────────┘  │
  │                                           │ gRPC Client (@hyperledger/fabric-gateway)     │
  │                                           │ Identity: User1 (Phase 1) / labagent (Phase 2)│
  │                                           ▼                                           │
  │  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
  │  │                          Fabric Gateway (peer0.lab.example.com)                 │  │
  │  └────────────────────────────────────────┬────────────────────────────────────────┘  │
  │                                           │                                           │
  │                                           ▼                                           │
  │  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
  │  │                         Fabric Peer (peer0.lab.example.com:7051)                │  │
  │  └────────────────────────────────────────┬────────────────────────────────────────┘  │
  │                                           │                                           │
  │                                           ▼                                           │
  │  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
  │  │                         Chaincode (labresults) & Ledger DB                      │  │
  │  └─────────────────────────────────────────────────────────────────────────────────┘  │
  └───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. What "Agent" Means at Application Level

At the application level, an **Organization Agent**:
- Is an intelligent client application service that represents an organization (`LabMSP`).
- Contains domain-specific AI reasoning (Gemini LLM calls, report extraction, clinical summaries).
- Maintains local workflow context and task state.
- Exposes HTTP REST endpoints for inter-agent communication and orchestration.
- **Is NOT a Fabric Peer, Orderer, Chaincode, or CA.**

---

## 4. What "LabMSP" Means at Fabric Level

At the Fabric level, **`LabMSP`**:
- Is a Membership Service Provider defining identity rules for `lab.example.com`.
- Validates that X.509 certificates presented during gRPC sessions were signed by the Lab Organization root CA (`ca.lab.example.com`).
- Enforces organizational access control across peers and chaincode policies.
- An Agent Node is simply a **Fabric Client** possessing an X.509 identity issued under `LabMSP`.

---

## 5. Team Module Mapping

All 6 team modules are mapped into the Lab Gateway application architecture:

```
node-gateway/
├── server.js                      ← REST API Entry Point (Javed + Team integration)
│
├── orchestrator/                  ← JAVED (Core Architect)
│   ├── agent-contract.js          ← Common contracts (AgentContext, AgentResult)
│   ├── state.js                   ← ExecutionState tracking
│   └── orchestrator.js            ← Master pipeline router (LAB -> HISTORY -> CLINICAL -> GOVERNANCE -> VCAP)
│
├── agents/
│   ├── lab-agent.js               ← SAURABH (Refactors runLabReportAnalysisAgent from ai-agent.js)
│   ├── history-agent.js           ← ABDULLAH (Patient history timeline & trend extraction)
│   └── clinical-agent.js          ← ANKIT PATIDAR (CDS multi-source clinical synthesis)
│
├── governance/
│   └── governance.js              ← ADARSH (Deterministic safety guardrails & certainty checks)
│
├── tools/                         ← SUSHIL (Tool Abstraction Layer)
│   ├── fabric-tools.js            ← Wraps gateway.js transaction functions
│   ├── ipfs-tools.js              ← Wraps ipfs.js IPFS upload/fetch
│   └── hospital-tools.js          ← Wraps Hospital REST calls
│
└── provenance/
    └── vcap.js                    ← SUSHIL (VCAP Provenance record builder & anchor)
```

---

## 6. Application → Fabric Boundary

```
[ AI REASONING LAYER ]  (UNTRUSTED FOR LEDGER MUTATION)
  • Gemini LLM calls (`callGeminiJson`)
  • System prompts & prompt formatting
  • Report text parsing (`report-extractor.js`)
       │
       │ Output: Structured JSON proposal only (AgentResult)
       ▼
[ TOOL ABSTRACTION LAYER ]  (AUTHORIZATION & SANITIZATION GATE)
  • `tools/fabric-tools.js`
  • Validates parameter schemas, checks patient consent, verifies governance approvals
       │
       │ Formatted function arguments (e.g. createLabResult payload)
       ▼
[ FABRIC GATEWAY LAYER ]  (CRYPTO SIGNING & NETWORK PROTOCOL)
  • `gateway.js` (`@hyperledger/fabric-gateway`)
  • Signs transaction proposal with X.509 private key (`User1@lab.example.com`)
       │
       │ gRPC over TLS
       ▼
[ FABRIC PEER & CHAINCODE LAYER ]  (DETERMINISTIC MUTATION & LEDGER STATE)
  • `peer0.lab.example.com:7051`
  • `labresults` chaincode (`CreateLabResult`, `UpdateLabStatus`)
  • CouchDB world state & block ledger (`ehrchannel`)
```

### Violations Avoided
- **No direct CouchDB query**: Agents call chaincode functions (`GetLabResultsByPatient`).
- **No Fabric SDK in reasoning code**: `ai-agent.js` contains zero `@hyperledger/fabric-gateway` imports.
- **No LLM in chaincode**: Smart contracts perform strictly deterministic state checks.

---

## 7. Current Gateway Identity Flow

In `client/node-gateway/gateway.js`:
- **Identity Path**: `organizations/peerOrganizations/lab.example.com/users/User1@lab.example.com/msp/`
- **Certificate**: `signcerts/User1@lab.example.com-cert.pem`
- **Private Key**: `keystore/<private_key_file>`
- **MSP ID**: `'LabMSP'`
- **Function**: `newIdentity()` (line 58) and `newSigner()` (line 66)

---

## 8. Future LabAgent Identity Integration Point

To switch identity dynamically from `User1` to `labagent` in Phase 2 without rewriting gateway logic:

### Minimum Code Change in `gateway.js`:
```javascript
// Parameterize user identity with FABRIC_USER environment variable
const FABRIC_USER = process.env.FABRIC_USER || 'User1@lab.example.com';

const USER_MSP_DIR = path.join(
  ROOT_DIR,
  'organizations',
  'peerOrganizations',
  'lab.example.com',
  'users',
  FABRIC_USER,
  'msp'
);

function newIdentity() {
  const certPath = path.join(USER_MSP_DIR, 'signcerts', `${FABRIC_USER}-cert.pem`);
  return {
    mspId: 'LabMSP',
    credentials: fs.readFileSync(certPath),
  };
}
```

By simply setting `FABRIC_USER=labagent@lab.example.com`, the gateway loads the `labagent` cert while preserving full fallback compatibility with `User1`.

---

## 9. Docker Deployment Model

- **Current Container Setup**: `node-gateway` currently runs on host or within Machine 1 environment connecting to Docker network `fabric`.
- **Compose File**: `docker/docker-compose.machine1.yaml`.
- **Existing Network**: `fabric` (`FABRIC_NETWORK`). All peer containers (`peer0.lab.example.com`, `orderer.example.com`, `ipfs.lab.example.com`) are attached to `fabric`.
- **Communication**: Node Gateway resolves `peer0.lab.example.com:7051` directly over the Docker container network.

---

## 10. Phase 1 Implementation Recommendation

> **RECOMMENDATION: Use `node-gateway` itself as the in-process Lab Agent host for Phase 1.**

### Justification:
1. **Zero Infrastructure Overhead**: Avoids modifying Docker Compose files, tearing down containers, or setting up new host mounts during feature development.
2. **Immediate Developer Velocity**: Team members write modular Node.js files in `agents/`, `tools/`, and `governance/` without needing Docker container rebuilds.
3. **Identical Interface**: The internal module interfaces (`AgentContext` -> `AgentResult`) are 100% identical whether executed in-process or across separate HTTP containers.

---

## 11. Phase 2 Fabric Identity & Container Implementation Roadmap

1. Update `config/crypto-config.yaml` to specify `Users: Count: 2` under `PeerOrgs.Lab`.
2. Run `cryptogen extend` to generate `labagent@lab.example.com` certificates.
3. Add `lab-agent` service definition to `docker-compose.machine1.yaml` on `fabric` network.
4. Mount `labagent` MSP directory read-only into `/app/organizations`.
5. Set environment variable `FABRIC_USER=labagent@lab.example.com`.

---

## 12. Exact Files Involved

| Category | File Path | Status / Action |
|---|---|---|
| Contract | `client/node-gateway/orchestrator/agent-contract.js` | CREATED |
| State | `client/node-gateway/orchestrator/state.js` | CREATED |
| Orchestrator | `client/node-gateway/orchestrator/orchestrator.js` | CREATED |
| API Server | `client/node-gateway/server.js` | MODIFIED (Integration endpoints added) |
| Gateway Client | `client/node-gateway/gateway.js` | KEEP (Future parameterization point) |
| AI Reasoning Base | `client/node-gateway/ai-agent.js` | KEEP (Refactor source for Saurabh) |
| IPFS Client | `client/node-gateway/ipfs.js` | KEEP |
| PDF/OCR Extractor | `client/node-gateway/report-extractor.js` | KEEP |
| Lab Agent | `client/node-gateway/agents/lab-agent.js` | TO BE CREATED (Saurabh) |
| History Agent | `client/node-gateway/agents/history-agent.js` | TO BE CREATED (Abdullah) |
| Clinical Agent | `client/node-gateway/agents/clinical-agent.js` | TO BE CREATED (Ankit P.) |
| Governance | `client/node-gateway/governance/governance.js` | TO BE CREATED (Adarsh) |
| Tool Layer | `client/node-gateway/tools/fabric-tools.js` | TO BE CREATED (Sushil) |
| VCAP Provenance | `client/node-gateway/provenance/vcap.js` | TO BE CREATED (Sushil) |

---

## 13. Files That Must NOT Be Modified

- ❌ `chaincode/lab-results/index.js` (Lab smart contract works, no changes needed).
- ❌ `config/configtx.yaml` & `config/crypto-config.yaml` (No network rebuild).
- ❌ `docker/docker-compose.machine1/2/3.yaml` (No container changes in Phase 1).
- ❌ `connection-profiles/lab-connection.json` (Existing connection profile works).
- ❌ `scripts/*.sh` (No deployment script changes).

---

## 14. Security Considerations

1. **Strict Separation of Concerns**: LLMs generate text; Tool Layer validates; Gateway signs; Chaincode executes.
2. **Audit Trail**: Every VCAP record is saved to IPFS and its CID is written to `ehrchannel` ledger.
3. **No Direct State Manipulation**: LLMs cannot write to CouchDB or bypass chaincode endorsement.
4. **Human Gate**: Governance flags abnormal cases to require explicit Doctor approval before VCAP commit.

---

## 15. Open Questions

- **O1 (Cross-Org Network)**: How will Hospital Agent communicate with Lab Agent in Phase 2 across different hosts? -> *Resolution: Standard HTTP REST over host IP or Tailscale mesh VPN.*
- **O2 (Pharmacy Channel Isolation)**: Confirm Pharmacy network is on `mychannel`. -> *Resolution: Confirmed. Pharmacy communicates with Lab/Hospital via HTTP REST bridge only.*

---

## 16. Recommended Next Implementation Task

**Saurabh begins implementation of `agents/lab-agent.js`**, importing base functions from `ai-agent.js` and wrapping output in `AgentResult`.

---

*This completes the Lab Agent Architecture and Boundary Plan.*
