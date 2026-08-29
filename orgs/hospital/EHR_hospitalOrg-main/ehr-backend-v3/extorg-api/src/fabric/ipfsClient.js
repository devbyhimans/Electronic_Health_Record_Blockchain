'use strict';

/**
 * ipfsClient.js — Thin client for ipfs-service (port 3006)
 *
 * IPFS write pattern used by every route:
 *   1. Get current visitCID / ehrCID from blockchain
 *   2. fetchByCID(cid)          → get current JSON from IPFS
 *   3. Modify JSON in memory
 *   4. pinJSON(updatedJson)     → pin to IPFS → newCID
 *   5. submitTransaction(..., newCID) → store newCID on chain
 */

const axios  = require('axios');
const logger = require('../config/logger');

const BASE = process.env.IPFS_SERVICE_URL || 'http://localhost:3006';
const KEY  = process.env.IPFS_SERVICE_KEY || '';

const client = axios.create({
  baseURL: BASE,
  timeout: 30000,
  headers: { 'X-IPFS-Key': KEY },
});

async function fetchByCID(cid) {
  const res = await client.get(`/fetch/${cid}`);
  return res.data.data;
}

async function pinJSON(json, filename) {
  const res = await client.post('/pin', { json, filename });
  return res.data.cid;
}

async function initVisit(visitId, patientId, chiefComplaint, openedBy) {
  const res = await client.post('/visit/init', { visitId, patientId, chiefComplaint, openedBy });
  return { cid: res.data.cid, visit: res.data.visit };
}

async function initEHR(patientId, demographics) {
  const res = await client.post('/ehr/init', { patientId, demographics });
  return { cid: res.data.cid, ehr: res.data.ehr };
}

module.exports = { fetchByCID, pinJSON, initVisit, initEHR };
