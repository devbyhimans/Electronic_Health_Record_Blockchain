// CareGrid NITW Lab Deck - Diagnostic Workstation Client
'use strict';

// DOM References
const peerSelect = document.getElementById('peerSelect');
const refreshBtn = document.getElementById('refreshBtn');
const themeToggle = document.getElementById('themeToggle');

// Forms & Inputs
const createForm = document.getElementById('createForm');
const readForm = document.getElementById('readForm');
const resolveDataForm = document.getElementById('resolveDataForm');
const patientForm = document.getElementById('patientForm');
const updateStatusForm = document.getElementById('updateStatusForm');
const demoFillBtn = document.getElementById('demoFillBtn');
const formatJsonBtn = document.getElementById('formatJsonBtn');

// Bundle Elements (Approach 2)
const bundleSelect = document.getElementById('bundleSelect');
const bundleBiomarkersSection = document.getElementById('bundleBiomarkersSection');
const bundleTitle = document.getElementById('bundleTitle');
const bundleDescription = document.getElementById('bundleDescription');
const bundleSummaryBadge = document.getElementById('bundleSummaryBadge');
const bundleSummaryText = document.getElementById('bundleSummaryText');
const bundleInputsGrid = document.getElementById('bundleInputsGrid');
const bundleCriticalAlert = document.getElementById('bundleCriticalAlert');
const jsonPayloadAccordion = document.getElementById('jsonPayloadAccordion');

// File Upload
const fileDropzone = document.getElementById('fileDropzone');
const reportFileInput = document.getElementById('reportFile');
const fileSelectedBadge = document.getElementById('fileSelectedBadge');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const clearFileBtn = document.getElementById('clearFileBtn');

// Tabs
const tabCreate = document.getElementById('tabCreate');
const tabQuery = document.getElementById('tabQuery');
const panelCreate = document.getElementById('panel-create');
const panelQuery = document.getElementById('panel-query');

// Stats
const statRecordsCount = document.getElementById('statRecordsCount');
const statChannel = document.getElementById('statChannel');
const statIpfs = document.getElementById('statIpfs');
const statAi = document.getElementById('statAi');

// Table & Search
const recordsBody = document.getElementById('recordsBody');
const metaPill = document.getElementById('metaPill');
const recordSearch = document.getElementById('recordSearch');
const statusFilters = document.getElementById('statusFilters');

// Terminal Output & Clinical Dossier (Approach 1)
const rawOutput = document.getElementById('rawOutput');
const clearOutputBtn = document.getElementById('clearOutputBtn');
const copyOutputBtn = document.getElementById('copyOutputBtn');
const toast = document.getElementById('toast');
const btnViewReport = document.getElementById('btnViewReport');
const btnViewJson = document.getElementById('btnViewJson');
const clinicalReportView = document.getElementById('clinicalReportView');
const rawTerminalView = document.getElementById('rawTerminalView');
const dossierEmptyState = document.getElementById('dossierEmptyState');
const dossierContent = document.getElementById('dossierContent');
const inspectorPanel = document.getElementById('inspectorPanel');

const FALLBACK_PEERS = [
  'peer0.lab.example.com',
  'peer1.lab.example.com',
  'peer2.lab.example.com',
];

let toastTimer;
let livePeerMetadataAvailable = false;
let allRecordsCache = [];
let currentFilter = 'ALL';
let currentSearchTerm = '';
let currentOutputPayload = null;

// ==========================================================================
// Toast & Utility Helpers
// ==========================================================================
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function selectedPeer() {
  return peerSelect ? peerSelect.value : '';
}

