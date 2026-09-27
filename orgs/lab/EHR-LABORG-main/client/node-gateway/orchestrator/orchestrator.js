'use strict';

const { AgentContext, AgentResult, AgentStatus } = require('./agent-contract');
const ExecutionState = require('./state');

// In-memory store for workflow execution states (keyed by runId)
const activeRuns = new Map();

/**
 * Interface Adapters / Stubs for Team Modules
 * NOTE: These stubs use fallback mocks or delegate to real agent modules if imported.
 * Individual team members will replace these stubs with their actual modules during integration.
 */

// Saurabh: Lab Agent Stub
async function callLabAgent(context, inputPayload) {
  try {
    const labAgentModule = require('../agents/lab-agent');
    if (typeof labAgentModule.runLabAgent === 'function') {
      return await labAgentModule.runLabAgent(context, inputPayload);
    }
  } catch (_e) {
    // Fallback stub if Saurabh's module is not yet merged
  }

  return new AgentResult({
    agentId: 'lab-agent',
    status: AgentStatus.SUCCESS,
    confidence: 'high',
    result: {
      summary: 'Lab analysis stub: Hemoglobin is 9.2 g/dL.',
      findings: 'Low hemoglobin level detected.',
      abnormalities: ['Low Hemoglobin (9.2 g/dL vs 12.0-15.5)'],
      riskFlags: ['Possible Moderate Anemia']
    },
    metadata: { source: 'stub-mock' }
  });
}

// Abdullah: Patient History Agent Stub
async function callHistoryAgent(context) {
  try {
    const historyModule = require('../agents/history-agent');
    if (typeof historyModule.runHistoryAgent === 'function') {
      return await historyModule.runHistoryAgent(context);
    }
  } catch (_e) {
    // Fallback stub if Abdullah's module is not yet merged
  }

  return new AgentResult({
    agentId: 'history-agent',
    status: AgentStatus.SUCCESS,
    confidence: 'high',
    result: {
      patientId: context.patientId,
      historyCount: 2,
      timeline: [
        { date: '2026-01-10', testCode: 'CBC', hemoglobin: '11.2 g/dL' },
        { date: '2026-04-19', testCode: 'CBC', hemoglobin: '9.2 g/dL' }
      ],
      trendSummary: 'Progressive decline in Hemoglobin levels over past 3 months.'
    },
    metadata: { source: 'stub-mock' }
  });
}

// Ankit Patidar: Clinical Decision Support Agent Stub
async function callClinicalAgent(context, labResult, historyResult) {
  try {
    const clinicalModule = require('../agents/clinical-agent');
    if (typeof clinicalModule.runClinicalAgent === 'function') {
      return await clinicalModule.runClinicalAgent(context, labResult, historyResult);
    }
  } catch (_e) {
    // Fallback stub if Ankit's module is not yet merged
  }

  return new AgentResult({
    agentId: 'clinical-agent',
    status: AgentStatus.SUCCESS,
    confidence: 'medium',
    result: {
      recommendation: 'Evaluate for iron deficiency anemia; recommend serum ferritin and iron panel.',
      possibleRisks: ['Occult blood loss', 'Nutritional deficiency'],
      nextSteps: ['Order Serum Ferritin', 'Schedule clinical follow-up']
    },
    metadata: { source: 'stub-mock' }
  });
}

// Adarsh: Governance / Safety Agent Stub
async function callGovernance(context, allResults) {
  try {
    const governanceModule = require('../governance/governance');
    if (typeof governanceModule.checkGovernance === 'function') {
      return await governanceModule.checkGovernance(context, allResults);
    }
  } catch (_e) {
    // Fallback stub if Adarsh's module is not yet merged
  }

  return new AgentResult({
    agentId: 'governance-agent',
    status: AgentStatus.SUCCESS,
    result: {
      approved: true,
      requiresHumanReview: true,
      safetyFlags: ['Pertains to abnormal clinical lab finding'],
      disclaimerVerified: true
    },
    metadata: { source: 'stub-mock' }
  });
}

