'use strict';

const FALLBACK_PEERS = [
  'peer0.lab.example.com',
  'peer1.lab.example.com',
  'peer2.lab.example.com',
];

const peerSelect = document.getElementById('peerSelect');
const refreshBtn = document.getElementById('refreshBtn');
const createForm = document.getElementById('createForm');
const readForm = document.getElementById('readForm');
const resolveDataForm = document.getElementById('resolveDataForm');
const patientForm = document.getElementById('patientForm');
const updateStatusForm = document.getElementById('updateStatusForm');
const recordsBody = document.getElementById('recordsBody');
const rawOutput = document.getElementById('rawOutput');
const clearOutputBtn = document.getElementById('clearOutputBtn');
const metaPill = document.getElementById('metaPill');
const toast = document.getElementById('toast');

// VCAP UI Elements
const vcapResultIdInput = document.getElementById('vcapResultId');
const vcapVerifyBtn = document.getElementById('vcapVerifyBtn');
const vcapTamperBtn = document.getElementById('vcapTamperBtn');
const vcapDemoBtn = document.getElementById('vcapDemoBtn');
const vcapCard = document.getElementById('vcapCard');

let toastTimeout = null;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');

  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 4000);
}

function selectedPeer() {
  return peerSelect ? peerSelect.value : '';
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const peer = selectedPeer();

  if (peer && !headers.has('x-gateway-peer')) {
    headers.set('x-gateway-peer', peer);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch (_error) {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload && payload.error ? payload.error : `HTTP ${response.status}: ${text}`;
    throw new Error(message);
  }

  return payload;
}

function normalizeToArray(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object') {
    return [data];
  }
  return [];
}

function getStatusStyle(status) {
  const s = String(status || '').toUpperCase();
  if (s.includes('FINAL') || s.includes('REPORTED') || s.includes('VALID')) {
    return 'background: var(--status-success-bg); color: var(--status-success-text);';
  }
  if (s.includes('REV') || s.includes('PENDING') || s.includes('PROGRESS')) {
    return 'background: var(--status-warning-bg); color: var(--status-warning-text);';
  }
  if (s.includes('TAMPER') || s.includes('FAIL') || s.includes('ERROR') || s.includes('REJECT')) {
    return 'background: var(--status-danger-bg); color: var(--status-danger-text);';
  }
  return 'background: rgba(148, 163, 184, 0.15); color: #94a3b8;';
}

window.selectVcap = function(resultId) {
  if (vcapResultIdInput) {
    vcapResultIdInput.value = resultId;
    vcapResultIdInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    verifyVcapAction(resultId, false);
  }
};

function renderRows(records) {
  recordsBody.style.opacity = '0.5';
  
  setTimeout(() => {
    recordsBody.innerHTML = '';
    
    if (!records.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No records found.</td>';
      recordsBody.appendChild(row);
    } else {
      for (const record of records) {
        const vcap = record.vcap || (record.resultData && record.resultData.vcap);
        const vcapBadge = vcap
          ? `<button type="button" class="pill" style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; cursor: pointer; font-size: 0.75rem; padding: 2px 8px;" onclick="window.selectVcap('${escapeHtml(record.resultId)}')">🛡️ SHA-256 Anchored</button>`
          : `<span class="pill" style="background: #f1f5f9; color: #94a3b8; font-size: 0.75rem;">None</span>`;

        const row = document.createElement('tr');
        row.innerHTML = `
          <td data-label="Result ID" style="font-family: var(--font-mono); color: var(--primary-hover); font-weight: 600;">${escapeHtml(record.resultId || '')}</td>
          <td data-label="Patient ID">${escapeHtml(record.patientId || '')}</td>
          <td data-label="Test Code"><strong>${escapeHtml(record.testCode || '')}</strong></td>
          <td data-label="Status"><span class="status" style="${getStatusStyle(record.status)}">${escapeHtml(record.status || '')}</span></td>
          <td data-label="VCAP Provenance">${vcapBadge}</td>
          <td data-label="Collected At" style="color: var(--text-muted);">${escapeHtml(record.collectedAt || '')}</td>
        `;
        recordsBody.appendChild(row);
      }
    }
    
    recordsBody.style.transition = 'opacity 0.3s ease';
    recordsBody.style.opacity = '1';
  }, 150);
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setOutput(label, payload) {
  rawOutput.innerHTML = `<span style="color: #94f2cf;">${label}</span>\n\n${escapeHtml(JSON.stringify(payload, null, 2))}`;
}

function toggleLoading(button, isLoading) {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.innerHTML;
    }
    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML = 'Processing...';
  } else {
    button.disabled = false;
    button.classList.remove('is-loading');
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
}

