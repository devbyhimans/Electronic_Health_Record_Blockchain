# Lab Node Gateway Server Integration Plan

> **Author: Core Agentic Architecture & Orchestration Lead (Javed)**  
> **Status: PLAN PROPOSED — AWAITING REVIEW / APPROVAL BEFORE IMPLEMENTATION**  
> **Target File: `orgs/lab/EHR-LABORG-main/client/node-gateway/server.js`**  
> **Date: 2026-09-27**  

---

## 1. Current Server Architecture Analysis

The existing Lab `server.js` is an Express.js application acting as the API Gateway for the Lab Organization.

- **Module System**: Strictly **CommonJS** (`'use strict'`, `require()`, `module.exports`).
- **Port & Host**: Runs on port `3000` (or `process.env.PORT`) bound to `0.0.0.0`.
- **Static Assets**: Serves static Web UI files from `./public`.
- **Existing Middleware**:
  - `express.json({ limit: '1mb' })`: JSON body parsing.
  - `express.static(WEB_ROOT)`: Public assets.
  - `uploadReportFile.single('reportFile')`: Multer memory storage single-file upload middleware.
  - `normalizeError(error)`: Global error handling middleware.
- **Existing API Endpoint Groups**:
  - Metadata & System Info (`/api/meta`, `/api/health`).
  - IPFS Services (`/api/ipfs/health`, `/api/ipfs/add-json`, `/api/ipfs/json/:cid`).
  - Direct AI Analysis (`/api/ai/analyze`).
  - Ledger Record Queries & Writes (`/api/records`, `/api/records/:resultId`, `/api/patients/:patientId/records`, `/api/records/ipfs`, `/api/records/:resultId/status`, `/api/records/:resultId/resolve-data`).
- **Route Overlap Check**:
  - **No route overlap exists.** Existing AI endpoint is `/api/ai/analyze`. There are currently no routes starting with `/api/agents/`.

---

## 2. Recommended Integration Point

The Orchestrator will be connected into `server.js` at two precise locations:

```
server.js
│
├── 1. TOP-LEVEL IMPORTS (around line 33)
│      const { runWorkflow, approveWorkflowRun, getWorkflowState } = require('./orchestrator/orchestrator');
│
├── ... existing Express setup & routes ...
│
├── 2. NEW AGENTIC ORCHESTRATOR ROUTES (around line 518, before SPA fallback & error handler)
│      POST /api/agents/run
│      GET  /api/agents/run/:runId
│      POST /api/agents/run/:runId/approve
│
└── 3. SPA FALLBACK & ERROR MIDDLEWARE (lines 524-536)
```

---

## 3. Required Module Imports Compatibility

- The project uses CommonJS throughout.
- The foundation files (`agent-contract.js`, `state.js`, `orchestrator.js`) export using `module.exports = { ... }`.
- Importing via `const { runWorkflow, approveWorkflowRun, getWorkflowState } = require('./orchestrator/orchestrator');` is **100% compatible** and maintains project consistency.

---

## 4. Proposed Endpoint Specifications

### Endpoint 1: Start Agentic Workflow Pipeline
- **HTTP Method**: `POST`
- **Route**: `/api/agents/run`
- **Request Payload**:
  ```json
  {
    "patientId": "patient-1001",
    "resultId": "labresult1",
    "testCode": "CBC",
    "resultData": {
      "hemoglobin": "9.2",
      "wbc": "6200"
    }
  }
  ```
- **Response Payload (HTTP 202 Accepted)**:
  ```json
  {
    "runId": "run-1711560000000",
    "patientId": "patient-1001",
    "currentAgent": "HUMAN_REVIEW",
    "completedAgents": ["lab-agent", "history-agent", "clinical-agent", "governance-agent"],
    "agentResults": {
      "lab-agent": { "agentId": "lab-agent", "status": "SUCCESS", "result": { ... }, "confidence": "high" },
      "history-agent": { "agentId": "history-agent", "status": "SUCCESS", "result": { ... } },
      "clinical-agent": { "agentId": "clinical-agent", "status": "SUCCESS", "result": { ... } },
      "governance-agent": { "agentId": "governance-agent", "status": "SUCCESS", "result": { "requiresHumanReview": true } }
    },
    "errors": [],
    "status": "PAUSED_FOR_HUMAN",
    "vcapCid": null,
    "humanApproval": null,
    "createdAt": "2026-09-27T17:00:00.000Z",
    "updatedAt": "2026-09-27T17:00:02.000Z"
  }
  ```