function withPeer(path) {
  const base = window.location.pathname.startsWith('/lab') ? '/lab' : '';
  const url = new URL(base + path, window.location.origin);
  const peer = selectedPeer();
  if (peer) {
    url.searchParams.set('peer', peer);
  }
  return url.toString();
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeToArray(result) {
  if (Array.isArray(result)) return result;
  if (isPlainObject(result)) return [result];
  return [];
}

const LAB_SESSION_KEY = 'caregrid_lab_session';

function labSession() {
  try {
    return JSON.parse(sessionStorage.getItem(LAB_SESSION_KEY)) || null;
  } catch (_error) {
    return null;
  }
}

// Sign-in form shown when there is no valid lab staff session.
function showLabLogin(message) {
  if (document.getElementById('labLoginOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'labLoginOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(8,12,20,0.88);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <form id="labLoginForm" style="background:#fff;color:#111;padding:1.5rem;border-radius:12px;width:min(92vw,360px);display:flex;flex-direction:column;gap:0.7rem;font-family:inherit;">
      <strong style="font-size:1.05rem;">Lab staff sign-in</strong>
      <span style="font-size:0.8rem;color:#555;">Use your authorized Diagnostics staff account.</span>
      <input name="username" placeholder="Username (e.g. labtechnician)" autocomplete="username" required style="padding:0.55rem;border:1px solid #bbb;border-radius:8px;" />
      <input name="password" type="password" placeholder="Password (e.g. recpw)" autocomplete="current-password" required style="padding:0.55rem;border:1px solid #bbb;border-radius:8px;" />
      <div style="font-size:0.72rem;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;padding:0.5rem 0.65rem;border-radius:8px;display:flex;flex-direction:column;gap:0.3rem;">
        <span style="font-weight:700;color:#334155;">Quick Demo Identities (Click to fill):</span>
        <button type="button" style="text-align:left;background:none;border:none;padding:0;cursor:pointer;color:#0f766e;font-size:0.72rem;" onclick="document.querySelector('#labLoginForm [name=username]').value='labtechnician';document.querySelector('#labLoginForm [name=password]').value='recpw';">
          • <strong>labtechnician</strong> / <code style="color:#0f766e;">recpw</code> (Diagnostic Tech)
        </button>
        <button type="button" style="text-align:left;background:none;border:none;padding:0;cursor:pointer;color:#0f766e;font-size:0.72rem;" onclick="document.querySelector('#labLoginForm [name=username]').value='labsupervisor';document.querySelector('#labLoginForm [name=password]').value='recpw';">
          • <strong>labsupervisor</strong> / <code style="color:#0f766e;">recpw</code> (Quality Supervisor)
        </button>
      </div>
      <span id="labLoginError" style="font-size:0.8rem;color:#c62828;min-height:1em;">${escapeHtml(message || '')}</span>
      <button type="submit" style="padding:0.6rem;border:0;border-radius:8px;background:#0f766e;color:#fff;font-weight:700;cursor:pointer;">Sign in</button>
    </form>`;
  document.body.appendChild(overlay);
  overlay.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const errorBox = overlay.querySelector('#labLoginError');
    errorBox.textContent = '';
    try {
      const response = await fetch('./api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Sign-in failed');
      sessionStorage.setItem(LAB_SESSION_KEY, JSON.stringify(payload));
      window.location.reload();
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
}

async function apiRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = { ...(options.headers || {}) };

  if (!isFormData && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  const session = labSession();
  if (session && session.token) headers.Authorization = `Bearer ${session.token}`;

  const response = await fetch(withPeer(path), {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    sessionStorage.removeItem(LAB_SESSION_KEY);
    showLabLogin(session ? 'Your session has ended. Sign in again.' : '');
    throw new Error(payload.error || 'Sign in required');
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

function switchInspectorView(mode) {
  if (mode === 'report') {
    if (btnViewReport) {
      btnViewReport.classList.add('active');
      btnViewReport.setAttribute('aria-selected', 'true');
    }
    if (btnViewJson) {
      btnViewJson.classList.remove('active');
      btnViewJson.setAttribute('aria-selected', 'false');
    }
    if (clinicalReportView) clinicalReportView.classList.remove('hidden');
    if (rawTerminalView) rawTerminalView.classList.add('hidden');
  } else {
    if (btnViewJson) {
      btnViewJson.classList.add('active');
      btnViewJson.setAttribute('aria-selected', 'true');
    }
    if (btnViewReport) {
      btnViewReport.classList.remove('active');
      btnViewReport.setAttribute('aria-selected', 'false');
    }
    if (rawTerminalView) rawTerminalView.classList.remove('hidden');
    if (clinicalReportView) clinicalReportView.classList.add('hidden');
  }
}

if (btnViewReport) btnViewReport.addEventListener('click', () => switchInspectorView('report'));
if (btnViewJson) btnViewJson.addEventListener('click', () => switchInspectorView('json'));

function renderClinicalDossier(payload) {
  if (!dossierContent || !dossierEmptyState) return;

  if (!payload) {
    dossierEmptyState.classList.remove('hidden');
    dossierContent.classList.add('hidden');
    return;
  }

  // If payload is an error:
  if (payload.error) {
    dossierEmptyState.classList.add('hidden');
    dossierContent.classList.remove('hidden');
    dossierContent.innerHTML = `
      <div class="bundle-critical-alert" style="margin: 8px 0;">
        <span class="alert-icon">⚠️</span>
        <div class="alert-text">
          <strong>Request Failed:</strong> ${escapeHtml(payload.error)}
        </div>
      </div>
    `;
    return;
  }

  // If payload is an integrity check summary:
  if (payload.summary && Array.isArray(payload.records)) {
    dossierEmptyState.classList.add('hidden');
    dossierContent.classList.remove('hidden');
    const allOk = payload.ok !== false && payload.summary.mismatch === 0 && payload.summary.missing === 0;
    dossierContent.innerHTML = `
      <div class="dossier-card">
        <div class="dossier-header-bar">
          <div class="dossier-patient-info">
            <div class="dossier-id-row">
              <span class="dossier-result-id">Audit Run: ${escapeHtml(payload.trigger || 'Manual')}</span>
              <span class="dossier-bundle-badge">Ledger Integrity Check</span>
            </div>
            <div class="dossier-timestamp-row">
              <span>Run at: <strong>${payload.startedAt ? new Date(payload.startedAt).toLocaleTimeString() : '—'}</strong></span>
              <span>•</span>
              <span>Channel: <code>ehrchannel</code></span>
              <span>•</span>
              <span>Verified CIDs: <strong>${payload.summary.checked}</strong></span>
            </div>
          </div>
          <div>
            <span class="status-pill-badge ${allOk ? 'reported' : 'critical'}">
              ${allOk ? '✓ ALL CHECKS PASSED' : '⚠ INTEGRITY ALERT'}
            </span>
          </div>
        </div>

        <div class="dossier-section">
          <div class="dossier-section-header">
            <span class="section-icon">🛡️</span>
            <h4>Cryptographic Hash Verification Summary</h4>
          </div>
          <div class="biomarkers-table-wrap">
            <table class="dossier-table">
              <thead>
                <tr>
                  <th>Result ID</th>
                  <th>Audit Target</th>
                  <th>Expected vs Actual Digest</th>
                  <th style="text-align: right;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${payload.records.map(rec => (rec.checks || []).map(chk => `
                  <tr>
                    <td><strong>${escapeHtml(rec.resultId)}</strong></td>
                    <td><span class="prov-hash">${escapeHtml(chk.kind || 'payload')}</span></td>
                    <td><code class="prov-hash" style="font-size:0.68rem;">${chk.expected ? escapeHtml(chk.expected.slice(0, 20) + '...') : '—'}</code></td>
                    <td style="text-align: right;">
                      <span class="status-pill-badge ${chk.status === 'OK' ? 'reported' : 'critical'}">
                        ${chk.status === 'OK' ? '✓ OK' : '⚠ ' + escapeHtml(chk.status)}
                      </span>
                    </td>
                  </tr>
                `).join('')).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Extract Diagnostic Record
  let record = null;
  if (payload.result) {
    record = Array.isArray(payload.result) ? payload.result[0] : payload.result;
  } else if (payload.resultId) {
    record = payload;
  }

  if (!record) {
    dossierEmptyState.classList.remove('hidden');
    dossierContent.classList.add('hidden');
    return;
  }

  dossierEmptyState.classList.add('hidden');
  dossierContent.classList.remove('hidden');

  const resultId = record.resultId || 'N/A';
  const patientId = record.patientId || 'N/A';
  const testCode = record.testCode || 'Diagnostic Panel';
  const status = record.status || 'REPORTED';
  const collectedAt = record.collectedAt ? new Date(record.collectedAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const peer = payload.peer || record.peer || selectedPeer() || 'peer0.diagnostic.example.com';

  // Extract IPFS & AI data
  const ipfsContainer = payload.ipfs || {};
  let ipfsData = ipfsContainer.data || (record.resultData && record.resultData.data) || null;
  if (!ipfsData && record.resultData && typeof record.resultData === 'object' && !record.resultData.cid) {
    ipfsData = record.resultData;
  }
  const resultDataMeta = record.resultData && record.resultData.cid ? record.resultData : {};
  const cid = ipfsContainer.cid || resultDataMeta.cid || null;
  const digest = resultDataMeta.digest || null;
  const gatewayUrl = ipfsContainer.gatewayUrl || resultDataMeta.gatewayUrl || (cid ? `http://localhost:8090/ipfs/${cid}` : '#');

  // Bundle title & parameters
  const bundleTitle = ipfsData?.bundle || testCode;
  let parameters = ipfsData?.parameters || null;

  // If parameters is null, but ipfsData has keys
  if (!parameters && ipfsData && typeof ipfsData === 'object') {
    parameters = {};
    for (const [k, v] of Object.entries(ipfsData)) {
      if (['bundle', 'bundleCode', 'overallStatus', 'criticalAlert', 'evaluatedAt', 'ai'].includes(k)) continue;
      parameters[k] = v;
    }
  }

  // Build biomarker rows
  let biomarkerRows = '';
  let paramCount = 0;

  if (parameters && typeof parameters === 'object') {
    const entries = Object.entries(parameters);
    paramCount = entries.length;

    biomarkerRows = entries.map(([key, val]) => {
      let label = key;
      let observedVal = '—';
      let unit = '';
      let refRange = 'Standard clinical range';
      let flag = 'NORMAL';

      if (val && typeof val === 'object') {
        label = val.label || key.replace(/_/g, ' ').toUpperCase();
        observedVal = val.value !== undefined ? String(val.value) : '—';
        unit = val.unit || '';
        refRange = val.referenceRange || val.range || 'Standard Range';
        flag = (val.flag || 'NORMAL').toUpperCase();
      } else {
        label = key.replace(/_/g, ' ').toUpperCase();
        observedVal = String(val);
      }

      let pillClass = 'badge-normal';
      let pillIcon = '✓';
      if (flag === 'CRITICAL') { pillClass = 'badge-critical'; pillIcon = '🚨'; }
      else if (flag === 'HIGH') { pillClass = 'badge-high'; pillIcon = '⬆'; }
      else if (flag === 'LOW') { pillClass = 'badge-low'; pillIcon = '⬇'; }

      return `
        <tr>
          <td><span class="biomarker-name">${escapeHtml(label)}</span></td>
          <td class="biomarker-val-cell">${escapeHtml(observedVal)} <span class="unit">${escapeHtml(unit)}</span></td>
          <td class="biomarker-ref-cell">${escapeHtml(refRange)}</td>
          <td style="text-align: right;">
            <span class="biomarker-pill ${pillClass}">${pillIcon} ${escapeHtml(flag)}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  if (!biomarkerRows) {
    biomarkerRows = `<tr><td colspan="4" class="table-empty-row" style="padding:16px;">Biomarker parameters stored as anchored IPFS attachment.</td></tr>`;
  }

  // AI Section
  const ai = record.resultData?.ai || ipfsData?.ai || payload.ai || null;
  let aiSectionHtml = '';

  if (ai && (ai.summary || ai.enabled)) {
    const summaryText = ai.summary || 'AI diagnostic analysis synthesized from laboratory findings.';
    const recText = ai.recommendation ? `
      <div class="ai-rec-block">
        <strong style="color:var(--vitalis-blue); display:block; margin-bottom:2px;">Clinical Recommendation:</strong>
        ${escapeHtml(ai.recommendation)}
      </div>
    ` : '';
    const model = ai.model || 'Gemini 2.5 / 3.8 Flash';
    const conf = typeof ai.confidence === 'object' ? (ai.confidence.labReport || 'High') : (ai.confidence || 'High');

    aiSectionHtml = `
      <div class="dossier-section ai-section">
        <div class="ai-box-header">
          <div class="ai-title-wrap">
            <span class="ai-sparkle-icon">✨</span>
            <div>
              <h4>Gemini Clinical Decision Support</h4>
              <span class="ai-sub">${escapeHtml(model)} &middot; Multi-Modal Clinical Intelligence</span>
            </div>
          </div>
          <div class="ai-confidence-chip">
            <span class="ai-chip-dot"></span>
            <span>Confidence: ${escapeHtml(String(conf).toUpperCase())}</span>
          </div>
        </div>
        <div class="ai-body">
          <div class="ai-finding-block">
            <strong class="ai-label">Clinical Impression:</strong>
            <p style="margin: 0;">${escapeHtml(summaryText)}</p>
          </div>
          ${recText}
          <div class="ai-footer-row">
            <span class="ai-disclaimer">⚕️ Assistive clinical guidance; final evaluation by authorized medical officer required.</span>
          </div>
        </div>
      </div>
    `;
  } else {
    aiSectionHtml = `
      <div class="dossier-section" style="padding: 10px 14px; background: var(--lab-surface-soft); border-radius: var(--radius-md); border: 1px dashed var(--lab-border);">
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.75rem; flex-wrap:wrap; gap:6px;">
          <span style="color:var(--lab-text-muted);">✨ <strong>Gemini Clinical AI:</strong> Inactive for this record. (Check <em>Run Gemini AI Diagnostics</em> when submitting new tests)</span>
          <span class="param-count-badge">Assistive Mode</span>
        </div>
      </div>
    `;
  }

  // Cryptographic Provenance Bar
  const shortCid = cid ? `${cid.slice(0, 10)}...${cid.slice(-6)}` : 'On-Chain Ledger';
  const shortDigest = digest ? `${digest.slice(0, 12)}...${digest.slice(-8)}` : 'Verified On-Chain';

  const provenanceHtml = `
    <div class="dossier-provenance-bar">
      <div class="provenance-seal">
        <span class="seal-icon">🔒</span>
        <div class="seal-text">
          <strong>Immutable Fabric Anchor</strong>
          <span>Channel <code>ehrchannel</code> &middot; Endorsed by <code>${escapeHtml(peer)}</code></span>
        </div>
      </div>
      <div class="provenance-chips">
        ${cid ? `
          <div class="prov-chip">
            <span class="prov-label">IPFS CID:</span>
            <a href="${escapeHtml(gatewayUrl)}" target="_blank" rel="noopener noreferrer" class="prov-link" title="Open CID in IPFS Kubo gateway">
              ${escapeHtml(shortCid)} ↗
            </a>
          </div>
        ` : ''}
        ${digest ? `
          <div class="prov-chip">
            <span class="prov-label">SHA-256 Digest:</span>
            <code class="prov-hash" title="${escapeHtml(digest)}">${escapeHtml(shortDigest)}</code>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  dossierContent.innerHTML = `
    <div class="dossier-card">
      <!-- Header -->
      <div class="dossier-header-bar">
        <div class="dossier-patient-info">
          <div class="dossier-id-row">
            <span class="dossier-result-id">${escapeHtml(resultId)}</span>
            <span class="dossier-patient-id">Patient: <strong>${escapeHtml(patientId)}</strong></span>
            <span class="dossier-bundle-badge">${escapeHtml(bundleTitle)}</span>
          </div>
          <div class="dossier-timestamp-row">
            <span>Collected: <strong>${escapeHtml(collectedAt)}</strong></span>
            <span>•</span>
            <span>Peer: <code>${escapeHtml(peer)}</code></span>
            <span>•</span>
            <span>Org: <strong>${escapeHtml(record.ownerOrg || 'DiagnosticsMSP')}</strong></span>
          </div>
        </div>
        <div>
          ${getStatusBadge(status)}
        </div>
      </div>

      <!-- Biomarkers Section -->
      <div class="dossier-section">
        <div class="dossier-section-header">
          <span class="section-icon">🧪</span>
          <h4>Measured Biomarkers &amp; Findings</h4>
          <span class="param-count-badge">${paramCount} Parameter${paramCount === 1 ? '' : 's'}</span>
        </div>
        <div class="biomarkers-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>Biomarker / Assay</th>
                <th>Observed Value</th>
                <th>Reference Range</th>
                <th style="text-align: right;">Status Flag</th>
              </tr>
            </thead>
            <tbody>
              ${biomarkerRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- AI Section -->
      ${aiSectionHtml}

      <!-- Cryptographic Provenance -->
      ${provenanceHtml}
    </div>
  `;
}

function setOutput(label, payload) {
  currentOutputPayload = payload;
  if (rawOutput) {
    rawOutput.innerHTML = `<span style="color: #54f1dc; font-weight: 700;">// ${escapeHtml(label)}</span>\n\n${escapeHtml(JSON.stringify(payload, null, 2))}`;
  }
  renderClinicalDossier(payload);
}

function toggleLoading(button, isLoading) {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.innerHTML;
    }
    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML = '<span class="loading-spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Processing...';
  } else {
    button.disabled = false;
    button.classList.remove('is-loading');
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
}

// ==========================================================================
// Tabs Navigation
// ==========================================================================
if (tabCreate && tabQuery) {
  tabCreate.addEventListener('click', () => {
    tabCreate.classList.add('active');
    tabQuery.classList.remove('active');
    panelCreate.classList.add('active');
    panelQuery.classList.remove('active');
  });

  tabQuery.addEventListener('click', () => {
    tabQuery.classList.add('active');
    tabCreate.classList.remove('active');
    panelQuery.classList.add('active');
    panelCreate.classList.remove('active');
  });
}

// ==========================================================================
// Drag & Drop File Handling
// ==========================================================================
if (fileDropzone && reportFileInput) {
  fileDropzone.addEventListener('click', (e) => {
    if (e.target !== clearFileBtn) {
      reportFileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    fileDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      fileDropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    fileDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      fileDropzone.classList.remove('dragover');
    });
  });

  fileDropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      reportFileInput.files = files;
      updateFileBadge();
    }
  });

  reportFileInput.addEventListener('change', updateFileBadge);

  if (clearFileBtn) {
    clearFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      reportFileInput.value = '';
      updateFileBadge();
    });
  }
}