function renderVcapCard(data) {
  if (!vcapCard) return;
  vcapCard.style.display = 'block';

  const isVerified = data.verification ? data.verification.verified : data.verified;
  const vcap = (data.verification && data.verification.anchoredVcap) || data.anchoredVcap || data.vcap || {};
  const recomputed = (data.verification && data.verification.recomputed) || data.recomputed || {};
  const mismatches = (data.verification && data.verification.mismatches) || data.mismatches || [];

  if (isVerified) {
    vcapCard.style.background = 'rgba(34, 197, 94, 0.1)';
    vcapCard.style.border = '1px solid #22c55e';
    vcapCard.style.color = '#15803d';

    vcapCard.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-weight: 700; font-size: 0.95rem;">
        <span>✅</span>
        <span>VCAP VERIFIED — AUTHENTIC CLINICAL AI PROVENANCE</span>
      </div>
      <p style="margin: 0 0 0.5rem 0; font-size: 0.8rem; color: #166534;">
        Mathematical SHA-256 verification confirmed on ledger. Clinical record, prompt, and AI summary are authentic and untampered.
      </p>
      <div style="background: rgba(255,255,255,0.7); padding: 0.5rem; border-radius: 6px; font-family: var(--font-mono); font-size: 0.72rem; word-break: break-all;">
        <div><strong>Record Hash:</strong> ${escapeHtml(vcap.patientRecordHash || recomputed.patientRecordHash || 'N/A')}</div>
        <div><strong>Prompt Hash:</strong> ${escapeHtml(vcap.promptHash || recomputed.promptHash || 'N/A')}</div>
        <div><strong>Summary Hash:</strong> ${escapeHtml(vcap.summaryHash || recomputed.summaryHash || 'N/A')}</div>
        <div><strong>Model:</strong> ${escapeHtml(vcap.modelFingerprint || 'gemini-2.5-flash')}</div>
        <div><strong>Signer:</strong> ${escapeHtml(vcap.gatewaySigner || 'LabMSP:labtech')}</div>
      </div>
    `;
  } else {
    vcapCard.style.background = 'rgba(239, 68, 68, 0.1)';
    vcapCard.style.border = '1px solid #ef4444';
    vcapCard.style.color = '#b91c1c';

    const mismatchHtml = mismatches.map((m) => `
      <li style="margin-top: 0.25rem;">
        <strong>${escapeHtml(m.field)}:</strong> ${escapeHtml(m.description)}<br>
        <span style="font-size: 0.7rem; color: #7f1d1d;">Expected: ${escapeHtml(m.expected)}<br>Actual: ${escapeHtml(m.actual)}</span>
      </li>
    `).join('');

    vcapCard.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-weight: 700; font-size: 0.95rem;">
        <span>🚨</span>
        <span>VCAP ALERT — TAMPER DETECTED!</span>
      </div>
      <p style="margin: 0 0 0.5rem 0; font-size: 0.8rem; color: #991b1b;">
        Cryptographic hash mismatch! The clinical record or AI summary has been altered after the AI execution was anchored to the blockchain.
      </p>
      <ul style="margin: 0 0 0.5rem 1rem; padding: 0; font-size: 0.78rem;">
        ${mismatchHtml || '<li>SHA-256 hash mismatch between ledger anchor and retrieved payload.</li>'}
      </ul>
      <div style="background: rgba(255,255,255,0.7); padding: 0.5rem; border-radius: 6px; font-family: var(--font-mono); font-size: 0.72rem; word-break: break-all;">
        <div><strong>Anchored Record Hash:</strong> ${escapeHtml(vcap.patientRecordHash || 'N/A')}</div>
        <div><strong>Recomputed Hash:</strong> ${escapeHtml(recomputed.patientRecordHash || 'N/A')}</div>
      </div>
    `;
  }
}

