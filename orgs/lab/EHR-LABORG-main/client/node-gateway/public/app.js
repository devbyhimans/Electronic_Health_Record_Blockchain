const peerSelect = document.getElementById('peerSelect');
const refreshBtn = document.getElementById('refreshBtn');
const createForm = document.getElementById('createForm');
const readForm = document.getElementById('readForm');
const resolveDataForm = document.getElementById('resolveDataForm');
const patientForm = document.getElementById('patientForm');
const updateStatusForm = document.getElementById('updateStatusForm');
const recordsBody = document.getElementById('recordsBody');
const metaPill = document.getElementById('metaPill');
const rawOutput = document.getElementById('rawOutput');
const clearOutputBtn = document.getElementById('clearOutputBtn');
const toast = document.getElementById('toast');

const FALLBACK_PEERS = [
  'peer0.lab.example.com',
  'peer1.lab.example.com',
  'peer2.lab.example.com',
];

let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function selectedPeer() {
  return peerSelect.value;
}

function withPeer(path) {
  const url = new URL(path, window.location.origin);
  const peer = selectedPeer();
  if (peer) {
    url.searchParams.set('peer', peer);
  }
  return url.toString();
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

async function apiRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(options.headers || {}),
  };

  if (!isFormData && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(withPeer(path), {
    headers,
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

function normalizeToArray(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (isPlainObject(result)) {
    return [result];
  }
  return [];
}

function getStatusStyle(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'PENDING') return 'background: #fdf0de; color: #8a4a1f; border: 1px solid #efcba5;';
  if (s === 'REPORTED') return 'background: #e5f6ee; color: #1d6b43; border: 1px solid #b7dfcb;';
  if (s === 'ERROR') return 'background: #fdeaea; color: #9e2d2d; border: 1px solid #f3b3b3;';
  return 'background: #e8efec; color: #4b6359; border: 1px solid #c7d6cf;';
}

function renderRows(records) {
  recordsBody.style.opacity = '0';
  
  setTimeout(() => {
    recordsBody.innerHTML = '';
    
    if (!records.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No records found.</td>';
      recordsBody.appendChild(row);
    } else {
      for (const record of records) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td data-label="Result ID" style="font-family: var(--font-mono); color: var(--primary-hover);">${escapeHtml(record.resultId || '')}</td>
          <td data-label="Patient ID">${escapeHtml(record.patientId || '')}</td>
          <td data-label="Test Code"><strong>${escapeHtml(record.testCode || '')}</strong></td>
          <td data-label="Status"><span class="status" style="${getStatusStyle(record.status)}">${escapeHtml(record.status || '')}</span></td>
          <td data-label="Collected At" style="color: var(--text-muted);">${escapeHtml(record.collectedAt || '')}</td>
        `;
        recordsBody.appendChild(row);
      }
    }
    
    // Fade in
    recordsBody.style.transition = 'opacity 0.3s ease';
    recordsBody.style.opacity = '1';
  }, 150);
}

function escapeHtml(text) {
  return String(text)
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

  if (meta.ipfs && meta.ipfs.apiUrl) {
    showToast(`IPFS API configured at ${meta.ipfs.apiUrl}`);
  }

  if (meta.ai) {
    const model = meta.ai.model || 'gemini-1.5-flash';
    if (meta.ai.configured) {
      showToast(`AI agents ready with ${model}`);
    } else {
      showToast('AI key not configured, fallback heuristic mode will be used');
    }
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
    // Convert to ISO string if it's from a datetime-local input
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

    if (useIpfs && response.ipfs && response.ipfs.cid) {
      const aiNote = response.ai && response.ai.labReportAnalysis
        ? ` | AI: ${response.ai.labReportAnalysis.summary || 'summary generated'}`
        : '';
      const extractNote = response.extractedTextChars
        ? ` | extracted text: ${response.extractedTextChars} chars`
        : '';
      showToast(`Created ${payload.resultId} with CID ${response.ipfs.cid}${extractNote}${aiNote}`);
    } else {
      showToast(`Created ${payload.resultId}`);
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

clearOutputBtn.addEventListener('click', () => {
  rawOutput.innerHTML = '<span style="color: var(--text-muted);">Awaiting transactions...</span>';
});

(async () => {
  try {
    await loadMeta();
    await loadAllRecords();
  } catch (error) {
    showToast(error.message);
    setOutput('Startup error', { error: error.message });
  }
})();