function updateFileBadge() {
  if (!reportFileInput || !fileSelectedBadge) return;
  const file = reportFileInput.files?.[0];
  if (file) {
    fileNameDisplay.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    fileSelectedBadge.classList.remove('hidden');
  } else {
    fileSelectedBadge.classList.add('hidden');
  }
}

// ==========================================================================
// Clinical Indication / Disease-Driven Diagnostic Bundles (Approach 2)
// ==========================================================================
const CLINICAL_BUNDLES = {
  CARDIAC: {
    id: 'CARDIAC',
    name: 'Acute Chest Pain & ACS (Cardiac Workup)',
    code: 'CARDIAC-ACS',
    description: 'Biomarkers for acute coronary syndrome, myocardial necrosis & cardiovascular lipid profile',
    biomarkers: [
      { key: 'troponin_i', label: 'hs-Troponin I', unit: 'ng/mL', min: 0, max: 50, step: '0.01', refMin: 0, refMax: 0.04, criticalHigh: 0.40, demo: 0.02, help: 'Normal < 0.04 ng/mL' },
      { key: 'ck_mb', label: 'CK-MB (Isoenzyme)', unit: 'ng/mL', min: 0, max: 200, step: '0.1', refMin: 0, refMax: 5.0, criticalHigh: 10.0, demo: 2.8, help: 'Normal 0.0 - 5.0 ng/mL' },
      { key: 'total_cholesterol', label: 'Total Cholesterol', unit: 'mg/dL', min: 40, max: 500, step: '1', refMin: 120, refMax: 200, criticalHigh: 280, demo: 185, help: 'Desirable < 200 mg/dL' },
      { key: 'hdl', label: 'HDL Cholesterol', unit: 'mg/dL', min: 10, max: 150, step: '1', refMin: 40, refMax: 80, criticalLow: 30, demo: 54, help: 'Protective > 40 mg/dL' },
      { key: 'ldl', label: 'LDL Cholesterol', unit: 'mg/dL', min: 20, max: 350, step: '1', refMin: 50, refMax: 100, criticalHigh: 160, demo: 96, help: 'Optimal < 100 mg/dL' },
      { key: 'triglycerides', label: 'Triglycerides', unit: 'mg/dL', min: 30, max: 800, step: '1', refMin: 50, refMax: 150, criticalHigh: 300, demo: 130, help: 'Normal < 150 mg/dL' },
    ]
  },
  DIABETES: {
    id: 'DIABETES',
    name: 'Diabetes, Glycemic & Metabolic Review',
    code: 'DIABETES-METABOLIC',
    description: 'Glycemic control, insulin resistance & diabetic microvascular screening panel',
    biomarkers: [
      { key: 'fasting_glucose', label: 'Fasting Blood Glucose', unit: 'mg/dL', min: 30, max: 600, step: '1', refMin: 70, refMax: 99, criticalLow: 50, criticalHigh: 250, demo: 92, help: 'Normal 70 - 99 mg/dL' },
      { key: 'post_prandial_glucose', label: 'Post-Prandial Glucose (2h)', unit: 'mg/dL', min: 40, max: 700, step: '1', refMin: 80, refMax: 140, criticalHigh: 300, demo: 128, help: 'Normal < 140 mg/dL' },
      { key: 'hba1c', label: 'Glycated HbA1c', unit: '%', min: 3, max: 20, step: '0.1', refMin: 4.0, refMax: 5.6, criticalHigh: 9.0, demo: 5.4, help: 'Normal < 5.7% (Diabetes >= 6.5%)' },
      { key: 'serum_creatinine', label: 'Serum Creatinine', unit: 'mg/dL', min: 0.1, max: 15, step: '0.05', refMin: 0.7, refMax: 1.3, criticalHigh: 2.5, demo: 0.95, help: 'Normal 0.7 - 1.3 mg/dL' },
      { key: 'urine_microalbumin', label: 'Urine Microalbumin', unit: 'mg/L', min: 0, max: 400, step: '0.5', refMin: 0, refMax: 20, criticalHigh: 100, demo: 9.2, help: 'Normal < 20 mg/L' },
    ]
  },
  SEPSIS: {
    id: 'SEPSIS',
    name: 'Acute Febrile Illness & Sepsis Screening',
    code: 'FEBRILE-SEPSIS',
    description: 'Hematologic markers for systemic inflammatory response, bacteremia & sepsis triage',
    biomarkers: [
      { key: 'wbc_count', label: 'Total WBC Count', unit: 'cells/mcL', min: 500, max: 60000, step: '100', refMin: 4500, refMax: 11000, criticalLow: 2500, criticalHigh: 18000, demo: 7200, help: 'Normal 4,500 - 11,000 cells/mcL' },
      { key: 'hemoglobin', label: 'Hemoglobin (Hb)', unit: 'g/dL', min: 2, max: 25, step: '0.1', refMin: 13.0, refMax: 17.5, criticalLow: 7.0, demo: 14.8, help: 'Normal 13.0 - 17.5 g/dL' },
      { key: 'platelets', label: 'Platelet Count', unit: 'x10³/mcL', min: 10, max: 1200, step: '5', refMin: 150, refMax: 450, criticalLow: 50, demo: 255, help: 'Normal 150 - 450 x10³/mcL' },
      { key: 'crp', label: 'C-Reactive Protein (CRP)', unit: 'mg/L', min: 0, max: 300, step: '0.1', refMin: 0, refMax: 5.0, criticalHigh: 25.0, demo: 2.1, help: 'Normal < 5.0 mg/L' },
      { key: 'esr', label: 'ESR (Westergren)', unit: 'mm/hr', min: 0, max: 140, step: '1', refMin: 0, refMax: 20, criticalHigh: 60, demo: 11, help: 'Normal 0 - 20 mm/hr' },
    ]
  },
  HEPATIC: {
    id: 'HEPATIC',
    name: 'Hepatic Dysfunction & Jaundice Workup',
    code: 'HEPATIC-JAUNDICE',
    description: 'Biliary clearance, transaminase transamination & hepatocellular synthesis profile',
    biomarkers: [
      { key: 'total_bilirubin', label: 'Total Bilirubin', unit: 'mg/dL', min: 0, max: 30, step: '0.05', refMin: 0.2, refMax: 1.2, criticalHigh: 3.0, demo: 0.8, help: 'Normal 0.2 - 1.2 mg/dL' },
      { key: 'direct_bilirubin', label: 'Direct Bilirubin', unit: 'mg/dL', min: 0, max: 15, step: '0.05', refMin: 0.0, refMax: 0.3, criticalHigh: 1.0, demo: 0.2, help: 'Normal 0.0 - 0.3 mg/dL' },
      { key: 'alt_sgpt', label: 'ALT / SGPT', unit: 'U/L', min: 1, max: 2000, step: '1', refMin: 7, refMax: 56, criticalHigh: 200, demo: 34, help: 'Normal 7 - 56 U/L' },
      { key: 'ast_sgot', label: 'AST / SGOT', unit: 'U/L', min: 1, max: 2000, step: '1', refMin: 10, refMax: 40, criticalHigh: 180, demo: 28, help: 'Normal 10 - 40 U/L' },
      { key: 'alp', label: 'Alkaline Phosphatase (ALP)', unit: 'U/L', min: 10, max: 1500, step: '1', refMin: 44, refMax: 147, criticalHigh: 350, demo: 92, help: 'Normal 44 - 147 U/L' },
      { key: 'serum_albumin', label: 'Serum Albumin', unit: 'g/dL', min: 1, max: 8, step: '0.1', refMin: 3.5, refMax: 5.5, criticalLow: 2.5, demo: 4.4, help: 'Normal 3.5 - 5.5 g/dL' },
    ]
  },
  RENAL: {
    id: 'RENAL',
    name: 'Renal Impairment & Electrolyte Balance',
    code: 'RENAL-ELECTROLYTE',
    description: 'Glomerular filtration rate indicators, nitrogenous waste & serum electrolytes',
    biomarkers: [
      { key: 'serum_creatinine', label: 'Serum Creatinine', unit: 'mg/dL', min: 0.1, max: 20, step: '0.05', refMin: 0.7, refMax: 1.3, criticalHigh: 3.0, demo: 0.92, help: 'Normal 0.7 - 1.3 mg/dL' },
      { key: 'bun', label: 'Blood Urea Nitrogen (BUN)', unit: 'mg/dL', min: 1, max: 150, step: '1', refMin: 7, refMax: 20, criticalHigh: 50, demo: 15, help: 'Normal 7 - 20 mg/dL' },
      { key: 'potassium', label: 'Potassium (K+)', unit: 'mEq/L', min: 1, max: 10, step: '0.1', refMin: 3.5, refMax: 5.0, criticalLow: 2.8, criticalHigh: 6.0, demo: 4.3, help: 'Normal 3.5 - 5.0 mEq/L' },
      { key: 'sodium', label: 'Sodium (Na+)', unit: 'mEq/L', min: 90, max: 180, step: '1', refMin: 135, refMax: 145, criticalLow: 125, criticalHigh: 155, demo: 141, help: 'Normal 135 - 145 mEq/L' },
      { key: 'uric_acid', label: 'Serum Uric Acid', unit: 'mg/dL', min: 1, max: 20, step: '0.1', refMin: 3.5, refMax: 7.2, criticalHigh: 10.0, demo: 5.4, help: 'Normal 3.5 - 7.2 mg/dL' },
    ]
  }
};