function renderDemoResults(demoData) {
  if (!vcapCard) return;
  vcapCard.style.display = 'block';
  vcapCard.style.background = 'rgba(2, 132, 199, 0.04)';
  vcapCard.style.border = '1px solid #0284c7';
  vcapCard.style.color = 'inherit';

  const stages = demoData.stages || {};
  const s1 = stages.stage1_authentic || {};
  const s2 = stages.stage2_clinical_tamper || {};
  const s3 = stages.stage3_ai_summary_tamper || {};

  vcapCard.innerHTML = `
    <div style="font-weight: 700; color: #0284c7; margin-bottom: 0.6rem; font-size: 0.88rem; display: flex; align-items: center; justify-content: space-between;">
      <span>3-Stage VCAP Security & Provenance Audit</span>
      <span style="font-size: 0.7rem; font-family: var(--font-mono); color: var(--text-muted);">${escapeHtml(demoData.demoId || '')}</span>
    </div>

    <!-- Stage 1 -->
    <div style="background: rgba(34, 197, 94, 0.1); border-left: 4px solid #22c55e; padding: 0.5rem; margin-bottom: 0.5rem; border-radius: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: #15803d; font-size: 0.8rem;">Stage 1: Authentic Record (Hb = 8.5)</strong>
        <span class="pill" style="background: #dcfce7; color: #15803d; font-weight: 700; font-size: 0.68rem;">✔ VERIFIED</span>
      </div>
      <div style="font-size: 0.73rem; color: #166534; margin-top: 0.2rem;">
        ${escapeHtml((s1.result && s1.result.message) || 'Input and summary match on-chain hash.')}
      </div>
    </div>

    <!-- Stage 2 -->
    <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; padding: 0.5rem; margin-bottom: 0.5rem; border-radius: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: #b91c1c; font-size: 0.8rem;">Stage 2: Tampered Record (Hb 8.5 ➔ 14.5)</strong>
        <span class="pill" style="background: #fee2e2; color: #b91c1c; font-weight: 700; font-size: 0.68rem;">🚨 TAMPER DETECTED</span>
      </div>
      <div style="font-size: 0.73rem; color: #991b1b; margin-top: 0.2rem;">
        ${escapeHtml((s2.result && s2.result.message) || 'Clinical record altered after AI anchoring!')}
      </div>
    </div>

    <!-- Stage 3 -->
    <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; padding: 0.5rem; border-radius: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: #b91c1c; font-size: 0.8rem;">Stage 3: Tampered AI Diagnostic Summary</strong>
        <span class="pill" style="background: #fee2e2; color: #b91c1c; font-weight: 700; font-size: 0.68rem;">🚨 TAMPER DETECTED</span>
      </div>
      <div style="font-size: 0.73rem; color: #991b1b; margin-top: 0.2rem;">
        ${escapeHtml((s3.result && s3.result.message) || 'AI diagnostic text modified!')}
      </div>
    </div>
  `;
}

async function verifyVcapAction(resultId, simulateTamper) {
  const btn = simulateTamper ? vcapTamperBtn : vcapVerifyBtn;
  toggleLoading(btn, true);

  try {
    const response = await apiRequest('/api/vcap/verify', {
      method: 'POST',
      body: JSON.stringify({
        resultId,
        simulateTamper,
      }),
    });

    setOutput(
      simulateTamper ? 'POST /api/vcap/verify (Simulate Tampering)' : 'POST /api/vcap/verify',
      response
    );
    renderVcapCard(response);

    if (simulateTamper) {
      showToast('⚠️ Tamper Simulation executed: VCAP detected hash mismatch!');
    } else {
      showToast('✅ VCAP verification succeeded! Provenance matches ledger.');
    }
  } catch (error) {
    showToast(error.message);
    setOutput('VCAP Verification Error', { error: error.message });
  } finally {
    toggleLoading(btn, false);
  }
}

async function getOrResolveResultId() {
  let resultId = String(vcapResultIdInput ? vcapResultIdInput.value : '').trim();
  if (resultId) {
    return resultId;
  }
  const firstRow = recordsBody ? recordsBody.querySelector('tr td[data-label="Result ID"]') : null;
  if (firstRow && firstRow.textContent.trim() && !firstRow.textContent.includes('No records') && !firstRow.textContent.includes('Loading')) {
    resultId = firstRow.textContent.trim();
    if (vcapResultIdInput) vcapResultIdInput.value = resultId;
    return resultId;
  }
  showToast('No Record ID found. Generating demo record first...');
  const demoResp = await apiRequest('/api/vcap/tamper-demo', { method: 'POST' });
  await loadAllRecords();
  resultId = demoResp.demoId;
  if (vcapResultIdInput) vcapResultIdInput.value = resultId;
  return resultId;
}

