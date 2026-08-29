'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const CCP_PATH = path.join(ROOT_DIR, 'connection-profiles', 'lab-connection.json');
const USER_MSP_DIR = path.join(
  ROOT_DIR,
  'organizations',
  'peerOrganizations',
  'lab.example.com',
  'users',
  'User1@lab.example.com',
  'msp'
);

function loadConnectionProfile() {
  return JSON.parse(fs.readFileSync(CCP_PATH, 'utf8'));
}

function listGatewayPeers() {
  const profile = loadConnectionProfile();
  return Object.keys(profile.peers || {});
}

function resolvePeerName(peerName) {
  if (peerName && typeof peerName === 'string') {
    return peerName;
  }

  return process.env.GATEWAY_PEER || 'peer0.lab.example.com';
}

function newGrpcConnection(peerName, connectionProfile) {
  const peer = connectionProfile.peers[peerName];
  if (!peer) {
    throw new Error(`Peer ${peerName} not found in ${CCP_PATH}`);
  }

  const endpoint = new URL(peer.url);
  const tlsRootCert = Buffer.from(peer.tlsCACerts.pem);
  const credentials = grpc.credentials.createSsl(tlsRootCert);

  return new grpc.Client(
    endpoint.host,
    credentials,
    {
      'grpc.ssl_target_name_override': endpoint.hostname,
      'grpc.default_authority': endpoint.hostname,
    }
  );
}

function newIdentity() {
  const certPath = path.join(USER_MSP_DIR, 'signcerts', 'User1@lab.example.com-cert.pem');
  return {
    mspId: 'LabMSP',
    credentials: fs.readFileSync(certPath),
  };
}

function newSigner() {
  const keyDir = path.join(USER_MSP_DIR, 'keystore');
  const keyFile = fs.readdirSync(keyDir)[0];
  const privateKeyPem = fs.readFileSync(path.join(keyDir, keyFile));
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  return signers.newPrivateKeySigner(privateKey);
}

function decodeResult(result) {
  return Buffer.from(result).toString('utf8');
}

function parseResult(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

async function withContract(peerName, callback) {
  const selectedPeer = resolvePeerName(peerName);
  const connectionProfile = loadConnectionProfile();
  const client = newGrpcConnection(selectedPeer, connectionProfile);

  const gateway = connect({
    client,
    identity: newIdentity(),
    signer: newSigner(),
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15000 }),
    submitOptions: () => ({ deadline: Date.now() + 15000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
  });

  try {
    const network = gateway.getNetwork('ehrchannel');
    const contract = network.getContract('labresults');
    return await callback(contract, selectedPeer);
  } finally {
    gateway.close();
    client.close();
  }
}

async function evaluateTransaction(peerName, functionName, args = []) {
  return withContract(peerName, async (contract, selectedPeer) => {
    const response = await contract.evaluateTransaction(functionName, ...args);
    return {
      peer: selectedPeer,
      result: parseResult(decodeResult(response)),
    };
  });
}

async function submitTransaction(peerName, functionName, args = []) {
  return withContract(peerName, async (contract, selectedPeer) => {
    const response = await contract.submitTransaction(functionName, ...args);
    return {
      peer: selectedPeer,
      result: parseResult(decodeResult(response)),
    };
  });
}

async function getAllLabResults(options = {}) {
  return evaluateTransaction(options.peerName, 'GetAllLabResults');
}

async function readLabResult(resultId, options = {}) {
  if (!resultId) {
    throw new Error('resultId is required');
  }
  return evaluateTransaction(options.peerName, 'ReadLabResult', [resultId]);
}

async function getLabResultsByPatient(patientId, options = {}) {
  if (!patientId) {
    throw new Error('patientId is required');
  }
  return evaluateTransaction(options.peerName, 'GetLabResultsByPatient', [patientId]);
}

async function createLabResult(input, options = {}) {
  const {
    resultId,
    patientId,
    testCode,
    collectedAt,
    status,
    resultData,
  } = input || {};

  if (!resultId || !patientId || !testCode || !collectedAt || !status) {
    throw new Error('resultId, patientId, testCode, collectedAt, and status are required');
  }

  const resultDataJson = typeof resultData === 'string'
    ? resultData
    : JSON.stringify(resultData || {});

  return submitTransaction(options.peerName, 'CreateLabResult', [
    resultId,
    patientId,
    testCode,
    collectedAt,
    status,
    resultDataJson,
  ]);
}

async function updateLabStatus(resultId, status, options = {}) {
  if (!resultId || !status) {
    throw new Error('resultId and status are required');
  }

  return submitTransaction(options.peerName, 'UpdateLabStatus', [resultId, status]);
}

module.exports = {
  createLabResult,
  getAllLabResults,
  getLabResultsByPatient,
  listGatewayPeers,
  readLabResult,
  updateLabStatus,
};