let activeBundleKey = null;

function renderBundle(bundleKey) {
  activeBundleKey = bundleKey;
  if (!bundleKey || bundleKey === 'CUSTOM') {
    if (bundleBiomarkersSection) bundleBiomarkersSection.classList.add('hidden');
    if (jsonPayloadAccordion) jsonPayloadAccordion.open = true;
    return;
  }

  const bundle = CLINICAL_BUNDLES[bundleKey];
  if (!bundle) return;

  if (bundleBiomarkersSection) bundleBiomarkersSection.classList.remove('hidden');
  if (bundleTitle) bundleTitle.textContent = bundle.name;
  if (bundleDescription) bundleDescription.textContent = bundle.description;

  const testCodeInput = document.getElementById('createTestCode');
  if (testCodeInput) testCodeInput.value = bundle.code;

  if (bundleInputsGrid) {
    bundleInputsGrid.innerHTML = bundle.biomarkers.map((b) => `
      <div class="biomarker-card" id="card_${b.key}">
        <div class="biomarker-top">
          <label class="biomarker-label" for="bio_${b.key}" title="${escapeHtml(b.label)}">${escapeHtml(b.label)}</label>
          <span class="biomarker-pill badge-empty" id="pill_${b.key}">—</span>
        </div>
        <div class="biomarker-input-wrap">
          <input 
            type="number" 
            class="biomarker-input" 
            id="bio_${b.key}" 
            data-key="${b.key}" 
            step="${b.step}" 
            min="${b.min}" 
            max="${b.max}" 
            placeholder="${b.refMin !== undefined ? `${b.refMin} - ${b.refMax}` : ''}" 
          />
          <span class="biomarker-unit">${escapeHtml(b.unit)}</span>
        </div>
        <div class="biomarker-ref">${escapeHtml(b.help)}</div>
      </div>
    `).join('');

    // Attach real-time input listeners to each biomarker input
    bundle.biomarkers.forEach((b) => {
      const input = document.getElementById(`bio_${b.key}`);
      if (input) {
        input.addEventListener('input', () => evaluateBundleParameters());
      }
    });
  }

  evaluateBundleParameters();
}