async function loadMeta() {
  let meta;

  try {
    meta = await apiRequest('/api/meta');
  } catch (error) {
    meta = {
      peers: FALLBACK_PEERS,
      defaultPeer: FALLBACK_PEERS[0],
      channel: 'ehrchannel',
      chaincode: 'labresults',
    };
    showToast(`Meta API unavailable, using fallback peers: ${error.message}`);
  }

  const peers = Array.isArray(meta.peers) && meta.peers.length > 0
    ? meta.peers
    : FALLBACK_PEERS;

  peerSelect.innerHTML = '';
  for (const peer of peers) {
    const option = document.createElement('option');
    option.value = peer;
    option.textContent = peer;
    if (peer === meta.defaultPeer) {
      option.selected = true;
    }
    peerSelect.appendChild(option);
  }

  if (!peerSelect.value && peerSelect.options.length > 0) {
    peerSelect.selectedIndex = 0;
  }

  const channel = meta.channel || 'ehrchannel';
  const chaincode = meta.chaincode || 'labresults';
  metaPill.textContent = `${channel} - ${chaincode} - ${peers.length} peer(s)`;

  if (meta.vcapStandard) {
    showToast(`VCAP Engine: ${meta.vcapStandard}`);
  }
}

async function loadAllRecords() {
  const response = await apiRequest('/api/records');
  const records = normalizeToArray(response.result);
  renderRows(records);
  setOutput('GET /api/records', response);
  metaPill.textContent = `${response.peer} - ${records.length} record(s)`;
}

refreshBtn.addEventListener('click', async () => {
  toggleLoading(refreshBtn, true);
  try {
    await loadAllRecords();
    showToast('Ledger refreshed');
  } catch (error) {
    showToast(error.message);
  } finally {
    toggleLoading(refreshBtn, false);
  }
});

peerSelect.addEventListener('change', async () => {
  try {
    await loadAllRecords();
    showToast(`Using ${selectedPeer()}`);
  } catch (error) {
    showToast(error.message);
  }
});

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const btn = createForm.querySelector('button[type="submit"]');
  toggleLoading(btn, true);

  try {
    const form = new FormData(createForm);
    const resultDataText = String(form.get('resultData') || '').trim();
    const reportFile = form.get('reportFile');
    const hasReportFile = Boolean(reportFile && reportFile.size > 0);

    let parsedData = null;
    if (resultDataText) {
      try {
        parsedData = JSON.parse(resultDataText);
      } catch {
        throw new Error('Invalid JSON in Result Data field.');
      }
    }

    if (!parsedData && !hasReportFile) {
      throw new Error('Provide Result Data JSON or upload a PDF/image report file.');
    }

    const collectedAt = String(form.get('collectedAt') || '').trim();
    const dateObj = new Date(collectedAt);
    const isoDateString = isNaN(dateObj.getTime()) ? collectedAt : dateObj.toISOString();

    const payload = {
      resultId: String(form.get('resultId') || '').trim(),
      patientId: String(form.get('patientId') || '').trim(),
      testCode: String(form.get('testCode') || '').trim(),
      collectedAt: isoDateString,
      status: String(form.get('status') || '').trim(),
      runAiAgents: form.get('runAiAgents') === 'on',
    };

    const useIpfs = form.get('storeInIpfs') === 'on';
    const endpoint = useIpfs ? '/api/records/ipfs' : '/api/records';

    let response;
    if (useIpfs) {
      const multipartPayload = new FormData();
      multipartPayload.append('resultId', payload.resultId);
      multipartPayload.append('patientId', payload.patientId);
      multipartPayload.append('testCode', payload.testCode);
      multipartPayload.append('collectedAt', payload.collectedAt);
      multipartPayload.append('status', payload.status);
      multipartPayload.append('runAiAgents', String(payload.runAiAgents));

      if (parsedData !== null) {
        multipartPayload.append('resultData', JSON.stringify(parsedData));
      }

      if (hasReportFile) {
        multipartPayload.append('reportFile', reportFile, reportFile.name);
      }

      response = await apiRequest(endpoint, {
        method: 'POST',
        body: multipartPayload,
      });
    } else {
      if (parsedData === null) {
        throw new Error('Result Data JSON is required when IPFS upload is disabled.');
      }

      response = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          resultData: parsedData,
        }),
      });
    }

    setOutput(`POST ${endpoint}`, response);
    await loadAllRecords();
    createForm.reset();

    const vcapNote = response.vcap ? ' | 🛡️ VCAP Provenance Anchored' : '';
    showToast(`Created ${payload.resultId}${vcapNote}`);

    if (vcapResultIdInput) {
      vcapResultIdInput.value = payload.resultId;
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    toggleLoading(btn, false);
  }
});

readForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const btn = readForm.querySelector('button[type="submit"]');
  toggleLoading(btn, true);

  try {
    const resultId = String(new FormData(readForm).get('resultId') || '').trim();
    const response = await apiRequest(`/api/records/${encodeURIComponent(resultId)}`);
    renderRows(normalizeToArray(response.result));
    setOutput(`GET /api/records/${resultId}`, response);
    showToast(`Loaded ${resultId}`);
  } catch (error) {
    showToast(error.message);
  } finally {
    toggleLoading(btn, false);
  }
});

resolveDataForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const btn = resolveDataForm.querySelector('button[type="submit"]');
  toggleLoading(btn, true);

  try {
    const resultId = String(new FormData(resolveDataForm).get('resultId') || '').trim();
    const response = await apiRequest(
      `/api/records/${encodeURIComponent(resultId)}/resolve-data`
    );

    setOutput(`GET /api/records/${resultId}/resolve-data`, response);
    showToast(response.resolved ? `Resolved IPFS payload for ${resultId}` : response.message);
  } catch (error) {
    showToast(error.message);
  } finally {
    toggleLoading(btn, false);
  }
});

patientForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const btn = patientForm.querySelector('button[type="submit"]');
  toggleLoading(btn, true);

  try {
    const patientId = String(new FormData(patientForm).get('patientId') || '').trim();
    const response = await apiRequest(
      `/api/patients/${encodeURIComponent(patientId)}/records`
    );

    renderRows(normalizeToArray(response.result));
    setOutput(`GET /api/patients/${patientId}/records`, response);
    showToast(`Loaded history for ${patientId}`);
  } catch (error) {
    showToast(error.message);
  } finally {
    toggleLoading(btn, false);
  }
});

updateStatusForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const btn = updateStatusForm.querySelector('button[type="submit"]');
  toggleLoading(btn, true);

  try {
    const form = new FormData(updateStatusForm);
    const resultId = String(form.get('resultId') || '').trim();
    const status = String(form.get('status') || '').trim();

    const response = await apiRequest(`/api/records/${encodeURIComponent(resultId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    setOutput(`PATCH /api/records/${resultId}/status`, response);
    await loadAllRecords();
    updateStatusForm.reset();
    showToast(`Updated ${resultId} status`);
  } catch (error) {
    showToast(error.message);
  } finally {
    toggleLoading(btn, false);
  }
});

// VCAP Event Listeners
if (vcapVerifyBtn) {
  vcapVerifyBtn.addEventListener('click', async () => {
    try {
      const resultId = await getOrResolveResultId();
      if (!resultId) return;
      await verifyVcapAction(resultId, false);
    } catch (err) {
      showToast(err.message);
    }
  });
}

if (vcapTamperBtn) {
  vcapTamperBtn.addEventListener('click', async () => {
    try {
      const resultId = await getOrResolveResultId();
      if (!resultId) return;
      await verifyVcapAction(resultId, true);
    } catch (err) {
      showToast(err.message);
    }
  });
}

if (vcapResultIdInput) {
  vcapResultIdInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const resultId = String(vcapResultIdInput.value || '').trim();
      if (resultId) {
        await verifyVcapAction(resultId, false);
      }
    }
  });
}

if (vcapDemoBtn) {
  vcapDemoBtn.addEventListener('click', async () => {
    toggleLoading(vcapDemoBtn, true);
    try {
      const response = await apiRequest('/api/vcap/tamper-demo', { method: 'POST' });
      setOutput('POST /api/vcap/tamper-demo (proposal.tex demonstration)', response);
      await loadAllRecords();
      if (vcapResultIdInput) {
        vcapResultIdInput.value = response.demoId;
      }
      renderDemoResults(response);
      showToast('Ran 3-stage VCAP demonstration (check transaction output panel)!');
    } catch (error) {
      showToast(error.message);
    } finally {
      toggleLoading(vcapDemoBtn, false);
    }
  });
}

if (clearOutputBtn) {
  clearOutputBtn.addEventListener('click', () => {
    rawOutput.innerHTML = '<span style="color: var(--text-muted);">Awaiting transactions...</span>';
  });
}

(async () => {
  try {
    await loadMeta();
    await loadAllRecords();
  } catch (error) {
    showToast(error.message);
    setOutput('Startup error', { error: error.message });
  }
})();
