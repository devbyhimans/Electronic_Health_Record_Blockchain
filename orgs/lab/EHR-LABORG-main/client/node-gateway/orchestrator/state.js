'use strict';

/**
 * ExecutionState
 * Represents the state machine tracking an active or completed multi-agent workflow run.
 */
class ExecutionState {
  /**
   * @param {string} runId - Unique execution ID
   * @param {string} patientId - Target patient identifier
   * @param {Object} [initialPayload={}] - Initial trigger payload (e.g. resultId, raw resultData)
   */
  constructor(runId, patientId, initialPayload = {}) {
    this.runId = String(runId);
    this.patientId = String(patientId);
    this.currentAgent = 'IDLE';
    this.completedAgents = [];
    this.agentResults = {}; // Map of agentId -> AgentResult
    this.errors = [];
    this.status = 'INITIALIZED'; // 'INITIALIZED' | 'RUNNING' | 'PAUSED_FOR_HUMAN' | 'COMPLETED' | 'FAILED'
    this.initialPayload = initialPayload;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.vcapCid = null;
    this.humanApproval = null;
  }

  /**
   * Update state when an agent begins execution.
   * @param {string} agentId
   */
  updateAgentStart(agentId) {
    this.currentAgent = agentId;
    this.status = 'RUNNING';
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Record the output of a completed agent step.
   * @param {Object} result - AgentResult object
   */
  recordAgentResult(result) {
    if (!result || !result.agentId) {
      throw new Error('Invalid AgentResult passed to recordAgentResult');
    }
    this.agentResults[result.agentId] = result;
    if (!this.completedAgents.includes(result.agentId)) {
      this.completedAgents.push(result.agentId);
    }
    if (result.errors && result.errors.length > 0) {
      this.errors.push(...result.errors);
    }
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Pause execution for doctor / human review.
   */
  pauseForHumanReview() {
    this.status = 'PAUSED_FOR_HUMAN';
    this.currentAgent = 'HUMAN_REVIEW';
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Record doctor approval / rejection decision.
   * @param {Object} approvalDetails - { reviewedBy, decision, comments, timestamp }
   */
  recordHumanApproval(approvalDetails) {
    this.humanApproval = {
      reviewedBy: approvalDetails.reviewedBy || 'DOCTOR',
      decision: approvalDetails.decision || 'APPROVED', // 'APPROVED' | 'REJECTED'
      comments: approvalDetails.comments || '',
      timestamp: new Date().toISOString()
    };
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Mark execution as successfully completed with final VCAP CID.
   * @param {string} vcapCid - IPFS CID of the VCAP provenance record
   */
  complete(vcapCid = null) {
    this.status = 'COMPLETED';
    this.currentAgent = 'COMPLETED';
    this.vcapCid = vcapCid;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Mark execution as failed.
   * @param {string} errorMessage
   */
  fail(errorMessage) {
    this.status = 'FAILED';
    this.errors.push(String(errorMessage));
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Serialize current state summary.
   */
  toJSON() {
    return {
      runId: this.runId,
      patientId: this.patientId,
      currentAgent: this.currentAgent,
      completedAgents: this.completedAgents,
      agentResults: this.agentResults,
      errors: this.errors,
      status: this.status,
      vcapCid: this.vcapCid,
      humanApproval: this.humanApproval,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = ExecutionState;