function evaluateBundleParameters() {
  if (!activeBundleKey || activeBundleKey === 'CUSTOM') return;
  const bundle = CLINICAL_BUNDLES[activeBundleKey];
  if (!bundle) return;

  const parameters = {};
  let hasCritical = false;
  let hasAbnormal = false;
  let filledCount = 0;

  bundle.biomarkers.forEach((b) => {
    const input = document.getElementById(`bio_${b.key}`);
    const pill = document.getElementById(`pill_${b.key}`);
    const card = document.getElementById(`card_${b.key}`);
    const rawVal = input ? input.value.trim() : '';

    if (rawVal === '') {
      if (pill) {
        pill.textContent = '—';
        pill.className = 'biomarker-pill badge-empty';
      }
      if (card) {
        card.className = 'biomarker-card';
      }
      return;
    }

    const val = parseFloat(rawVal);
    if (isNaN(val)) return;

    filledCount++;
    let flag = 'NORMAL';
    let pillText = '✓ NORMAL';
    let pillClass = 'badge-normal';
    let cardClass = 'card-normal';

    const isCritHigh = b.criticalHigh !== undefined && val >= b.criticalHigh;
    const isCritLow = b.criticalLow !== undefined && val <= b.criticalLow;

    if (isCritHigh || isCritLow) {
      flag = 'CRITICAL';
      pillText = '🚨 CRITICAL';
      pillClass = 'badge-critical';
      cardClass = 'card-critical';
      hasCritical = true;
    } else if (b.refMin !== undefined && val < b.refMin) {
      flag = 'LOW';
      pillText = '⬇ LOW';
      pillClass = 'badge-low';
      cardClass = 'card-low';
      hasAbnormal = true;
    } else if (b.refMax !== undefined && val > b.refMax) {
      flag = 'HIGH';
      pillText = '⬆ HIGH';
      pillClass = 'badge-high';
      cardClass = 'card-high';
      hasAbnormal = true;
    }

    if (pill) {
      pill.textContent = pillText;
      pill.className = `biomarker-pill ${pillClass}`;
    }
    if (card) {
      card.className = `biomarker-card ${cardClass}`;
    }

    parameters[b.key] = {
      label: b.label,
      value: val,
      unit: b.unit,
      referenceRange: b.help,
      flag: flag
    };
  });

  // Calculate overall summary
  let overallStatus = 'NORMAL';
  if (hasCritical) {
    overallStatus = 'CRITICAL';
  } else if (hasAbnormal) {
    overallStatus = 'ABNORMAL';
  } else if (filledCount === 0) {
    overallStatus = 'PENDING';
  }

  if (bundleSummaryBadge && bundleSummaryText) {
    bundleSummaryBadge.className = 'biomarker-summary-badge';
    if (overallStatus === 'CRITICAL') {
      bundleSummaryBadge.classList.add('badge-critical');
      bundleSummaryText.textContent = 'CRITICAL FINDINGS';
    } else if (overallStatus === 'ABNORMAL') {
      bundleSummaryBadge.classList.add('badge-high');
      bundleSummaryText.textContent = 'ABNORMAL FINDINGS';
    } else if (overallStatus === 'NORMAL') {
      bundleSummaryBadge.classList.add('badge-normal');
      bundleSummaryText.textContent = 'ALL PARAMETERS NORMAL';
    } else {
      bundleSummaryBadge.classList.add('badge-normal');
      bundleSummaryText.textContent = 'AWAITING INPUTS';
    }
  }

  if (bundleCriticalAlert) {
    if (hasCritical) {
      bundleCriticalAlert.classList.remove('hidden');
    } else {
      bundleCriticalAlert.classList.add('hidden');
    }
  }

  // Auto-suggest status in createStatus select
  const statusSelect = document.getElementById('createStatus');
  if (statusSelect) {
    if (hasCritical) {
      statusSelect.value = 'CRITICAL';
    } else if (statusSelect.value === 'CRITICAL' && !hasCritical) {
      statusSelect.value = 'REPORTED';
    }
  }

  // Real-time synchronization to Result Data textarea
  const resultDataTextarea = document.getElementById('createResultData');
  if (resultDataTextarea && filledCount > 0) {
    const payloadObject = {
      bundle: bundle.name,
      bundleCode: bundle.code,
      overallStatus: overallStatus,
      criticalAlert: hasCritical,
      parameters: parameters,
      evaluatedAt: new Date().toISOString()
    };
    resultDataTextarea.value = JSON.stringify(payloadObject, null, 2);
  }
}

