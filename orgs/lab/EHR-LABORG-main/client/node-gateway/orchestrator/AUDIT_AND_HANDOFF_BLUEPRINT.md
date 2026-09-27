# Codebase Audit & Parallel Team Handoff Blueprint

> **Author: Core Agentic Architecture & Orchestration Lead (Javed)**  
> **Status: AUDIT COMPLETE — FOUNDATION VERIFIED & READY FOR COMMIT**  
> **Target Audience: Full Agentic AI Team (Javed, Saurabh, Abdullah, Ankit Patidar, Adarsh, Sushil)**  
> **Date: 2026-09-28**  

---

## EXECUTIVE SUMMARY & ARCHITECTURE STATUS

A complete audit of the repository reveals:
1. **Fabric Blockchain Layer**: Operates Hyperledger Fabric v2.5 LTS networks (`LabMSP` on `ehrchannel`).
2. **IPFS Off-Chain Storage**: IPFS Kubo node running on `http://127.0.0.1:5001`.
3. **Gateway Server**: Express server running in `client/node-gateway/server.js` on port `3000`.
4. **Javed Agentic Foundation**: Fully verified and integrated:
   - `orchestrator/agent-contract.js`: Defines `AgentContext`, `AgentResult`, and `AgentStatus`.
   - `orchestrator/state.js`: Defines `ExecutionState` state machine.
   - `orchestrator/orchestrator.js`: Master workflow pipeline with stub adapters.
   - `server.js`: Orchestrator API integration (`POST /api/agents/run`, `GET /api/agents/run/:runId`, `POST /api/agents/run/:runId/approve`).

---

## A. HOW A TEAMMATE STARTS

Every team member MUST start by checking out Javed's foundation branch and creating their feature branch from it:

```bash
# 1. Fetch latest changes and checkout foundation branch
git fetch origin
git checkout javed/agentic-foundation

# 2. Create your isolated feature branch
# For Saurabh:
git checkout -b saurabh/lab-agent

# For Abdullah:
git checkout -b abdullah/history-agent

# For Ankit Patidar:
git checkout -b ankit/clinical-agent

# For Adarsh:
git checkout -b adarsh/governance-agent

# For Sushil:
git checkout -b sushil/tools-vcap
```

> **CRITICAL RULE**: Do NOT modify Javed's orchestrator files (`orchestrator/agent-contract.js`, `orchestrator/state.js`, `orchestrator/orchestrator.js`, or `server.js`). Build your module in your assigned directory.

---

## B. COMMON CONTRACT

Every agent module in the system MUST consume `AgentContext` and return `AgentResult`.

### 1. `AgentContext` Schema (`orchestrator/agent-contract.js`)

```javascript
class AgentContext {
  constructor({
    runId,             // MANDATORY (string) — Unique workflow execution ID
    patientId,         // MANDATORY (string) — Target patient ID
    requestingAgent,   // OPTIONAL  (string) — Calling agent ID (Default: 'ORCHESTRATOR')
    previousResults,   // OPTIONAL  (object) — Map of agentId -> AgentResult from prior steps (Default: {})
    metadata           // OPTIONAL  (object) — Request parameters e.g. resultId, testCode (Default: {})
  })
}
```

- **Mandatory Fields**: `runId`, `patientId` (throws `Error` if missing).
- **Auto-generated**: `timestamp` (ISO string).

### 2. `AgentResult` Schema (`orchestrator/agent-contract.js`)

```javascript
class AgentResult {
  constructor({
    agentId,           // MANDATORY (string) — Identifier e.g. 'lab-agent', 'history-agent'
    status,            // OPTIONAL  (string) — AgentStatus enum (Default: AgentStatus.SUCCESS)
    result,            // OPTIONAL  (object) — Module output findings payload (Default: {})
    confidence,        // OPTIONAL  (string) — 'high' | 'medium' | 'low' (Default: 'medium')
    errors,            // OPTIONAL  (array)  — Array of error/warning strings (Default: [])
    metadata           // OPTIONAL  (object) — Execution metadata e.g. modelUsed (Default: {})
  })
}
```

- **Mandatory Fields**: `agentId` (throws `Error` if missing).
- **Auto-generated**: `timestamp` (ISO string).

### 3. Allowed `AgentStatus` Values (`AgentStatus`)
- `PENDING`: Initial queued state.
- `IN_PROGRESS`: Currently executing.
- `SUCCESS`: Normal execution complete.
- `WARNING`: Execution complete with non-critical warnings.
- `FAILED`: Execution failed.
- `HUMAN_REVIEW_REQUIRED`: Paused for explicit clinician review.

