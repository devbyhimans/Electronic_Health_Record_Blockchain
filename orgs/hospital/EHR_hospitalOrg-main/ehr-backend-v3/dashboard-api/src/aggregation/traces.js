'use strict';

const { TRACE_STAGES } = require('../contracts/eventRegistry');

function stitchTrace(runId, events, options = {}) {
  const runEvents = events.filter((event) => event.correlationId === runId)
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp) || left.eventId.localeCompare(right.eventId));
  const stageEvents = new Map();
  for (const event of runEvents) {
    if (event.eventType !== 'AGENT_STAGE_UPDATED') continue;
    const name = event.payload?.stage;
    const stage = {
      name,
      status: event.payload?.stageStatus,
      timestamp: event.timestamp,
      durationMs: Number.isFinite(event.payload?.durationMs) ? event.payload.durationMs : null,
      txId: event.txId || null,
      cid: event.payload?.cid || null,
      error: event.payload?.errorCode || null,
      eventId: event.eventId,
      ...(TRACE_STAGES.includes(name) ? {} : { unknown: true }),
      ...(event.mock === true ? { mock: true } : {}),
    };
    const previous = stageEvents.get(name);
    if (!previous || Date.parse(stage.timestamp) >= Date.parse(previous.timestamp)) stageEvents.set(name, stage);
  }
  const unknownStages = [...stageEvents.values()].filter((stage) => stage.unknown);

  const lastEvent = runEvents.at(-1);
  const agentId = runEvents.find((event) => event.payload?.agentId)?.payload.agentId || null;
  const offline = agentId && options.offlineAgents?.has(agentId);
  const stages = TRACE_STAGES.map((name) => stageEvents.get(name) || {
    name,
    status: offline ? 'UNKNOWN' : 'PENDING',
    timestamp: null,
    durationMs: null,
    txId: null,
    cid: null,
    error: offline ? 'AGENT_OFFLINE_UNKNOWN' : null,
  });
  stages.push(...unknownStages);
  const terminal = [...runEvents].reverse().find((event) => [
    'AGENT_EXECUTION_COMPLETED', 'AGENT_EXECUTION_FAILED', 'VCAP_VERIFIED',
    'VCAP_MISMATCH', 'VCAP_VERIFICATION_FAILED',
  ].includes(event.eventType));
  const stageTimestamp = stageEvents.size ? [...stageEvents.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0].timestamp : null;
  const runStatus = terminal?.payload?.status === 'UNKNOWN'
    ? 'UNKNOWN'
    : terminal?.eventType === 'AGENT_EXECUTION_COMPLETED' || terminal?.eventType === 'VCAP_VERIFIED'
    ? 'DONE'
    : terminal?.eventType === 'AGENT_EXECUTION_FAILED' || ['VCAP_MISMATCH', 'VCAP_VERIFICATION_FAILED'].includes(terminal?.eventType)
      ? 'FAILED'
      : offline && !terminal ? 'UNKNOWN' : runEvents.length ? 'PENDING' : 'NO_DATA';
  return {
    runId,
    agentId,
    status: runStatus,
    startedAt: runEvents.find((event) => event.eventType === 'AGENT_EXECUTION_STARTED')?.timestamp || runEvents[0]?.timestamp || null,
    updatedAt: lastEvent?.timestamp || stageTimestamp,
    txIds: [...new Set(runEvents.map((event) => event.txId).filter(Boolean))],
    mock: runEvents.some((event) => event.mock === true),
    cids: [...new Set(runEvents.map((event) => event.payload?.cid).filter(Boolean))],
    stages,
    statusInfo: runEvents.length
      ? { state: 'OK', reason: null, since: runEvents[0].timestamp }
      : { state: 'NO_DATA', reason: 'No events were found for this execution.', since: null },
  };
}

function groupExecutions(events, options = {}) {
  const ids = new Map();
  for (const event of events) {
    if (!event.correlationId || !event.payload?.agentId) continue;
    const current = ids.get(event.correlationId) || [];
    current.push(event);
    ids.set(event.correlationId, current);
  }
  return [...ids.entries()].map(([runId, runEvents]) => stitchTrace(runId, runEvents, options))
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0) || a.runId.localeCompare(b.runId));
}

module.exports = { groupExecutions, stitchTrace };
