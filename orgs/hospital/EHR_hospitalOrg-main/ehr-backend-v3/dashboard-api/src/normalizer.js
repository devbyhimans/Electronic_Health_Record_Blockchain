'use strict';

const crypto = require('node:crypto');
const { common, msp, peer } = require('@hyperledger/fabric-protos');
const { validateEventEnvelope } = require('./contracts/envelope');

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;

function stableEventId(channel, txId, eventType) {
  const digest = crypto.createHash('sha256').update(`${channel}\u0000${txId}\u0000${eventType}`).digest('hex');
  return `fabric-${digest}`;
}

function validationOutcome(validationCode) {
  if (validationCode === peer.TxValidationCode.VALID) {
    return { eventType: 'TRANSACTION_COMMITTED', severity: 'INFO', reasonCode: 'VALID' };
  }
  if (validationCode === peer.TxValidationCode.MVCC_READ_CONFLICT) {
    return { eventType: 'MVCC_CONFLICT', severity: 'WARNING', reasonCode: 'MVCC_READ_CONFLICT' };
  }
  if (validationCode === peer.TxValidationCode.ENDORSEMENT_POLICY_FAILURE) {
    return { eventType: 'ENDORSEMENT_FAILED', severity: 'ERROR', reasonCode: 'ENDORSEMENT_POLICY_FAILURE' };
  }
  return { eventType: 'TRANSACTION_FAILED', severity: 'ERROR', reasonCode: `VALIDATION_${validationCode}` };
}

function blockTimestampToIso(timestamp) {
  if (!timestamp || typeof timestamp.getSeconds !== 'function') throw new Error('Fabric transaction timestamp is missing');
  const seconds = BigInt(timestamp.getSeconds().toString());
  const nanos = Number(timestamp.getNanos() || 0);
  const milliseconds = Number(seconds * 1000n) + Math.floor(nanos / 1e6);
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) throw new Error('Fabric transaction timestamp is invalid');
  return date.toISOString();
}

function decodeInvocation(txPayload, headerType) {
  if (headerType !== common.HeaderType.ENDORSER_TRANSACTION) {
    const typeName = Object.keys(common.HeaderType).find((name) => common.HeaderType[name] === headerType) || 'UNKNOWN_SYSTEM_TX';
    return { chaincode: 'SYSTEM', functionName: typeName };
  }
  try {
  const transaction = peer.Transaction.deserializeBinary(txPayload);
  const action = transaction.getActionsList()[0];
  if (!action) return { chaincode: 'SYSTEM', functionName: 'UNKNOWN_FUNCTION' };
  const actionPayload = peer.ChaincodeActionPayload.deserializeBinary(action.getPayload_asU8());
  const endorsedAction = actionPayload.getAction();
  const responsePayload = peer.ProposalResponsePayload.deserializeBinary(endorsedAction.getProposalResponsePayload_asU8());
  const chaincodeAction = peer.ChaincodeAction.deserializeBinary(responsePayload.getExtension_asU8());

  let chaincode = chaincodeAction.getChaincodeId()?.getName() || '';
  let functionName = '';
  try {
    const proposal = peer.ChaincodeProposalPayload.deserializeBinary(actionPayload.getChaincodeProposalPayload_asU8());
    const invocation = peer.ChaincodeInvocationSpec.deserializeBinary(proposal.getInput_asU8());
    const chaincodeSpec = invocation.getChaincodeSpec();
    chaincode = chaincode || chaincodeSpec.getChaincodeId()?.getName() || '';
    // Only read argument 0, which Fabric defines as the function name. Never inspect or persist later arguments.
    const firstArgument = chaincodeSpec.getInput()?.getArgsList_asU8()?.[0];
    if (firstArgument) functionName = Buffer.from(firstArgument).toString('utf8');
  } catch {
    // The action's chaincode ID remains useful even if an older proposal payload cannot be decoded.
  }
  return {
    chaincode: SAFE_NAME.test(chaincode) ? chaincode : 'UNKNOWN_CHAINCODE',
    functionName: SAFE_NAME.test(functionName) ? functionName : 'UNKNOWN_FUNCTION',
  };
  } catch {
    return { chaincode: 'UNKNOWN_CHAINCODE', functionName: 'UNKNOWN_FUNCTION' };
  }
}