---

## C. TEAMMATE RESPONSIBILITIES

### 1. Saurabh — Lab Agent
- **File**: `client/node-gateway/agents/lab-agent.js`
- **Primary Function**: `async function runLabAgent(context, inputPayload)`
- **Input Parameters**:
  - `context`: `AgentContext`
  - `inputPayload`: `{ resultData, testCode, reportText }`
- **Output**: `AgentResult`
- **Expected `result` Schema**:
  ```json
  {
    "summary": "Hemoglobin concentration is 9.2 g/dL.",
    "findings": "Low hemoglobin level detected.",
    "abnormalities": ["Low Hemoglobin (9.2 g/dL vs 12.0-15.5 g/dL)"],
    "riskFlags": ["Possible Moderate Anemia"]
  }
  ```

### 2. Abdullah — Patient History Agent
- **File**: `client/node-gateway/agents/history-agent.js`
- **Primary Function**: `async function runHistoryAgent(context)`
- **Input Parameters**:
  - `context`: `AgentContext` (contains `context.patientId`)
- **Output**: `AgentResult`
- **Expected `result` Schema**:
  ```json
  {
    "patientId": "patient-1001",
    "historyCount": 2,
    "timeline": [
      { "date": "2026-01-10", "testCode": "CBC", "hemoglobin": "11.2 g/dL" },
      { "date": "2026-04-19", "testCode": "CBC", "hemoglobin": "9.2 g/dL" }
    ],
    "trendSummary": "Progressive decline in Hemoglobin levels over past 3 months."
  }
  ```

### 3. Ankit Patidar — Clinical Decision Support Agent
- **File**: `client/node-gateway/agents/clinical-agent.js`
- **Primary Function**: `async function runClinicalAgent(context, labResult, historyResult)`
- **Input Parameters**:
  - `context`: `AgentContext`
  - `labResult`: `AgentResult` returned by Saurabh's Lab Agent
  - `historyResult`: `AgentResult` returned by Abdullah's History Agent
- **Output**: `AgentResult`
- **Expected `result` Schema**:
  ```json
  {
    "recommendation": "Evaluate for iron deficiency anemia; recommend serum ferritin and iron panel.",
    "possibleRisks": ["Occult blood loss", "Nutritional deficiency"],
    "nextSteps": ["Order Serum Ferritin", "Schedule clinical follow-up"]
  }
  ```

### 4. Adarsh — Governance & Safety Agent
- **File**: `client/node-gateway/governance/governance.js`
- **Primary Function**: `async function checkGovernance(context, allResults)`
- **Input Parameters**:
  - `context`: `AgentContext`
  - `allResults`: Object map of all prior `AgentResult` instances (`{ "lab-agent": ..., "history-agent": ..., "clinical-agent": ... }`)
- **Output**: `AgentResult`
- **Rule Engine Policy**:
  - **DETERMINISTIC RULE ENGINE ONLY (NO LLM CALLS)**.
  - Checks for abnormal findings, confidence levels, disclaimers, and safety flags.
- **Expected `result` Schema**:
  ```json
  {
    "approved": true,
    "requiresHumanReview": true,
    "safetyFlags": ["Pertains to abnormal clinical lab finding"],
    "disclaimerVerified": true
  }
  ```

### 5. Sushil — Tool Layer & VCAP Provenance
- **Files**:
  - `client/node-gateway/tools/fabric-tools.js`
  - `client/node-gateway/tools/ipfs-tools.js`
  - `client/node-gateway/tools/hospital-tools.js`
  - `client/node-gateway/provenance/vcap.js`
- **Tool Boundary Rule**:
  - Agents MUST call Tool Layer (`tools/*`), NOT `gateway.js`, `ipfs.js`, or Fabric SDK directly.
  - Architecture flow: `Agent ➔ Tool Layer ➔ gateway.js / ipfs.js ➔ Fabric / IPFS`.
- **Primary VCAP Function**: `async function buildAndAnchorVCAP(executionState)`
- **Input Parameter**: `executionState` (`ExecutionState` object instance)
- **Output**: Returns string containing the IPFS CID of the anchored VCAP record (e.g., `"QmXxxx..."`).

---

## D. FILE OWNERSHIP MATRIX