// Bundle selector change event
if (bundleSelect) {
  bundleSelect.addEventListener('change', (e) => {
    renderBundle(e.target.value);
  });
}

// ==========================================================================
// Demo Data Filler & Format JSON
// ==========================================================================
if (demoFillBtn) {
  demoFillBtn.addEventListener('click', () => {
    let selectedBundleKey = bundleSelect ? bundleSelect.value : '';
    if (!selectedBundleKey || selectedBundleKey === 'CUSTOM') {
      selectedBundleKey = 'CARDIAC';
      if (bundleSelect) bundleSelect.value = 'CARDIAC';
      renderBundle('CARDIAC');
    }

    const bundle = CLINICAL_BUNDLES[selectedBundleKey];
    const randomId = 'LAB-RES-' + Math.floor(100 + Math.random() * 900);
    const resultIdInput = document.getElementById('createResultId');
    const patientIdInput = document.getElementById('createPatientId');
    const collectedAtInput = document.getElementById('createCollectedAt');
    const statusSelect = document.getElementById('createStatus');

    if (resultIdInput) resultIdInput.value = randomId;
    if (patientIdInput) patientIdInput.value = 'PAT-001';
    if (collectedAtInput) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      collectedAtInput.value = now.toISOString().slice(0, 16);
    }

    if (bundle) {
      bundle.biomarkers.forEach((b) => {
        const input = document.getElementById(`bio_${b.key}`);
        if (input) input.value = b.demo;
      });
      evaluateBundleParameters();
    }

    if (statusSelect && statusSelect.value !== 'CRITICAL') {
      statusSelect.value = 'REPORTED';
    }

    showToast(`Loaded clinical bundle demo for ${randomId}`);
  });
}

if (formatJsonBtn) {
  formatJsonBtn.addEventListener('click', () => {
    const textarea = document.getElementById('createResultData');
    if (!textarea || !textarea.value.trim()) return;
    try {
      const parsed = JSON.parse(textarea.value.trim());
      textarea.value = JSON.stringify(parsed, null, 2);
      showToast('JSON formatted');
    } catch {
      showToast('Invalid JSON syntax');
    }
  });
}