function normalizeFabricBlock(block, options = {}) {
  if (!block || typeof block.getHeader !== 'function' || typeof block.getData !== 'function') {
    throw new TypeError('Expected a Fabric common.Block message');
  }
  const header = block.getHeader();
  const blockNumber = Number(header.getNumber());
  if (!Number.isSafeInteger(blockNumber) || blockNumber < 0) throw new Error('Fabric block number is invalid');
  const envelopes = block.getData().getDataList_asU8();
  const metadata = block.getMetadata()?.getMetadataList_asU8() || [];
  const validationCodes = metadata[common.BlockMetadataIndex.TRANSACTIONS_FILTER] || new Uint8Array();
  const output = [];

  for (let index = 0; index < envelopes.length; index += 1) {
    try {
      const envelope = common.Envelope.deserializeBinary(envelopes[index]);
      const payload = common.Payload.deserializeBinary(envelope.getPayload_asU8());
      const payloadHeader = payload.getHeader();
      const channelHeader = common.ChannelHeader.deserializeBinary(payloadHeader.getChannelHeader_asU8());
      const channel = channelHeader.getChannelId();
      const txId = channelHeader.getTxId();
      if (options.channel && channel !== options.channel) continue;
      if (!txId || !SAFE_NAME.test(txId)) continue;

      const signatureHeader = common.SignatureHeader.deserializeBinary(payloadHeader.getSignatureHeader_asU8());
      const creator = msp.SerializedIdentity.deserializeBinary(signatureHeader.getCreator_asU8());
      const creatorMsp = creator.getMspid();
      if (!new Set(options.organizations || []).has(creatorMsp)) continue;
      const timestamp = blockTimestampToIso(channelHeader.getTimestamp());
      const validationCode = validationCodes[index] === undefined ? peer.TxValidationCode.NOT_VALIDATED : validationCodes[index];
      const outcome = validationOutcome(validationCode);
      const invocation = decodeInvocation(payload.getData_asU8(), channelHeader.getType());
      const event = {
        schemaVersion: 1,
        eventId: stableEventId(channel, txId, outcome.eventType),
        eventType: outcome.eventType,
        timestamp,
        source: 'fabric-block-listener',
        org: creatorMsp,
        severity: outcome.severity,
        channel,
        txId,
        blockNumber,
        payload: {
          chaincode: invocation.chaincode,
          functionName: invocation.functionName,
          creatorMsp,
          validationCode,
          reasonCode: outcome.reasonCode,
        },
      };
      const validation = validateEventEnvelope(event);
      if (validation.valid) output.push(event);
    } catch {
      // A malformed envelope is skipped without logging its bytes or any transaction payload.
    }
  }
  return output;
}

function normalizeHealthTransition(target, status, options = {}) {
  if (!['UP', 'DOWN'].includes(status)) throw new TypeError('Health state must be UP or DOWN');
  const eventType = status === 'DOWN' && target.downEventType ? target.downEventType : target.eventType;
  const event = {
    schemaVersion: 1,
    eventId: options.eventId || `health-${crypto.randomUUID()}`,
    eventType,
    timestamp: (options.now || new Date()).toISOString(),
    source: 'health-poller',
    org: target.org,
    severity: status === 'DOWN' ? 'ERROR' : 'INFO',
    ...(target.peerId ? { peerId: target.peerId } : {}),
    payload: {
      component: target.component,
      status,
      reasonCode: options.reasonCode || (status === 'UP' ? 'HTTP_HEALTHY' : 'HTTP_UNAVAILABLE'),
      ...(Number.isFinite(options.latencyMs) ? { latencyMs: Math.max(0, Math.round(options.latencyMs)) } : {}),
      ...(target.agentId ? { agentId: target.agentId } : {}),
    },
  };
  const validation = validateEventEnvelope(event, { organizations: options.organizations });
  if (!validation.valid) throw new Error(`Health event normalization failed: ${validation.error}`);
  return event;
}

module.exports = {
  blockTimestampToIso,
  normalizeFabricBlock,
  normalizeHealthTransition,
  stableEventId,
  validationOutcome,
};