| Teammate | Authorized Files & Directories | Strictly Forbidden Files |
|---|---|---|
| **Javed** | `orchestrator/*`, `server.js` (integration routes) | `agents/*`, `governance/*`, `tools/*`, `provenance/*` |
| **Saurabh** | `agents/lab-agent.js` | `orchestrator/*`, `server.js`, `gateway.js` |
| **Abdullah** | `agents/history-agent.js` | `orchestrator/*`, `agents/lab-agent.js`, `server.js` |
| **Ankit Patidar** | `agents/clinical-agent.js` | `orchestrator/*`, `governance/*`, `server.js` |
| **Adarsh** | `governance/governance.js` | `orchestrator/*`, `agents/*`, `server.js` |
| **Sushil** | `tools/*`, `provenance/*` | `orchestrator/*`, `agents/*`, `server.js` |

---

## E. MOCK DEVELOPMENT & PARALLEL CODING

Each teammate can build and unit-test independently without waiting for other team members to finish.

The orchestrator includes fallback stubs for each module inside `orchestrator/orchestrator.js`:

```
   Independent Development Streams:
   ┌────────────────────────────────────────────────────────┐
   │ Saurabh: Unit test against mock resultData/reportText  │
   │ Abdullah: Unit test against mock patient history       │
   │ Ankit: Unit test against mock labResult/historyResult │
   │ Adarsh: Unit test against mock allResults map          │
   │ Sushil: Unit test VCAP against mock ExecutionState     │
   └────────────────────────────────────────────────────────┘
```

When a teammate's file is committed to their branch, the orchestrator automatically loads their implementation via dynamic `require()` without code changes to `orchestrator.js`.

---

## F. RUNTIME EXECUTION PIPELINE

While development occurs in parallel, **runtime execution is strictly sequential**:

```
1. Lab Agent
     ↓ (labResult)
2. History Agent
     ↓ (historyResult)
3. Clinical Decision Support Agent (consumes labResult + historyResult)
     ↓ (clinicalResult)
4. Governance & Safety Agent (consumes all prior results)
     ↓
5. Human Approval Gate (if governance requires human review: status -> PAUSED_FOR_HUMAN)
     ↓ (Doctor submits POST /api/agents/run/:runId/approve)
6. VCAP Provenance Anchor (builds VCAP record and anchors CID)
     ↓
7. Workflow Completion (status -> COMPLETED)
```

---

## G. TESTING GUIDE

### 1. Teammate Unit Testing (Local Node Execution)

Each teammate can test their contract and module locally:

```bash
# Saurabh (Lab Agent test)
node -e "const { AgentContext } = require('./orchestrator/agent-contract'); const ctx = new AgentContext({ runId: 'r1', patientId: 'p1' }); console.log(ctx);"

# Adarsh (Governance test)
node -e "const { AgentResult, AgentStatus } = require('./orchestrator/agent-contract'); const res = new AgentResult({ agentId: 'gov', status: AgentStatus.SUCCESS }); console.log(res);"
```

### 2. Full Orchestrator Integration Test (HTTP REST API)

Start the server from `client/node-gateway`:
```bash
node server.js
```

#### Test A: Start Workflow
```bash
curl -X POST http://localhost:3000/api/agents/run \
  -H "Content-Type: application/json" \
  -d '{"runId":"run-101","patientId":"patient-1001","resultData":{"hb":"9.2"}}'
```
*Expected Response*: `HTTP 202 Accepted` with `status: "PAUSED_FOR_HUMAN"` and `currentAgent: "HUMAN_REVIEW"`.

#### Test B: Fetch Workflow State
```bash
curl http://localhost:3000/api/agents/run/run-101
```
*Expected Response*: `HTTP 200 OK` returning full `ExecutionState` object.

#### Test C: Doctor Approval
```bash
curl -X POST http://localhost:3000/api/agents/run/run-101/approve \
  -H "Content-Type: application/json" \
  -d '{"reviewedBy":"Dr. Smith","decision":"APPROVED","comments":"Approved treatment plan"}'
```
*Expected Response*: `HTTP 200 OK` with `status: "COMPLETED"`, `currentAgent: "COMPLETED"`, and `vcapCid: "QmStubVCAPMockCidHash123456789"`.

---

## H. GIT & PR WORKFLOW

```
main
  └── develop
        └── javed/agentic-foundation (FOUNDATION BASE)
                ├── saurabh/lab-agent
                ├── abdullah/history-agent
                ├── ankit/clinical-agent
                ├── adarsh/governance-agent
                └── sushil/tools-vcap
```

1. All teammates pull from `javed/agentic-foundation`.
2. All pull requests MUST target `javed/agentic-foundation`.
3. Do NOT modify files outside your ownership boundary.
