// CareGrid NITW - Insurance & TPA Claims Deck Frontend Logic

(function() {
  'use strict';

  // API Endpoints
  // When accessed via Nginx /insurance/, the API is at /api/hospital/ext
  // When accessed directly at :4004/insurance/, the API is at root ''
  const IS_NGINX = window.location.pathname.startsWith('/insurance');
  const API_BASE = IS_NGINX ? '/api/hospital/ext' : '';

  // DOM Elements - Views
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');

  // DOM Elements - Login View
  const loginForm = document.getElementById('login-form');
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const btnTogglePassword = document.getElementById('btn-toggle-password');
  const loginErrorMsg = document.getElementById('login-error-msg');
  const btnLoginSubmit = document.getElementById('btn-do-login');
  const presetCards = document.querySelectorAll('.role-preset-card');

  // DOM Elements - Topbar & Profile
  const dashBrandTitle = document.getElementById('dash-brand-title');
  const dashBrandSubtitle = document.getElementById('dash-brand-subtitle');
  const userAvatarIcon = document.getElementById('user-avatar-icon');
  const userDisplayName = document.getElementById('user-display-name');
  const userDisplayOrg = document.getElementById('user-display-org');
  const btnLogout = document.getElementById('btn-logout');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const roleScopeBanner = document.getElementById('role-scope-banner');
  const roleBannerIcon = document.getElementById('role-banner-icon');
  const roleBannerText = document.getElementById('role-banner-text');

  // DOM Elements - Dashboard Queue & Filters
  const claimsPaneTitle = document.getElementById('claims-pane-title');
  const claimsQueueList = document.getElementById('claims-queue-list');
  const claimsCountBadge = document.getElementById('claims-count-badge');
  const btnOpenSubmitModal = document.getElementById('btn-open-submit-modal');
  const btnRefreshClaims = document.getElementById('btn-refresh-claims');
  const searchInput = document.getElementById('claims-search-input');
  const filterTabs = document.querySelectorAll('.filter-tab');

  // DOM Elements - KPIs
  const kpiTotalClaims = document.getElementById('kpi-total-claims');
  const kpiPendingClaims = document.getElementById('kpi-pending-claims');
  const kpiApprovedValue = document.getElementById('kpi-approved-value');
  const kpiLabelPending = document.getElementById('kpi-label-pending');

  // DOM Elements - Dossier Details
  const dossierEmpty = document.getElementById('dossier-empty');
  const dossierContent = document.getElementById('dossier-content');
  const detailClaimId = document.getElementById('detail-claim-id');
  const detailStatusBadge = document.getElementById('detail-status-badge');
  const detailVisitId = document.getElementById('detail-visit-id');
  const detailPatientId = document.getElementById('detail-patient-id');
  const detailPolicyId = document.getElementById('detail-policy-id');
  const detailClaimAmount = document.getElementById('detail-claim-amount');
  const detailDisclosureNotice = document.getElementById('detail-disclosure-notice');
  const detailDiagnosisCodes = document.getElementById('detail-diagnosis-codes');
  const detailProcedureCodes = document.getElementById('detail-procedure-codes');
  const detailClinicalJustification = document.getElementById('detail-clinical-justification');
  const detailBillItems = document.getElementById('detail-bill-items');
  const detailSummaryClaimed = document.getElementById('detail-summary-claimed');
  const detailSummaryCopay = document.getElementById('detail-summary-copay');
  const detailSummaryApproved = document.getElementById('detail-summary-approved');
  const detailSummaryReasonRow = document.getElementById('detail-summary-reason-row');
  const detailSummaryReason = document.getElementById('detail-summary-reason');
  const detailSubmittedBy = document.getElementById('detail-submitted-by');
  const detailAuditedBy = document.getElementById('detail-audited-by');
  const detailIpfsLink = document.getElementById('detail-ipfs-link');
  const rawLedgerJson = document.getElementById('raw-ledger-json');
  const btnToggleJson = document.getElementById('btn-toggle-json');
  const btnCopyCid = document.getElementById('btn-copy-cid');
  const actionBannerText = document.getElementById('action-banner-text');
  const actionButtonsWrap = document.getElementById('action-buttons-wrap');

  // DOM Elements - Modals
  const modalSubmitClaim = document.getElementById('modal-submit-claim');
  const modalAuditClaim = document.getElementById('modal-audit-claim');
  const modalProcessClaim = document.getElementById('modal-process-claim');
  const formSubmitClaim = document.getElementById('form-submit-claim');
  const formAuditClaim = document.getElementById('form-audit-claim');
  const formProcessClaim = document.getElementById('form-process-claim');
  const toast = document.getElementById('toast');

  // Session State
  let currentUser = null;   // { username, role, mspId, peer }
  let currentToken = null;  // JWT string
  let allClaims = [];
  let selectedClaimId = null;
  let activeFilter = 'ALL';
  let searchTerm = '';

  // Role Metadata Config
  const ROLE_CONFIG = {
    insuranceofficer: {
      title: 'Senior Claims Adjudicator',
      org: 'ProviderMSP · Insurance Adjudication',
      icon: '⚖️',
      brandTitle: 'CareGrid Claims Adjudication Console',
      brandSubtitle: 'HYPERLEDGER FABRIC DUAL-CHANNEL CLAIMS ENGINE · PROVIDERMSP',
      banner: 'Senior Adjudicator Mode: Reviewing claims that passed medical audit for final policy payout determination and deductible co-pay settlement.',
      canSubmit: false,
      paneTitle: 'Adjudication Queue',
      pendingLabel: 'Pending Settlement',
      defaultFilter: 'UNDER_AUDIT'
    },
    claimsauditor: {
      title: 'Medical Claims Auditor',
      org: 'ProviderMSP · Compliance & Medical Audit',
      icon: '🔍',
      brandTitle: 'CareGrid Medical Audit & Compliance Console',
      brandSubtitle: 'CLINICAL EVIDENCE VERIFICATION · PROVIDERMSP',
      banner: 'Medical Auditor Mode: Inspecting submitted ICD-10 diagnostic evidence, hospital bills, and CPT procedure records on IPFS.',
      canSubmit: false,
      paneTitle: 'Medical Audit Queue',
      pendingLabel: 'Awaiting Audit',
      defaultFilter: 'SUBMITTED'
    },
    billingofficer: {
      title: 'Hospital Billing Officer',
      org: 'HospitalMSP · Inpatient & Outpatient Billing',
      icon: '🩺',
      brandTitle: 'Hospital Billing & Claims Submission Console',
      brandSubtitle: 'SELECTIVE DISCLOSURE CLAIM PACKETS · HOSPITALMSP',
      banner: 'Hospital Billing Mode: Finalizing hospital clinical visits, creating selective disclosure packets, and submitting to insurancechannel.',
      canSubmit: true,
      paneTitle: 'Hospital Claims Queue',
      pendingLabel: 'Claims In Progress',
      defaultFilter: 'ALL'
    }
  };

  // ── Toast Notifications ───────────────────────────────────────────
  let toastTimer = null;
  function showToast(message, type = 'info') {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.style.display = 'block';
    if (type === 'error') {
      toast.style.borderLeftColor = 'var(--rose)';
    } else if (type === 'success') {
      toast.style.borderLeftColor = 'var(--emerald)';
    } else {
      toast.style.borderLeftColor = 'var(--primary)';
    }
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
  }

  // ── Authentication Check on Load ──────────────────────────────────
  function checkSession() {
    const savedToken = sessionStorage.getItem('caregrid_ins_token');
    const savedUser = sessionStorage.getItem('caregrid_ins_user');

    if (savedToken && savedUser) {
      try {
        currentToken = savedToken;
        currentUser = JSON.parse(savedUser);
        launchDashboard();
        return;
      } catch (e) {
        sessionStorage.clear();
      }
    }

    // Otherwise show Login
    showLoginView();
  }

  function showLoginView() {
    dashboardView.style.display = 'none';
    loginView.style.display = 'flex';
    loginErrorMsg.style.display = 'none';
  }

  function launchDashboard() {
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';

    applyRoleConfiguration();
    loadClaims();
  }

  // ── Role Setup in Dashboard ───────────────────────────────────────
  function applyRoleConfiguration() {
    const roleKey = currentUser?.role || 'insuranceofficer';
    const cfg = ROLE_CONFIG[roleKey] || ROLE_CONFIG.insuranceofficer;

    // Header branding
    dashBrandTitle.textContent = cfg.brandTitle;
    dashBrandSubtitle.textContent = cfg.brandSubtitle;

    // Profile card
    userAvatarIcon.textContent = cfg.icon;
    userDisplayName.textContent = currentUser?.username || roleKey;
    userDisplayOrg.textContent = `${cfg.title} · ${currentUser?.mspId || 'ProviderMSP'}`;

    // Scope Banner
    roleBannerIcon.textContent = cfg.icon;
    roleBannerText.innerHTML = `<strong>${cfg.title} View:</strong> ${cfg.banner}`;

    // Titles & Buttons
    claimsPaneTitle.textContent = cfg.paneTitle;
    kpiLabelPending.textContent = cfg.pendingLabel;
    btnOpenSubmitModal.style.display = cfg.canSubmit ? 'flex' : 'none';

    // Set initial filter based on role workflow
    activeFilter = cfg.defaultFilter;
    filterTabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-status') === activeFilter);
    });
  }

  // ── Login Handlers ────────────────────────────────────────────────
  // Preset role cards selection
  presetCards.forEach(card => {
    card.addEventListener('click', () => {
      presetCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      const user = card.getAttribute('data-user');
      loginUsername.value = user;
      loginPassword.value = 'recpw';
      loginErrorMsg.style.display = 'none';
    });
  });

  // Password visibility toggle
  btnTogglePassword.addEventListener('click', () => {
    const isPass = loginPassword.type === 'password';
    loginPassword.type = isPass ? 'text' : 'password';
    btnTogglePassword.textContent = isPass ? '🔒' : '👁️';
  });

  // Login Form Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorMsg.style.display = 'none';
    btnLoginSubmit.disabled = true;
    btnLoginSubmit.innerHTML = '<span>Authenticating...</span>';

    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!data.success || !data.data || !data.data.token) {
        throw new Error(data.error || 'Invalid credentials');
      }

      currentToken = data.data.token;
      currentUser = data.data.user || {
        username,
        role: username,
        mspId: username === 'billingofficer' ? 'HospitalMSP' : 'ProviderMSP'
      };

      // Persist in session
      sessionStorage.setItem('caregrid_ins_token', currentToken);
      sessionStorage.setItem('caregrid_ins_user', JSON.stringify(currentUser));

      showToast(`Signed in successfully as ${currentUser.username}`, 'success');
      launchDashboard();

    } catch (err) {
      loginErrorMsg.textContent = err.message || 'Authentication failed. Please check credentials.';
      loginErrorMsg.style.display = 'block';
    } finally {
      btnLoginSubmit.disabled = false;
      btnLoginSubmit.innerHTML = `
        <span>Sign In to Workstation</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      `;
    }
  });

  // Logout Handler
  btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('caregrid_ins_token');
    sessionStorage.removeItem('caregrid_ins_user');
    currentToken = null;
    currentUser = null;
    allClaims = [];
    selectedClaimId = null;

    showToast('Signed out of insurance workstation session.', 'info');
    showLoginView();
  });

  // ── Load Claims from Ledger ───────────────────────────────────────
  async function loadClaims() {
    claimsQueueList.innerHTML = `
      <div class="empty-loading-state">
        <div class="spinner"></div>
        <div>Querying insurancechannel ledger...</div>
      </div>
    `;

    try {
      const res = await fetch(`${API_BASE}/claims`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const data = await res.json();
      if (data.success) {
        allClaims = data.data || [];
        updateKPIs();
        renderClaimsList();
        if (selectedClaimId) {
          loadClaimDetail(selectedClaimId);
        } else if (allClaims.length > 0) {
          loadClaimDetail(allClaims[0].visitId || allClaims[0].claimId);
        } else {
          dossierEmpty.style.display = 'flex';
          dossierContent.style.display = 'none';
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          showToast('Session expired, please re-authenticate', 'error');
          showLoginView();
        } else {
          showToast(data.error || 'Failed to load claims', 'error');
        }
      }
    } catch (err) {
      console.error('Fetch claims error:', err);
      claimsQueueList.innerHTML = `<div class="empty-loading-state">Error connecting to Fabric: ${err.message}</div>`;
    }
  }

  // ── Update KPI Banners ────────────────────────────────────────────
  function updateKPIs() {
    kpiTotalClaims.textContent = allClaims.length;

    const pending = allClaims.filter(c => {
      const st = (c.status || c.claimStatus || '').toUpperCase();
      if (currentUser?.role === 'claimsauditor') {
        return st === 'SUBMITTED' || st === 'CLAIM_SUBMITTED';
      } else if (currentUser?.role === 'insuranceofficer') {
        return st === 'UNDER_AUDIT' || st === 'CLAIM_UNDER_AUDIT';
      }
      return st === 'SUBMITTED' || st === 'CLAIM_SUBMITTED' || st === 'UNDER_AUDIT' || st === 'CLAIM_UNDER_AUDIT';
    });
    kpiPendingClaims.textContent = pending.length;

    let totalApproved = 0;
    allClaims.forEach(c => {
      const st = (c.status || c.claimStatus || '').toUpperCase();
      if (st === 'APPROVED' || st === 'CLAIM_APPROVED') {
        totalApproved += parseFloat(c.approvedAmount || c.claimAmount || 0);
      }
    });
    kpiApprovedValue.textContent = `₹${totalApproved.toLocaleString('en-IN')}`;
  }

  // ── Render Claims Queue ───────────────────────────────────────────
  function renderClaimsList() {
    const filtered = allClaims.filter(claim => {
      const st = (claim.status || claim.claimStatus || '').toUpperCase();
      const matchFilter = (activeFilter === 'ALL') ||
        (activeFilter === 'SUBMITTED' && (st === 'SUBMITTED' || st === 'CLAIM_SUBMITTED')) ||
        (activeFilter === 'UNDER_AUDIT' && (st === 'UNDER_AUDIT' || st === 'CLAIM_UNDER_AUDIT')) ||
        (activeFilter === 'APPROVED' && (st === 'APPROVED' || st === 'CLAIM_APPROVED')) ||
        (activeFilter === 'REJECTED' && (st === 'REJECTED' || st === 'CLAIM_REJECTED'));

      if (!matchFilter) return false;
      if (!searchTerm) return true;

      const q = searchTerm.toLowerCase();
      return (claim.claimId && claim.claimId.toLowerCase().includes(q)) ||
             (claim.visitId && claim.visitId.toLowerCase().includes(q)) ||
             (claim.patientId && claim.patientId.toLowerCase().includes(q)) ||
             (claim.policyId && claim.policyId.toLowerCase().includes(q));
    });

    claimsCountBadge.textContent = filtered.length;

    if (filtered.length === 0) {
      claimsQueueList.innerHTML = `
        <div class="empty-loading-state">
          <div>No claims match the selected filter.</div>
        </div>
      `;
      return;
    }

    claimsQueueList.innerHTML = '';
    filtered.forEach(claim => {
      const id = claim.visitId || claim.claimId;
      const isSelected = id === selectedClaimId;
      const st = (claim.status || claim.claimStatus || 'SUBMITTED').replace('CLAIM_', '');
      const amount = parseFloat(claim.claimAmount || 0).toLocaleString('en-IN');
      const approved = claim.approvedAmount !== undefined ? `₹${parseFloat(claim.approvedAmount).toLocaleString('en-IN')}` : '--';

      const card = document.createElement('div');
      card.className = `claim-item-card ${isSelected ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="claim-card-top">
          <span class="claim-id-text">${claim.claimId || id}</span>
          <span class="status-badge ${st}">${st.replace('_', ' ')}</span>
        </div>
        <div class="claim-card-mid">
          <span>Patient: <strong>${claim.patientId || 'PAT-001'}</strong> • Visit: ${claim.visitId || id}</span>
          <span class="claim-amount-big">₹${amount}</span>
        </div>
        <div class="claim-card-bot">
          <span>Policy: ${claim.policyId || 'POL-CARE-PLUS'}</span>
          <span>Settlement: ${st === 'APPROVED' ? `<strong class="text-emerald">${approved}</strong>` : '--'}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.claim-item-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        loadClaimDetail(id);
      });

      claimsQueueList.appendChild(card);
    });
  }

  // ── Load & Display Claim Dossier ──────────────────────────────────
  async function loadClaimDetail(id) {
    selectedClaimId = id;
    if (!currentToken) return;

    try {
      const res = await fetch(`${API_BASE}/claims/${id}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const json = await res.json();
      if (!json.success || !json.data) {
        showToast('Claim details unavailable', 'error');
        return;
      }

      const claim = json.data;
      const packet = claim.claimPacket || {};
      const st = (claim.status || claim.claimStatus || 'SUBMITTED').replace('CLAIM_', '');

      dossierEmpty.style.display = 'none';
      dossierContent.style.display = 'block';

      // Header
      detailClaimId.textContent = claim.claimId || claim.visitId || id;
      detailStatusBadge.className = `status-badge ${st}`;
      detailStatusBadge.textContent = st.replace('_', ' ');
      detailVisitId.textContent = claim.visitId || id;
      detailPatientId.textContent = claim.patientId || packet.patientId || 'PAT-001';
      detailPolicyId.textContent = claim.policyId || packet.policyId || 'POL-CARE-PLUS';
      detailClaimAmount.textContent = `₹${parseFloat(claim.claimAmount || packet.claimAmount || 0).toLocaleString('en-IN')}`;

      // Privacy Notice
      detailDisclosureNotice.textContent = packet.confidentialityDisclosure ||
        'Confidential psychotherapy notes and non-pertinent medical records are excluded from this ledger channel.';

      // ICD-10 Codes
      detailDiagnosisCodes.innerHTML = '';
      const diagCodes = packet.diagnosisCodes || ['I20.0 (Unstable Angina)', 'R07.9 (Chest Pain)'];
      diagCodes.forEach(code => {
        const pill = document.createElement('span');
        pill.className = 'code-pill';
        pill.textContent = code;
        detailDiagnosisCodes.appendChild(pill);
      });

      // CPT Procedure Codes
      detailProcedureCodes.innerHTML = '';
      const procCodes = packet.procedureCodes || ['99223 (Initial Hospital Care)', '93000 (Electrocardiogram)'];
      procCodes.forEach(code => {
        const pill = document.createElement('span');
        pill.className = 'code-pill';
        pill.textContent = code;
        detailProcedureCodes.appendChild(pill);
      });

      // Clinical Justification
      detailClinicalJustification.textContent = packet.clinicalJustification ||
        'In-hospital clinical monitoring, diagnostic evaluation, and medical management protocol.';

      // Itemized Billing
      detailBillItems.innerHTML = '';
      const billItems = packet.billItems || [
        { description: 'In-Hospital Clinical Consultation & Diagnostics', amount: claim.claimAmount || 25000 }
      ];
      billItems.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${item.description || item.name || 'Clinical Care Charge'}</td>
          <td class="text-right">₹${parseFloat(item.amount || 0).toLocaleString('en-IN')}</td>
        `;
        detailBillItems.appendChild(tr);
      });

      // Payout / Adjudication Summary
      const claimedVal = parseFloat(claim.claimAmount || packet.claimAmount || 0);
      detailSummaryClaimed.textContent = `₹${claimedVal.toLocaleString('en-IN')}`;

      if (st === 'APPROVED') {
        const approvedVal = parseFloat(claim.approvedAmount !== undefined ? claim.approvedAmount : (packet.adjudication?.approvedAmount || claimedVal * 0.85));
        const copayVal = parseFloat(claim.copayAmount !== undefined ? claim.copayAmount : (packet.adjudication?.copayAmount || claimedVal - approvedVal));
        detailSummaryApproved.textContent = `₹${approvedVal.toLocaleString('en-IN')}`;
        detailSummaryCopay.textContent = `₹${copayVal.toLocaleString('en-IN')}`;
        detailSummaryReasonRow.style.display = 'block';
        detailSummaryReason.textContent = claim.claimReason || packet.adjudication?.reason || 'Standard comprehensive coverage verified.';
      } else if (st === 'REJECTED') {
        detailSummaryApproved.textContent = '₹0';
        detailSummaryCopay.textContent = '₹0';
        detailSummaryReasonRow.style.display = 'block';
        detailSummaryReason.textContent = claim.claimReason || packet.adjudication?.reason || 'Claim rejected per policy terms.';
      } else {
        detailSummaryApproved.textContent = 'Pending Adjudication';
        detailSummaryCopay.textContent = 'Pending Calculation';
        detailSummaryReasonRow.style.display = 'none';
      }

      // Format Dates Helper
      function fmtDate(iso) {
        if (!iso) return '--';
        try {
          const d = new Date(iso);
          return d.toLocaleString('en-IN', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
          });
        } catch { return iso; }
      }

      // ── Populate Provenance Stepper & State Machine ───────────────
      const step2Marker = document.getElementById('step-2-marker');
      const step2MarkerContent = document.getElementById('step-2-marker-content');
      const step2Time = document.getElementById('step-2-time');
      const step2Desc = document.getElementById('step-2-desc');
      const step2NoteBox = document.getElementById('step-2-note-box');
      const step2Notes = document.getElementById('step-2-notes');
      const step2CidBox = document.getElementById('step-2-cid-box');
      const step2CidLink = document.getElementById('step-2-cid-link');

      const step3Marker = document.getElementById('step-3-marker');
      const step3MarkerContent = document.getElementById('step-3-marker-content');
      const step3Time = document.getElementById('step-3-time');
      const step3Desc = document.getElementById('step-3-desc');
      const step3Stats = document.getElementById('step-3-stats');
      const step3Approved = document.getElementById('step-3-approved');
      const step3Copay = document.getElementById('step-3-copay');
      const step3CidBox = document.getElementById('step-3-cid-box');
      const step3CidLink = document.getElementById('step-3-cid-link');

      const stepperStateBadge = document.getElementById('stepper-state-badge');

      // Stage 1: Submission
      const step1Time = document.getElementById('step-1-time');
      const step1CidLink = document.getElementById('step-1-cid-link');
      const genesisCid = claim.cidHistory && claim.cidHistory[0] ? claim.cidHistory[0].cid : (claim.claimCID || 'bafkrei...');
      step1Time.textContent = fmtDate(claim.createdAt || claim.cidHistory?.[0]?.updatedAt);
      step1CidLink.textContent = genesisCid;
      step1CidLink.href = `http://localhost:8090/ipfs/${genesisCid}`;

      // Stage 2: Audit
      const isAudited = st === 'UNDER_AUDIT' || st === 'APPROVED' || st === 'REJECTED' || !!claim.auditedBy;
      if (isAudited) {
        step2Marker.className = 'stepper-marker completed';
        step2MarkerContent.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
        step2Time.textContent = fmtDate(claim.cidHistory?.[1]?.updatedAt || claim.updatedAt);
        step2Desc.textContent = `Medical necessity verified by ${claim.auditedBy || 'claimsauditor'}. Diagnostic lab tests and billed procedures correspond to ICD-10 criteria.`;
        if (claim.auditNotes) {
          step2NoteBox.style.display = 'flex';
          step2Notes.textContent = claim.auditNotes;
        } else {
          step2NoteBox.style.display = 'none';
        }
        const auditCid = claim.cidHistory?.[1]?.cid || claim.visitCID || genesisCid;
        step2CidBox.style.display = 'inline-flex';
        step2CidLink.textContent = auditCid;
        step2CidLink.href = `http://localhost:8090/ipfs/${auditCid}`;
      } else {
        step2Marker.className = 'stepper-marker active';
        step2MarkerContent.textContent = '2';
        step2Time.textContent = 'Pending';
        step2Desc.textContent = 'Awaiting clinical review and medical necessity sign-off by Claims Auditor.';
        step2NoteBox.style.display = 'none';
        step2CidBox.style.display = 'none';
      }

      // Stage 3: Adjudication / Settlement
      const isSettled = st === 'APPROVED' || st === 'REJECTED';
      if (isSettled) {
        step2Marker.className = 'stepper-marker completed';
        step3Marker.className = `stepper-marker completed ${st === 'REJECTED' ? 'rejected' : ''}`;
        step3MarkerContent.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
        step3Time.textContent = fmtDate(claim.processedAt || claim.updatedAt);
        step3Desc.textContent = st === 'APPROVED'
          ? `Settled by ${claim.processedBy || 'insuranceofficer'}. Policy limits and patient co-pay calculated. Ready for tokenized bank disbursement.`
          : `Claim REJECTED by ${claim.processedBy || 'insuranceofficer'}. Reason: ${claim.claimReason || 'Per policy exclusion terms'}.`;

        step3Stats.style.display = 'flex';
        const finalApproved = claim.approvedAmount !== undefined ? claim.approvedAmount : (claimedVal * 0.85);
        const finalCopay = claim.copayAmount !== undefined ? claim.copayAmount : (claimedVal - finalApproved);
        step3Approved.textContent = `₹${parseFloat(finalApproved).toLocaleString('en-IN')}`;
        step3Copay.textContent = `₹${parseFloat(finalCopay).toLocaleString('en-IN')}`;

        const settledCid = claim.cidHistory && claim.cidHistory.length > 2
          ? claim.cidHistory[claim.cidHistory.length - 1].cid
          : (claim.visitCID || genesisCid);
        step3CidBox.style.display = 'inline-flex';
        step3CidLink.textContent = settledCid;
        step3CidLink.href = `http://localhost:8090/ipfs/${settledCid}`;

        stepperStateBadge.textContent = '3 of 3 Stages Completed';
        stepperStateBadge.style.color = 'var(--emerald)';
      } else if (st === 'UNDER_AUDIT') {
        step3Marker.className = 'stepper-marker active';
        step3MarkerContent.textContent = '3';
        step3Time.textContent = 'In Progress';
        step3Desc.textContent = 'Claim passed medical audit. Awaiting Senior Insurance Officer to determine financial settlement and deductible split.';
        step3Stats.style.display = 'none';
        step3CidBox.style.display = 'none';
        stepperStateBadge.textContent = '2 of 3 Stages Completed';
        stepperStateBadge.style.color = 'var(--amber)';
      } else {
        step3Marker.className = 'stepper-marker';
        step3MarkerContent.textContent = '3';
        step3Time.textContent = 'Queued';
        step3Desc.textContent = 'Will be initiated after medical necessity audit passes.';
        step3Stats.style.display = 'none';
        step3CidBox.style.display = 'none';
        stepperStateBadge.textContent = '1 of 3 Stages Completed';
        stepperStateBadge.style.color = 'var(--text-muted)';
      }

      // ── Populate Digital Explanation of Benefits (EOB) ───────────
      document.getElementById('eob-claim-id').textContent = claim.claimId || claim.visitId || id;
      document.getElementById('eob-visit-id').textContent = claim.visitId || id;
      document.getElementById('eob-patient-id').textContent = claim.patientId || packet.patientId || 'PAT-001';
      document.getElementById('eob-policy-id').textContent = claim.policyId || packet.policyId || 'POL-CARE-PLUS';
      document.getElementById('eob-peer').textContent = 'peer0.provider.example.com:11051';

      const billedAmtFormatted = `₹${claimedVal.toLocaleString('en-IN')}`;
      document.getElementById('eob-billed-amount').textContent = billedAmtFormatted;
      document.getElementById('eob-eligible-amount').textContent = billedAmtFormatted;

      const eobSealTitle = document.getElementById('eob-seal-title');
      if (st === 'APPROVED') {
        eobSealTitle.textContent = 'LEDGER SETTLED';
        const finalApproved = claim.approvedAmount !== undefined ? claim.approvedAmount : (claimedVal * 0.85);
        const finalCopay = claim.copayAmount !== undefined ? claim.copayAmount : (claimedVal - finalApproved);
        document.getElementById('eob-copay-amount').textContent = `-₹${parseFloat(finalCopay).toLocaleString('en-IN')}`;
        document.getElementById('eob-net-amount').textContent = `₹${parseFloat(finalApproved).toLocaleString('en-IN')}`;
      } else if (st === 'REJECTED') {
        eobSealTitle.textContent = 'CLAIM REJECTED';
        document.getElementById('eob-copay-amount').textContent = '₹0.00';
        document.getElementById('eob-net-amount').textContent = '₹0.00 (Rejected)';
      } else {
        eobSealTitle.textContent = 'IN ADJUDICATION';
        document.getElementById('eob-copay-amount').textContent = 'Pending Calculation';
        document.getElementById('eob-net-amount').textContent = 'Pending Approval';
      }

      const activeCid = claim.visitCID || claim.claimCID || genesisCid;
      document.getElementById('eob-cid').textContent = activeCid;

      // Print button handler
      const btnPrintEob = document.getElementById('btn-print-eob');
      if (btnPrintEob) {
        btnPrintEob.onclick = () => window.print();
      }

      // Raw JSON State Drawer
      rawLedgerJson.textContent = JSON.stringify(claim, null, 2);

      // Render Role-Enforced Action Buttons
      renderActionBanner(claim);

    } catch (err) {
      console.error('Error loading claim details:', err);
    }
  }

  // ── Render Strict Role-Based Action Banner ────────────────────────
  function renderActionBanner(claim) {
    const st = (claim.status || claim.claimStatus || 'SUBMITTED').replace('CLAIM_', '');
    const role = currentUser?.role || 'insuranceofficer';
    actionButtonsWrap.innerHTML = '';

    if (st === 'SUBMITTED') {
      if (role === 'claimsauditor') {
        actionBannerText.textContent = 'Action Required: Verify clinical necessity and pass medical audit.';
        const btnAudit = document.createElement('button');
        btnAudit.className = 'btn-amber';
        btnAudit.textContent = '🔍 Audit & Verify Claim Evidence';
        btnAudit.onclick = () => openAuditModal(claim);
        actionButtonsWrap.appendChild(btnAudit);
      } else if (role === 'insuranceofficer') {
        actionBannerText.textContent = 'Status: Waiting for Medical Audit sign-off before financial adjudication.';
      } else {
        actionBannerText.textContent = 'Status: Claim submitted to insurancechannel. Pending auditor review.';
      }
    } else if (st === 'UNDER_AUDIT') {
      if (role === 'insuranceofficer') {
        actionBannerText.textContent = 'Action Required: Audit passed. Adjudicate payout and settle claim.';
        const btnProcess = document.createElement('button');
        btnProcess.className = 'btn-emerald';
        btnProcess.textContent = '⚖️ Adjudicate & Settle Payout';
        btnProcess.onclick = () => openProcessModal(claim);
        actionButtonsWrap.appendChild(btnProcess);
      } else if (role === 'claimsauditor') {
        actionBannerText.textContent = 'Status: Medical audit passed. Forwarded to Senior Adjudicator for settlement.';
      } else {
        actionBannerText.textContent = 'Status: Hospital claim passed medical audit. Pending insurance settlement.';
      }
    } else if (st === 'APPROVED') {
      actionBannerText.textContent = 'Completed: Claim approved and cryptographically settled on insurancechannel.';
    } else if (st === 'REJECTED') {
      actionBannerText.textContent = 'Completed: Claim rejected per policy terms.';
    }
  }

  // ── Modals Handling ───────────────────────────────────────────────
  function openAuditModal(claim) {
    document.getElementById('audit-target-id').value = claim.visitId || claim.claimId;
    const preview = document.getElementById('audit-summary-preview');
    preview.innerHTML = `
      <div style="background:var(--bg-tertiary); padding:0.75rem; border-radius:6px; font-size:0.82rem;">
        <div><strong>Claim ID:</strong> ${claim.claimId || claim.visitId} • <strong>Amount:</strong> ₹${parseFloat(claim.claimAmount || 0).toLocaleString('en-IN')}</div>
        <div style="margin-top:4px;"><strong>Patient:</strong> ${claim.patientId || 'PAT-001'} • <strong>Policy:</strong> ${claim.policyId || 'POL-CARE-PLUS'}</div>
      </div>
    `;
    modalAuditClaim.style.display = 'flex';
  }

  function openProcessModal(claim) {
    const targetId = claim.visitId || claim.claimId;
    document.getElementById('process-target-id').value = targetId;

    const total = parseFloat(claim.claimAmount || 0);
    const standardCopay = Math.round(total * 0.15);
    const standardApproved = total - standardCopay;

    const inpApproved = document.getElementById('inp-approved-amount');
    const inpCopay = document.getElementById('inp-copay-amount');

    inpApproved.value = standardApproved;
    inpCopay.value = standardCopay;

    inpApproved.oninput = () => {
      inpCopay.value = Math.max(0, total - parseFloat(inpApproved.value || 0));
    };

    modalProcessClaim.style.display = 'flex';
  }

  // Close modals
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      document.getElementById(modalId).style.display = 'none';
    });
  });

  // ── Form Submissions ──────────────────────────────────────────────
  // 1. Submit Claim Form (Hospital Billing)
  formSubmitClaim.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('btn-submit-claim-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Pinning IPFS & Anchoring...';

    const visitId = document.getElementById('inp-visit-id').value.trim();
    const claimId = document.getElementById('inp-claim-id').value.trim();
    const patientId = document.getElementById('inp-patient-id').value.trim();
    const policyId = document.getElementById('inp-policy-id').value.trim();
    const claimAmount = parseFloat(document.getElementById('inp-claim-amount').value);
    const diagRaw = document.getElementById('inp-diagnosis').value;
    const procRaw = document.getElementById('inp-procedures').value;
    const clinicalJustification = document.getElementById('inp-justification').value.trim();

    const diagnosisCodes = diagRaw.split(',').map(s => s.trim()).filter(Boolean);
    const procedureCodes = procRaw.split(',').map(s => s.trim()).filter(Boolean);

    try {
      const res = await fetch(`${API_BASE}/claims/visits/${visitId}/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          claimId,
          patientId,
          policyId,
          claimAmount,
          diagnosisCodes,
          procedureCodes,
          clinicalJustification
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast(`Claim ${claimId} successfully submitted on insurancechannel!`, 'success');
        modalSubmitClaim.style.display = 'none';
        selectedClaimId = visitId;
        await loadClaims();
      } else {
        showToast(data.error || 'Submission failed', 'error');
      }
    } catch (err) {
      showToast(`Network error: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Commit to Ledger →';
    }
  });

  // 2. Audit Claim Form (Medical Claims Auditor)
  formAuditClaim.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('btn-audit-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Updating IPFS & Ledger...';

    const targetId = document.getElementById('audit-target-id').value;
    const auditNotes = document.getElementById('inp-audit-notes').value.trim();

    try {
      const res = await fetch(`${API_BASE}/claims/visits/${targetId}/audit`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ auditNotes })
      });

      const data = await res.json();
      if (data.success) {
        showToast(`Claim ${targetId} verified by Claims Auditor!`, 'success');
        modalAuditClaim.style.display = 'none';
        await loadClaims();
      } else {
        showToast(data.error || 'Audit update failed', 'error');
      }
    } catch (err) {
      showToast(`Network error: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Pass Audit & Forward →';
    }
  });

  // 3. Process Claim Form (Senior Adjudicator)
  formProcessClaim.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('btn-process-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Committing Adjudication...';

    const targetId = document.getElementById('process-target-id').value;
    const decision = document.querySelector('input[name="inp-decision"]:checked').value;
    const approvedAmount = parseFloat(document.getElementById('inp-approved-amount').value || 0);
    const copayAmount = parseFloat(document.getElementById('inp-copay-amount').value || 0);
    const reason = document.getElementById('inp-adjudication-reason').value.trim();

    try {
      const res = await fetch(`${API_BASE}/claims/visits/${targetId}/process`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision,
          approvedAmount,
          copayAmount,
          reason
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast(`Claim ${targetId} settled: ${decision}!`, 'success');
        modalProcessClaim.style.display = 'none';
        await loadClaims();
      } else {
        showToast(data.error || 'Adjudication failed', 'error');
      }
    } catch (err) {
      showToast(`Network error: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Commit Adjudication →';
    }
  });

  // ── Event Listeners ───────────────────────────────────────────────
  // Refresh
  btnRefreshClaims.addEventListener('click', () => {
    loadClaims();
    showToast('Refreshing claims from ledger...', 'info');
  });

  // Open Submit Modal (Billing Officer)
  btnOpenSubmitModal.addEventListener('click', () => {
    const rand = Math.floor(100 + Math.random() * 900);
    document.getElementById('inp-visit-id').value = `VIS-INS-${rand}`;
    document.getElementById('inp-claim-id').value = `CLM-INS-${rand}`;
    modalSubmitClaim.style.display = 'flex';
  });

  // Filter tabs
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.getAttribute('data-status');
      renderClaimsList();
    });
  });

  // Search input
  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    renderClaimsList();
  });

  // Raw JSON toggle
  btnToggleJson.addEventListener('click', () => {
    const isHidden = rawLedgerJson.style.display === 'none';
    rawLedgerJson.style.display = isHidden ? 'block' : 'none';
    btnToggleJson.querySelector('.chevron').style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  });

  // Theme Toggle
  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.dataset.theme;
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('ehr_appearance', nextTheme);
  });

  // ── Start Application ─────────────────────────────────────────────
  checkSession();

})();