---

### Endpoint 2: Get Workflow Run State
- **HTTP Method**: `GET`
- **Route**: `/api/agents/run/:runId`
- **Request Parameters**: `runId` in URL path.
- **Response Payload (HTTP 200 OK)**:
  Returns current `ExecutionState.toJSON()` payload.
- **Error Response (HTTP 404 Not Found)**:
  ```json
  { "error": "Workflow run run-12345 not found" }
  ```

---

### Endpoint 3: Doctor Human Approval Gate
- **HTTP Method**: `POST`
- **Route**: `/api/agents/run/:runId/approve`
- **Request Payload**:
  ```json
  {
    "reviewedBy": "Dr. Sharma",
    "decision": "APPROVED",
    "comments": "Concur with iron deficiency recommendation; order ferritin test."
  }
  ```
- **Response Payload (HTTP 200 OK)**:
  ```json
  {
    "runId": "run-1711560000000",
    "patientId": "patient-1001",
    "currentAgent": "COMPLETED",
    "completedAgents": ["lab-agent", "history-agent", "clinical-agent", "governance-agent"],
    "status": "COMPLETED",
    "vcapCid": "QmStubVCAPMockCidHash123456789",
    "humanApproval": {
      "reviewedBy": "Dr. Sharma",
      "decision": "APPROVED",
      "comments": "Concur with iron deficiency recommendation; order ferritin test.",
      "timestamp": "2026-09-27T17:05:00.000Z"
    }
  }
  ```

---

## 5. Error Handling & Security Integration

1. **Express Error Forwarding**: All async route handlers wrap execution in `try-catch` blocks and pass exceptions to `next(error)`, delegating to `server.js`'s existing `normalizeError()` middleware.
2. **Input Validation**: `runWorkflow()` checks `patientId` presence and generates default `runId` if omitted.
3. **Route Scoping**: Positioned before the wildcard SPA route `app.get('*')` to ensure API routes are matched prior to fallback HTML rendering.
4. **Zero Impact on Existing Routes**: `/api/records`, `/api/records/ipfs`, and `/api/ai/analyze` remain completely untouched.

---

## 6. Exact Proposed Code Insertion for `server.js`

```javascript
// --- 1. ADD IMPORT AT TOP OF SERVER.JS (line 33) ---
const {
  runWorkflow,
  approveWorkflowRun,
  getWorkflowState,
} = require('./orchestrator/orchestrator');

// --- 2. ADD ROUTES BEFORE SPA FALLBACK ROUTE (line ~518) ---
app.post('/api/agents/run', async (req, res, next) => {
  try {
    const state = await runWorkflow(req.body);
    res.status(202).json(state.toJSON());
  } catch (error) {
    next(error);
  }
});

app.get('/api/agents/run/:runId', (req, res, next) => {
  try {
    const state = getWorkflowState(req.params.runId);
    if (!state) {
      res.status(404).json({ error: `Workflow run ${req.params.runId} not found` });
      return;
    }
    res.json(state.toJSON());
  } catch (error) {
    next(error);
  }
});

app.post('/api/agents/run/:runId/approve', async (req, res, next) => {
  try {
    const state = await approveWorkflowRun(req.params.runId, req.body);
    res.json(state.toJSON());
  } catch (error) {
    next(error);
  }
});
```

---

## 7. Files to Modify

| File | Change | Purpose |
|---|---|---|
| `orgs/lab/EHR-LABORG-main/client/node-gateway/server.js` | Add 1 require + 3 route handlers (approx 35 lines) | Connect Orchestrator engine to Express REST API |

---

*This integration plan is ready for review. Implementation will proceed upon approval.*
