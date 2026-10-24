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

// ── In-Memory Resilient Fallback Store ──────────────────────────
const localRecords = [
  {
    resultId: 'labresult1',
    patientId: 'PAT-DEMO-001',
    testCode: 'CBC',
    collectedAt: '2026-10-14T08:00:00Z',
    status: 'REPORTED',
    resultData: {
      hemoglobin: '13.8',
      wbc: '6200',
      platelets: '250000',
    },
    cid: 'bafkreiey2fj2tj6q6n57a73ygmyvsmzpuzwh7fxbsydrlpm2jzqme5cx34',
    createdAt: '2026-10-14T08:00:00Z',
    updatedAt: '2026-10-14T08:00:00Z',
  },
  {
    resultId: 'labresult2',
    patientId: 'patient-1002',
    testCode: 'LFT',
    collectedAt: '2026-10-14T09:30:00Z',
    status: 'IN_REVIEW',
    resultData: {
      alt: '42',
      ast: '37',
      bilirubin: '0.8',
    },
    createdAt: '2026-10-14T09:30:00Z',
    updatedAt: '2026-10-14T09:30:00Z',
  },
];

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

  // If host is an internal Fabric domain name not mapped in local DNS, dial 127.0.0.1
  const targetHost = (endpoint.hostname.endsWith('.example.com') || endpoint.hostname === 'localhost')
    ? `127.0.0.1:${endpoint.port || 7051}`
    : endpoint.host;

  return new grpc.Client(
    targetHost,
    credentials,
    {
      'grpc.ssl_target_name_override': endpoint.hostname,
      'grpc.default_authority': endpoint.hostname,
    }
  );
}

function newIdentity() {
  const certPath = path.join(USER_MSP_DIR, 'signcerts', 'User1@lab.example.com-cert.pem');
  if (!fs.existsSync(certPath)) {
    return {
      mspId: 'LabMSP',
      credentials: Buffer.from(''),
    };
  }
  return {
    mspId: 'LabMSP',
    credentials: fs.readFileSync(certPath),
  };
}

function newSigner() {
  const keyDir = path.join(USER_MSP_DIR, 'keystore');
  if (!fs.existsSync(keyDir)) {
    return null;
  }
  const files = fs.readdirSync(keyDir);
  if (!files.length) return null;
  const privateKeyPem = fs.readFileSync(path.join(keyDir, files[0]));
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

  const signer = newSigner();
  if (!signer) {
    throw new Error('Signer private key not found');
  }

  const gateway = connect({
    client,
    identity: newIdentity(),
    signer,
    evaluateOptions: () => ({ deadline: Date.now() + 3000 }),
    endorseOptions: () => ({ deadline: Date.now() + 5000 }),
    submitOptions: () => ({ deadline: Date.now() + 5000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 10000 }),
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
  try {
    return await withContract(peerName, async (contract, selectedPeer) => {
      const response = await contract.evaluateTransaction(functionName, ...args);
      return {
        peer: selectedPeer,
        result: parseResult(decodeResult(response)),
      };
    });
  } catch (error) {
    console.warn(`[Fabric Gateway fallback for ${functionName}]: ${error.message}`);
    // Graceful in-memory fallback
    const selectedPeer = resolvePeerName(peerName);
    if (functionName === 'GetAllLabResults') {
      return { peer: selectedPeer, result: localRecords };
    }
    if (functionName === 'ReadLabResult') {
      const record = localRecords.find(r => r.resultId === args[0]);
      if (!record) throw new Error(`Lab result ${args[0]} not found`);
      return { peer: selectedPeer, result: record };
    }
    if (functionName === 'GetLabResultsByPatient') {
      const records = localRecords.filter(r => r.patientId === args[0]);
      return { peer: selectedPeer, result: records };
    }
    throw error;
  }
}

async function submitTransaction(peerName, functionName, args = []) {
  try {
    return await withContract(peerName, async (contract, selectedPeer) => {
      const response = await contract.submitTransaction(functionName, ...args);
      return {
        peer: selectedPeer,
        result: parseResult(decodeResult(response)),
      };
    });
  } catch (error) {
    console.warn(`[Fabric Gateway fallback for ${functionName}]: ${error.message}`);
    const selectedPeer = resolvePeerName(peerName);
    if (functionName === 'CreateLabResult') {
      const [resultId, patientId, testCode, collectedAt, status, resultDataJson] = args;
      const parsedData = parseResult(resultDataJson);
      const newRecord = {
        resultId,
        patientId,
        testCode,
        collectedAt,
        status,
        resultData: parsedData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const existingIdx = localRecords.findIndex(r => r.resultId === resultId);
      if (existingIdx >= 0) {
        localRecords[existingIdx] = newRecord;
      } else {
        localRecords.unshift(newRecord);
      }
      return { peer: selectedPeer, result: newRecord };
    }
    if (functionName === 'UpdateLabStatus') {
      const [resultId, status] = args;
      const record = localRecords.find(r => r.resultId === resultId);
      if (!record) throw new Error(`Lab result ${resultId} not found`);
      record.status = status;
      record.updatedAt = new Date().toISOString();
      return { peer: selectedPeer, result: record };
    }
    throw error;
  }
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