// Sushil: VCAP Provenance Builder Stub
async function createVCAP(state) {
  try {
    const vcapModule = require('../provenance/vcap');
    if (typeof vcapModule.buildAndAnchorVCAP === 'function') {
      return await vcapModule.buildAndAnchorVCAP(state);
    }
  } catch (_e) {
    // Fallback stub if Sushil's module is not yet merged
  }

  return 'QmStubVCAPMockCidHash123456789';
}

/**
 * Master Stateful Workflow Orchestrator
 * Executes the pipeline: LAB -> HISTORY -> CLINICAL -> GOVERNANCE -> HUMAN REVIEW -> VCAP
 *
 * @param {Object} payload - { runId, patientId, resultId, testCode, resultData }
 * @returns {Promise<ExecutionState>}
 */
async function runWorkflow(payload) {
  const runId = payload.runId || `run-${Date.now()}`;
  const patientId = payload.patientId || 'patient-1001';

  const state = new ExecutionState(runId, patientId, payload);
  activeRuns.set(runId, state);

  try {
    // 1. STEP 1: LAB AGENT NODE
    state.updateAgentStart('lab-agent');
    const labContext = new AgentContext({ runId, patientId, requestingAgent: 'ORCHESTRATOR', metadata: payload });
    const labResult = await callLabAgent(labContext, payload);
    state.recordAgentResult(labResult);

    // 2. STEP 2: PATIENT HISTORY AGENT NODE
    state.updateAgentStart('history-agent');
    const historyContext = new AgentContext({
      runId,
      patientId,
      requestingAgent: 'ORCHESTRATOR',
      previousResults: state.agentResults,
      metadata: payload
    });
    const historyResult = await callHistoryAgent(historyContext);
    state.recordAgentResult(historyResult);

    // 3. STEP 3: CLINICAL DECISION SUPPORT AGENT NODE
    state.updateAgentStart('clinical-agent');
    const clinicalContext = new AgentContext({
      runId,
      patientId,
      requestingAgent: 'ORCHESTRATOR',
      previousResults: state.agentResults,
      metadata: payload
    });
    const clinicalResult = await callClinicalAgent(clinicalContext, labResult, historyResult);
    state.recordAgentResult(clinicalResult);

    // 4. STEP 4: GOVERNANCE & SAFETY CHECK
    state.updateAgentStart('governance-agent');
    const governanceContext = new AgentContext({
      runId,
      patientId,
      requestingAgent: 'ORCHESTRATOR',
      previousResults: state.agentResults,
      metadata: payload
    });
    const governanceResult = await callGovernance(governanceContext, state.agentResults);
    state.recordAgentResult(governanceResult);

    // 5. STEP 5: HUMAN REVIEW / APPROVAL GATE
    if (governanceResult.result && governanceResult.result.requiresHumanReview) {
      state.pauseForHumanReview();
      return state;
    }

    // 6. STEP 6: VCAP PROVENANCE RECORD & COMPLETION (Auto-complete if no human review required)
    const vcapCid = await createVCAP(state);
    state.complete(vcapCid);

    return state;
  } catch (error) {
    state.fail(error.message);
    return state;
  }
}

/**
 * Handle Doctor Human Approval
 * @param {string} runId
 * @param {Object} approvalPayload - { reviewedBy, decision, comments }
 */
async function approveWorkflowRun(runId, approvalPayload) {
  const state = activeRuns.get(runId);
  if (!state) {
    throw new Error(`Run ID ${runId} not found`);
  }

  state.recordHumanApproval(approvalPayload);

  if (approvalPayload.decision === 'APPROVED') {
    const vcapCid = await createVCAP(state);
    state.complete(vcapCid);
  } else {
    state.fail(`Human reviewer rejected AI recommendation: ${approvalPayload.comments || 'No comment'}`);
  }

  return state;
}

/**
 * Retrieve execution state by runId.
 */
function getWorkflowState(runId) {
  return activeRuns.get(runId) || null;
}

module.exports = {
  runWorkflow,
  approveWorkflowRun,
  getWorkflowState,
  activeRuns,
  // Export adapter stubs for unit testing
  callLabAgent,
  callHistoryAgent,
  callClinicalAgent,
  callGovernance,
  createVCAP
};