// ==========================================================================
// Table Rendering & Filtering
// ==========================================================================
function getStatusBadge(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'REPORTED') {
    return `<span class="status-pill-badge reported">✓ ${escapeHtml(s)}</span>`;
  }
  if (s === 'PENDING' || s === 'IN_REVIEW') {
    return `<span class="status-pill-badge pending">⏳ ${escapeHtml(s)}</span>`;
  }
  if (s === 'CRITICAL' || s === 'ERROR') {
    return `<span class="status-pill-badge critical">⚠ ${escapeHtml(s)}</span>`;
  }
  return `<span class="status-pill-badge">${escapeHtml(s)}</span>`;
}

function renderRows(records, emptyMessage = 'No matching diagnostic records.') {
  if (!recordsBody) return;
  recordsBody.style.opacity = '0';

  setTimeout(() => {
    recordsBody.innerHTML = '';

    if (!records.length) {
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="6" class="table-empty-row">${escapeHtml(emptyMessage)}</td>`;
      recordsBody.appendChild(row);
    } else {
      for (const record of records) {
        const row = document.createElement('tr');
        const formattedDate = record.collectedAt
          ? new Date(record.collectedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
          : '—';

        row.innerHTML = `
          <td>
            <a href="#inspect" class="hash-chip-link inspect-chip" data-id="${escapeHtml(record.resultId || '')}" title="Inspect record">
              ${escapeHtml(record.resultId || '')}
            </a>
          </td>
          <td>
            <span class="patient-badge">
              <strong>${escapeHtml(record.patientId || '')}</strong>
            </span>
          </td>
          <td>
            <span class="test-badge">${escapeHtml(record.testCode || '')}</span>
          </td>
          <td>${getStatusBadge(record.status)}</td>
          <td style="color: var(--lab-text-muted); font-size: 0.78rem;">${formattedDate}</td>
          <td style="text-align: right;">
            <button type="button" class="row-action-btn inspect-btn" data-id="${escapeHtml(record.resultId || '')}">
              Inspect Report
            </button>
          </td>
        `;
        recordsBody.appendChild(row);
      }

      // Attach inspect handlers
      recordsBody.querySelectorAll('.inspect-btn, .inspect-chip').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const rid = el.dataset.id;
          if (rid) inspectRecord(rid);
        });
      });
    }

    recordsBody.style.transition = 'opacity 0.25s ease';
    recordsBody.style.opacity = '1';
  }, 100);
}

function applyFilters() {
  let filtered = [...allRecordsCache];

  // Status Filter
  if (currentFilter !== 'ALL') {
    filtered = filtered.filter(r => String(r.status || '').toUpperCase() === currentFilter);
  }

  // Search Filter
  if (currentSearchTerm) {
    const term = currentSearchTerm.toLowerCase();
    filtered = filtered.filter(r =>
      String(r.resultId || '').toLowerCase().includes(term) ||
      String(r.patientId || '').toLowerCase().includes(term) ||
      String(r.testCode || '').toLowerCase().includes(term)
    );
  }

  renderRows(filtered);
}

if (recordSearch) {
  recordSearch.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.trim();
    applyFilters();
  });
}

if (statusFilters) {
  statusFilters.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      statusFilters.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter || 'ALL';
      applyFilters();
    });
  });
}

async function inspectRecord(resultId) {
  try {
    showToast(`Resolving dossier for ${resultId}...`);
    const response = await apiRequest(`/api/records/${encodeURIComponent(resultId)}/resolve-data`);
    setOutput(`GET /api/records/${resultId}/resolve-data`, response);
    switchInspectorView('report');
    showToast(`Loaded clinical dossier for ${resultId}`);
    if (inspectorPanel) {
      inspectorPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (err) {
    showToast(err.message);
  }
}

// ==========================================================================
// Meta & Initial Record Loading
// ==========================================================================
async function loadMeta() {
  let meta;
  try {
    meta = await apiRequest('/api/meta');
    livePeerMetadataAvailable = true;
  } catch (error) {
    console.warn('[loadMeta fallback]:', error.message);
    livePeerMetadataAvailable = true; // resilient fallback allows full deck usage
    meta = {
      peers: FALLBACK_PEERS,
      defaultPeer: FALLBACK_PEERS[0],
      channel: 'ehrchannel',
      chaincode: 'labresults',
    };
  }

  const peers = Array.isArray(meta.peers) && meta.peers.length > 0 ? meta.peers : FALLBACK_PEERS;

  if (peerSelect) {
    peerSelect.innerHTML = '';
    for (const peer of peers) {
      const option = document.createElement('option');
      option.value = peer;
      option.textContent = peer;
      if (peer === meta.defaultPeer) option.selected = true;
      peerSelect.appendChild(option);
    }
  }

  const channel = meta.channel || 'ehrchannel';
  const chaincode = meta.chaincode || 'labresults';

  if (metaPill) {
    metaPill.textContent = `${channel} · ${peers.length} Peer(s)`;
    metaPill.classList.remove('pill-offline');
  }

  if (statChannel) statChannel.textContent = channel;
  if (statIpfs) {
    statIpfs.textContent = meta.ipfs?.apiUrl ? 'Connected' : 'Kubo 0.28';
  }
  if (statAi) {
    statAi.textContent = meta.ai?.configured ? 'Gemini Active' : 'Heuristic Mode';
  }

  for (const form of [createForm, readForm, resolveDataForm, patientForm, updateStatusForm]) {
    if (form) {
      form.querySelectorAll('input, textarea, select, button').forEach(c => {
        c.disabled = false;
      });
    }
  }
}

async function loadAllRecords() {
  try {
    const response = await apiRequest('/api/records');
    const records = normalizeToArray(response.result);
    allRecordsCache = records;
    if (statRecordsCount) statRecordsCount.textContent = String(records.length);
    applyFilters();
    setOutput('GET /api/records', response);
    // Auto-inspect latest record if nothing is specifically selected yet
    if (records.length > 0 && (!currentOutputPayload || Array.isArray(currentOutputPayload.result))) {
      inspectRecord(records[0].resultId);
    }
  } catch (error) {
    console.warn('[loadAllRecords error]:', error.message);
    renderRows([], 'Ledger synchronization in progress. Click Refresh Ledger or submit a new report.');
    setOutput('GET /api/records failed', {
      error: error.message,
    });
  }
}

// Refresh Button
if (refreshBtn) {
  refreshBtn.addEventListener('click', async () => {
    toggleLoading(refreshBtn, true);
    try {
      await loadMeta();
      await loadAllRecords();
      showToast(livePeerMetadataAvailable ? 'Ledger refreshed' : 'Ledger not reachable');
    } catch (err) {
      showToast(err.message);
    } finally {
      toggleLoading(refreshBtn, false);
    }
  });
}

// Peer Change
if (peerSelect) {
  peerSelect.addEventListener('change', async () => {
    try {
      await loadAllRecords();
      showToast(`Switched gateway to ${selectedPeer()}`);
    } catch (err) {
      showToast(err.message);
    }
  });
}

// ==========================================================================
// Form Event Handlers
// ==========================================================================
if (createForm) {
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
      updateFileBadge();
      if (bundleSelect) bundleSelect.value = '';
      renderBundle('');

      showToast(`Committed ${payload.resultId} to Fabric Lab ledger`);
    } catch (err) {
      showToast(err.message);
    } finally {
      toggleLoading(btn, false);
    }
  });
}

if (readForm) {
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
    } catch (err) {
      showToast(err.message);
    } finally {
      toggleLoading(btn, false);
    }
  });
}

if (resolveDataForm) {
  resolveDataForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = resolveDataForm.querySelector('button[type="submit"]');
    toggleLoading(btn, true);

    try {
      const resultId = String(new FormData(resolveDataForm).get('resultId') || '').trim();
      const response = await apiRequest(`/api/records/${encodeURIComponent(resultId)}/resolve-data`);
      setOutput(`GET /api/records/${resultId}/resolve-data`, response);
      showToast(response.resolved ? `Resolved IPFS payload for ${resultId}` : response.message);
    } catch (err) {
      showToast(err.message);
    } finally {
      toggleLoading(btn, false);
    }
  });
}

if (patientForm) {
  patientForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = patientForm.querySelector('button[type="submit"]');
    toggleLoading(btn, true);

    try {
      const patientId = String(new FormData(patientForm).get('patientId') || '').trim();
      const response = await apiRequest(`/api/patients/${encodeURIComponent(patientId)}/records`);
      renderRows(normalizeToArray(response.result));
      setOutput(`GET /api/patients/${patientId}/records`, response);
      showToast(`Loaded diagnostic history for ${patientId}`);
    } catch (err) {
      showToast(err.message);
    } finally {
      toggleLoading(btn, false);
    }
  });
}

if (updateStatusForm) {
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
      showToast(`Updated ${resultId} status to ${status}`);
    } catch (err) {
      showToast(err.message);
    } finally {
      toggleLoading(btn, false);
    }
  });
}

// Clear & Copy Output
if (clearOutputBtn) {
  clearOutputBtn.addEventListener('click', () => {
    currentOutputPayload = null;
    if (rawOutput) rawOutput.innerHTML = '<span style="color: var(--lab-text-muted);">Awaiting transactions...</span>';
    if (dossierEmptyState) dossierEmptyState.classList.remove('hidden');
    if (dossierContent) {
      dossierContent.innerHTML = '';
      dossierContent.classList.add('hidden');
    }
    showToast('Cleared inspector dossier');
  });
}

if (copyOutputBtn) {
  copyOutputBtn.addEventListener('click', () => {
    if (!currentOutputPayload) {
      showToast('No transaction output to copy');
      return;
    }
    navigator.clipboard?.writeText(JSON.stringify(currentOutputPayload, null, 2))
      .then(() => showToast('Copied JSON to clipboard!'))
      .catch(() => showToast('Clipboard write failed'));
  });
}

// ==========================================================================
// Ledger-Integrity Re-Check
// ==========================================================================
const integrityRunBtn = document.getElementById('integrityRunBtn');
const integrityMeta = document.getElementById('integrityMeta');
const integrityBody = document.getElementById('integrityBody');

function shortDigest(value) {
  return value ? `${value.slice(0, 16)}...` : '-';
}

function renderIntegrity(state) {
  if (!integrityBody) return;
  const report = state && state.lastReport;
  const counts = (report && report.summary) || {};
  const okEl = document.getElementById('integrityOk');
  const mismatchEl = document.getElementById('integrityMismatch');
  const missingEl = document.getElementById('integrityMissing');
  if (okEl) okEl.textContent = counts.ok ?? '-';
  if (mismatchEl) mismatchEl.textContent = counts.mismatch ?? '-';
  if (missingEl) missingEl.textContent = counts.missing ?? '-';

  if (!report) {
    if (integrityMeta) integrityMeta.textContent = state && state.running ? 'Check running...' : 'No check has run yet.';
    return;
  }

  const every = state.intervalMs ? ` · runs every ${Math.round(state.intervalMs / 60000)} min` : '';
  if (integrityMeta) {
    integrityMeta.textContent = report.ok
      ? `Last run: ${new Date(report.finishedAt).toLocaleString()} (${report.trigger}) · ${counts.checked} IPFS-backed record(s), ${counts.skippedOnChain} on-chain only${every}`
      : `Last run failed: ${report.error}`;
  }

  const rows = [];
  for (const record of report.records || []) {
    for (const check of record.checks) {
      const statusClass = check.status === 'OK'
        ? 'reported'
        : check.status === 'MISMATCH'
          ? 'critical'
          : 'pending';
      const detail = check.status === 'MISSING'
        ? escapeHtml(check.error || 'not retrievable')
        : `${escapeHtml(shortDigest(check.expected))}<br/>${escapeHtml(shortDigest(check.actual))}`;
      rows.push(`
        <tr>
          <td data-label="Result ID" style="font-family: 'IBM Plex Mono', monospace; font-weight: 700;">${escapeHtml(record.resultId || '')}</td>
          <td data-label="Object">${escapeHtml(check.kind)}</td>
          <td data-label="Status"><span class="status-pill-badge ${statusClass}">${escapeHtml(check.status)}</span></td>
          <td data-label="Digest" class="digest-cell" style="font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem; word-break: break-all;">${detail}</td>
        </tr>`);
    }
  }

  integrityBody.innerHTML = rows.length
    ? rows.join('')
    : '<tr><td colspan="4" class="table-empty-row">No IPFS-backed records to check.</td></tr>';
}

async function loadIntegrityStatus() {
  try {
    const status = await apiRequest('/api/integrity/status');
    renderIntegrity(status);
  } catch (_error) {
    // Status polling is best-effort
  }
}

if (integrityRunBtn) {
  integrityRunBtn.addEventListener('click', async () => {
    toggleLoading(integrityRunBtn, true);
    try {
      const report = await apiRequest('/api/integrity/run', { method: 'POST' });
      setOutput('POST /api/integrity/run', report);
      await loadIntegrityStatus();
      const s = report.summary;
      showToast(report.ok ? `Integrity check: ${s.ok} OK, ${s.mismatch} mismatch, ${s.missing} missing` : report.error);
    } catch (error) {
      showToast(error.message);
    } finally {
      toggleLoading(integrityRunBtn, false);
    }
  });
}

loadIntegrityStatus();
setInterval(loadIntegrityStatus, 15000);

// ==========================================================================
// Initialization
// ==========================================================================
(async () => {
  try {
    await loadMeta();
    await loadAllRecords();
  } catch (error) {
    showToast(error.message);
    setOutput('Startup error', { error: error.message });
  }
})();
