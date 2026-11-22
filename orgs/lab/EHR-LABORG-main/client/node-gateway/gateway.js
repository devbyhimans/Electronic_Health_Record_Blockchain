'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');

function resolveCcpPath() {
  const candidates = [
    process.env.CONNECTION_PROFILE_PATH,
    path.join(__dirname, 'lab-connection.json'),
    path.resolve(__dirname, '..', '..', 'connection-profiles', 'lab-connection.json'),
    path.resolve('/connection-profiles/lab-connection.json'),
    path.resolve('/app/connection-profiles/lab-connection.json'),
    path.join(__dirname, 'connection-profiles', 'lab-connection.json'),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(__dirname, 'lab-connection.json');
}

function resolveUserMspDir() {
  const candidates = [
    process.env.LAB_IDENTITY_MSP_DIR,
    process.env.USER_MSP_DIR,
    path.resolve(__dirname, '..', '..', 'organizations', 'peerOrganizations', 'lab.example.com', 'users', 'User1@lab.example.com', 'msp'),
    path.resolve('/ehr-network/organizations/peerOrganizations/diagnostic.example.com/users/labtechnician/msp'),
    path.resolve('/organizations/peerOrganizations/lab.example.com/users/User1@lab.example.com/msp'),
    path.resolve('/app/organizations/peerOrganizations/lab.example.com/users/User1@lab.example.com/msp'),
    path.join(__dirname, 'organizations', 'peerOrganizations', 'lab.example.com', 'users', 'User1@lab.example.com', 'msp'),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.resolve(__dirname, '..', '..', 'organizations', 'peerOrganizations', 'lab.example.com', 'users', 'User1@lab.example.com', 'msp');
}

const CCP_PATH = resolveCcpPath();
const USER_MSP_DIR = resolveUserMspDir();

// Defaults target the standalone Lab network (LabMSP). In the unified stack these
// point the gateway at the shared ehrchannel as DiagnosticsMSP instead.
const MSP_ID = process.env.LAB_MSP_ID || 'LabMSP';
const CHANNEL_NAME = process.env.LAB_CHANNEL || 'ehrchannel';
const CHAINCODE_NAME = process.env.LAB_CHAINCODE || 'labresults';
const PEER_ENDPOINT = process.env.LAB_PEER_ENDPOINT;
const PEER_TLS_CA = process.env.LAB_PEER_TLS_CA;

const FALLBACK_PROFILE = {
  name: 'lab-ehr-network',
  version: '1.0.0',
  client: { organization: 'LabMSP' },
  channels: {
    ehrchannel: {
      peers: {
        'peer0.diagnostic.example.com': {},
        'peer0.lab.example.com': {},
        'peer1.lab.example.com': {},
        'peer2.lab.example.com': {},
      },
    },
  },
  peers: {
    'peer0.diagnostic.example.com': { url: 'grpcs://peer0.diagnostic.example.com:8051' },
    'peer0.lab.example.com': { url: 'grpcs://peer0.lab.example.com:7051' },
    'peer1.lab.example.com': { url: 'grpcs://peer1.lab.example.com:7051' },
    'peer2.lab.example.com': { url: 'grpcs://peer2.lab.example.com:7051' },
  },
};

function loadConnectionProfile() {
  if (PEER_ENDPOINT && PEER_TLS_CA && fs.existsSync(PEER_TLS_CA)) {
    return {
      peers: {
        [resolvePeerName()]: {
          url: `grpcs://${PEER_ENDPOINT}`,
          tlsCACerts: { pem: fs.readFileSync(PEER_TLS_CA, 'utf8') },
        },
      },
    };
  }
  const activePath = resolveCcpPath();
  if (fs.existsSync(activePath)) {
    try {
      return JSON.parse(fs.readFileSync(activePath, 'utf8'));
    } catch (err) {
      console.warn(`[loadConnectionProfile parse error from ${activePath}]: ${err.message}`);
    }
  }
  return FALLBACK_PROFILE;
}

function getLedgerConfig() {
  return {
    defaultPeer: resolvePeerName(),
    channel: CHANNEL_NAME,
    chaincode: CHAINCODE_NAME,
    mspId: MSP_ID,
  };
}

function listGatewayPeers() {
  try {
    const profile = loadConnectionProfile();
    const peers = Object.keys(profile.peers || {});
    if (peers.length > 0) return peers;
  } catch (err) {
    console.warn(`[listGatewayPeers]: ${err.message}`);
  }
  return ['peer0.diagnostic.example.com', 'peer0.lab.example.com', 'peer1.lab.example.com', 'peer2.lab.example.com'];
}

function resolvePeerName(peerName) {
  if (peerName && typeof peerName === 'string') {
    return peerName;
  }

  if (process.env.GATEWAY_PEER) {
    return process.env.GATEWAY_PEER;
  }
  return PEER_ENDPOINT ? PEER_ENDPOINT.split(':')[0] : 'peer0.lab.example.com';
}

function newGrpcConnection(peerName, connectionProfile) {
  const peer = (connectionProfile.peers && connectionProfile.peers[peerName]) || {
    url: `grpcs://${peerName}:7051`,
  };

  const endpoint = new URL(peer.url);
  const tlsRootCert = peer.tlsCACerts?.pem ? Buffer.from(peer.tlsCACerts.pem) : Buffer.from('');
  const credentials = tlsRootCert.length > 0 ? grpc.credentials.createSsl(tlsRootCert) : grpc.credentials.createInsecure();

  // If host is an internal Fabric domain name not mapped in local DNS, dial 127.0.0.1.
  // Inside Docker on ehr_network the peer hostname resolves, so dial it directly.
  const dialByName = PEER_ENDPOINT && process.env.LAB_PEER_DIAL_LOCALHOST !== 'true';
  const targetHost = process.env.FABRIC_TARGET_HOST || (!dialByName && (endpoint.hostname.endsWith('.example.com') || endpoint.hostname === 'localhost')
    ? `127.0.0.1:${endpoint.port || 7051}`
    : endpoint.host);

  return new grpc.Client(
    targetHost,
    credentials,
    {
      'grpc.ssl_target_name_override': endpoint.hostname,
      'grpc.default_authority': endpoint.hostname,
    }
  );
}

function findSignCert() {
  const signDir = path.join(USER_MSP_DIR, 'signcerts');
  if (!fs.existsSync(signDir)) {
    return null;
  }
  // cryptogen names it User1@lab.example.com-cert.pem, Fabric CA names it cert.pem.
  const file = fs.readdirSync(signDir).find((name) => name.endsWith('.pem'));
  return file ? path.join(signDir, file) : null;
}

function newIdentity() {
  const certPath = findSignCert();
  if (!certPath) {
    return {
      mspId: MSP_ID,
      credentials: Buffer.from(''),
    };
  }
  return {
    mspId: MSP_ID,
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
    const network = gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME);
    return await callback(contract, selectedPeer);
  } finally {
    gateway.close();
    client.close();
  }
}

// A ledger failure is reported to the caller. There is no local substitute
// store: a lab record that is not on the ledger does not exist.
async function evaluateTransaction(peerName, functionName, args = []) {
  return withContract(peerName, async (contract, selectedPeer) => {
    const response = await contract.evaluateTransaction(functionName, ...args);
    return { peer: selectedPeer, result: parseResult(decodeResult(response)) };
  });
}

async function submitTransaction(peerName, functionName, args = []) {
  return withContract(peerName, async (contract, selectedPeer) => {
    const response = await contract.submitTransaction(functionName, ...args);
    return { peer: selectedPeer, result: parseResult(decodeResult(response)) };
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
  try {
    return await evaluateTransaction(options.peerName, 'GetLabResultsByPatient', [patientId]);
  } catch (error) {
    if (error && error.message && error.message.includes('ExecuteQuery')) {
      const all = await getAllLabResults(options);
      const list = Array.isArray(all.result)
        ? all.result.filter((r) => r && r.patientId === patientId)
        : [];
      return { peer: all.peer, result: list };
    }
    throw error;
  }
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

async function updateLabResult(record, options = {}) {
  const { resultId, patientId, testCode, collectedAt, status, resultData } = record || {};
  if (!resultId) {
    throw new Error('resultId is required');
  }

  return submitTransaction(options.peerName, 'UpdateLabResult', [
    resultId,
    patientId,
    testCode,
    collectedAt,
    status,
    typeof resultData === 'string' ? resultData : JSON.stringify(resultData || {}),
  ]);
}

module.exports = {
  createLabResult,
  getLedgerConfig,
  getAllLabResults,
  getLabResultsByPatient,
  listGatewayPeers,
  readLabResult,
  updateLabResult,
  updateLabStatus,
};