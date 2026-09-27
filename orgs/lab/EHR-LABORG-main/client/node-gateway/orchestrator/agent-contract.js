'use strict';

/**
 * AgentStatus
 * Standard Status Enumeration across all Organization Agents
 */
const AgentStatus = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  FAILED: 'FAILED',
  HUMAN_REVIEW_REQUIRED: 'HUMAN_REVIEW_REQUIRED'
});

/**
 * AgentContext
 * Standard Context passed to every agent invocation in the EHR pipeline.
 */
class AgentContext {
  /**
   * @param {Object} options
   * @param {string} options.runId - Unique workflow execution ID
   * @param {string} options.patientId - Patient identifier
   * @param {string} [options.requestingAgent='ORCHESTRATOR'] - Calling agent or system identifier
   * @param {Object} [options.previousResults={}] - Map of agentId -> AgentResult from prior steps
   * @param {Object} [options.metadata={}] - Additional context (e.g. resultId, testCode, doctor ID)
   */
  constructor({
    runId,
    patientId,
    requestingAgent = 'ORCHESTRATOR',
    previousResults = {},
    metadata = {}
  }) {
    if (!runId || !patientId) {
      throw new Error('AgentContext requires both runId and patientId');
    }
    this.runId = String(runId);
    this.patientId = String(patientId);
    this.requestingAgent = String(requestingAgent);
    this.previousResults = previousResults;
    this.timestamp = new Date().toISOString();
    this.metadata = metadata;
  }
}

/**
 * AgentResult
 * Standard Result payload returned by every agent module.
 */
class AgentResult {
  /**
   * @param {Object} options
   * @param {string} options.agentId - Identifier of the responding agent (e.g., 'lab-agent', 'history-agent')
   * @param {string} [options.status=AgentStatus.SUCCESS] - Execution status enum value
   * @param {Object} [options.result={}] - Agent-specific payload findings
   * @param {string} [options.confidence='medium'] - 'high' | 'medium' | 'low'
   * @param {Array<string>} [options.errors=[]] - Error or warning messages
   * @param {Object} [options.metadata={}] - Additional metadata (e.g., modelUsed, IPFS CID, timestamp)
   */
  constructor({
    agentId,
    status = AgentStatus.SUCCESS,
    result = {},
    confidence = 'medium',
    errors = [],
    metadata = {}
  }) {
    if (!agentId) {
      throw new Error('AgentResult requires agentId');
    }
    this.agentId = String(agentId);
    this.status = status;
    this.result = result;
    this.confidence = String(confidence).toLowerCase();
    this.errors = Array.isArray(errors) ? errors : [String(errors)];
    this.timestamp = new Date().toISOString();
    this.metadata = metadata;
  }
}

module.exports = {
  AgentContext,
  AgentResult,
  AgentStatus
};
