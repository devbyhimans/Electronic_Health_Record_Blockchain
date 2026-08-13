'use strict';

const crypto = require('crypto');

function getIpfsConfig() {
  return {
    apiUrl: (process.env.IPFS_API_URL || 'http://10.166.46.138:5001').replace(/\/$/, ''),
    gatewayUrl: (process.env.IPFS_GATEWAY_URL || 'http://10.166.46.138:8080').replace(/\/$/, ''),
  };
}

function buildGatewayUrl(cid) {
  const { gatewayUrl } = getIpfsConfig();
  return `${gatewayUrl}/ipfs/${cid}`;
}

async function callIpfsApi(endpoint, options = {}) {
  const { apiUrl } = getIpfsConfig();
  const response = await fetch(`${apiUrl}${endpoint}`, {
    method: 'POST',
    ...options,
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`IPFS API ${endpoint} failed (${response.status}): ${text || response.statusText}`);
  }

  return text;
}

function parseIpfsAddResponse(rawText) {
  const lines = rawText
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('IPFS add returned an empty response');
  }

  const parsed = JSON.parse(lines[lines.length - 1]);
  if (!parsed.Hash) {
    throw new Error('IPFS add response does not contain a CID hash');
  }

  return parsed;
}

async function addJsonToIpfs(payload, options = {}) {
  const fileName = options.fileName || 'payload.json';
  const pin = options.pin !== false;
  const jsonText = typeof payload === 'string' ? payload : JSON.stringify(payload);

  const formData = new FormData();
  formData.append('file', new Blob([jsonText], { type: 'application/json' }), fileName);

  const addText = await callIpfsApi(
    `/api/v0/add?pin=${pin ? 'true' : 'false'}&cid-version=1&raw-leaves=true`,
    { body: formData }
  );

  const addInfo = parseIpfsAddResponse(addText);
  const digest = crypto.createHash('sha256').update(jsonText).digest('hex');

  return {
    cid: addInfo.Hash,
    name: addInfo.Name || fileName,
    size: Number(addInfo.Size || Buffer.byteLength(jsonText, 'utf8')),
    digest,
    gatewayUrl: buildGatewayUrl(addInfo.Hash),
  };
}

async function addBinaryToIpfs(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('binary file buffer is required');
  }

  const fileName = options.fileName || 'payload.bin';
  const pin = options.pin !== false;
  const contentType = options.contentType || 'application/octet-stream';

  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: contentType }), fileName);

  const addText = await callIpfsApi(
    `/api/v0/add?pin=${pin ? 'true' : 'false'}&cid-version=1&raw-leaves=true`,
    { body: formData }
  );

  const addInfo = parseIpfsAddResponse(addText);
  const digest = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    cid: addInfo.Hash,
    name: addInfo.Name || fileName,
    size: Number(addInfo.Size || buffer.byteLength),
    digest,
    contentType,
    gatewayUrl: buildGatewayUrl(addInfo.Hash),
  };
}

async function readJsonFromIpfs(cid) {
  if (!cid) {
    throw new Error('cid is required');
  }

  const catText = await callIpfsApi(`/api/v0/cat?arg=${encodeURIComponent(cid)}`);

  try {
    return {
      cid,
      data: JSON.parse(catText),
      gatewayUrl: buildGatewayUrl(cid),
    };
  } catch (_error) {
    return {
      cid,
      data: catText,
      gatewayUrl: buildGatewayUrl(cid),
    };
  }
}

async function ipfsHealth() {
  try {
    const versionText = await callIpfsApi('/api/v0/version');
    const version = JSON.parse(versionText);

    return {
      ok: true,
      version,
      ...getIpfsConfig(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      ...getIpfsConfig(),
    };
  }
}

module.exports = {
  addBinaryToIpfs,
  addJsonToIpfs,
  getIpfsConfig,
  ipfsHealth,
  readJsonFromIpfs,
};
