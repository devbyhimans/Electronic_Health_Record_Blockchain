'use strict';

const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate, requireRole } = require('../middleware/auth');
const { peerContext }  = require('../middleware/peerContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const { fetchByCID, pinJSON } = require('../fabric/ipfsClient');
const logger = require('../config/logger');

const PROVIDER_ROLES = ['billingofficer', 'claimsauditor', 'insuranceofficer', 'provideradmin'];

// ── GET /claims — GetAllClaims from insurancechannel ──────────
router.get('/',
  authenticate, requireRole(...PROVIDER_ROLES), peerContext,
  wrap(async (req, res) => {
    const targetContract = req.insuranceContract || req.contract;
    try {
      const result = await targetContract.evaluateTransaction('ClaimsContract:GetAllClaims');
      const claims = parseResult(result);
      return res.json({ success: true, count: Array.isArray(claims) ? claims.length : 0, data: claims });
    } catch (err) {
      logger.warn('GetAllClaims fallback:', { error: err.message });
      return res.json({ success: true, count: 0, data: [] });
    }
  })
);

// ── GET /claims/:id — Get single claim by ID from insurancechannel ───
router.get('/:id',
  authenticate, requireRole(...PROVIDER_ROLES), peerContext,
  wrap(async (req, res, next) => {
    if (req.params.id === 'visits') return next(); // Fallthrough to visits subrouter if matched
    const targetContract = req.insuranceContract || req.contract;
    const onChain = parseResult(await targetContract.evaluateTransaction('ClaimsContract:GetClaim', req.params.id));
    const claimPacket = (onChain?.claimCID || onChain?.visitCID)
      ? await fetchByCID(onChain.claimCID || onChain.visitCID).catch(() => null)
      : null;
    return res.json({ success: true, data: { ...onChain, claimPacket } });
  })
);

// ── GET /claims/visits/:id ────────────────────────────────────
router.get('/visits/:id',
  authenticate, requireRole(...PROVIDER_ROLES), peerContext,
  wrap(async (req, res) => {
    const visitId = req.params.id;
    let insuranceClaim = null;
    if (req.insuranceContract) {
      try {
        insuranceClaim = parseResult(await req.insuranceContract.evaluateTransaction('ClaimsContract:GetClaim', visitId));
      } catch (_) {}
    }
    const onChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId));
    const clinical = onChain?.visitCID ? await fetchByCID(onChain.visitCID).catch(() => null) : null;
    return res.json({ success: true, data: { ...onChain, clinical, insuranceClaim } });
  })
);

// ── GET /claims/visits/:id/history ───────────────────────────
router.get('/visits/:id/history',
  authenticate, requireRole(...PROVIDER_ROLES), peerContext,
  wrap(async (req, res) => {
    const result = await req.contract.evaluateTransaction('VisitContract:GetVisitHistory', req.params.id);
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── Helper: Process SubmitClaim with Selective Disclosure ────
async function handleSubmitClaim(req, res, visitId) {
  const {
    claimId,
    claimAmount,
    policyId = 'POL-CARE-01',
    diagnosisCodes,
    procedureCodes,
    billItems,
    clinicalJustification,
  } = req.body;

  logger.info('SubmitClaim to insurancechannel', { visitId, claimId, claimAmount, userId: req.user.userId });

  // 1. Fetch clinical visit context from ehrchannel
  let onChainVisit = null;
  let clinical = null;
  try {
    onChainVisit = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId));
    if (onChainVisit?.visitCID) {
      clinical = await fetchByCID(onChainVisit.visitCID).catch(() => null);
    }
  } catch (err) {
    logger.warn('Could not load ehrchannel visit before claim submission:', { error: err.message });
  }

  const patientId = req.body.patientId || onChainVisit?.patientId || 'UNKNOWN';

  // 2. Build Selective Disclosure IPFS Packet (strips confidential notes, isolates insurance-relevant data)
  const claimPacket = {
    docType: 'SelectiveDisclosureClaimPacket',
    claimId,
    visitId,
    patientId,
    policyId,
    claimAmount: parseFloat(claimAmount),
    currency: 'INR',
    diagnosisCodes: diagnosisCodes || clinical?.diagnosis || ['Z00.00'],
    procedureCodes: procedureCodes || ['99213'],
    billItems: billItems || [
      { description: 'In-Hospital Clinical Consultation & Diagnostics', amount: parseFloat(claimAmount) }
    ],
    clinicalJustification: clinicalJustification || clinical?.chiefComplaint || 'Clinical evaluation and treatment protocol',
    confidentialityDisclosure: 'Selective Disclosure under HIPAA & DPDP Act: excludes psychotherapy notes and genetic markers.',
    submittedBy: {
      userId: req.user.userId,
      role: 'billingofficer',
      org: req.user.mspId || 'HospitalMSP',
    },
    submittedAt: new Date().toISOString(),
  };

  const claimCID = await pinJSON(claimPacket, `claim-${claimId}-${visitId}.json`);

  // 3. Submit transaction to insurancechannel
  const targetContract = req.insuranceContract || req.contract;
  const result = await targetContract.submitTransaction(
    'ClaimsContract:SubmitClaim',
    visitId,
    claimId,
    String(claimAmount),
    claimCID,
    patientId,
    policyId
  );

  // 4. Update visit forwarding log on ehrchannel for clinical traceability
  if (clinical) {
    try {
      clinical.forwardingLog = clinical.forwardingLog || [];
      clinical.forwardingLog.push({
        action: 'CLAIM_SUBMITTED',
        claimId,
        claimCID,
        channel: 'insurancechannel',
        from: req.user.userId,
        fromRole: 'billingofficer',
        notes: `Claim ${claimId} submitted for ₹${claimAmount} on insurancechannel`,
        timestamp: new Date().toISOString(),
      });
      clinical.updatedAt = new Date().toISOString();
      const updatedVisitCID = await pinJSON(clinical, `visit-${visitId}-claim-logged.json`);
      // Update ehrchannel if ClaimsContract is present
      await req.contract.submitTransaction(
        'ClaimsContract:SubmitClaim',
        visitId,
        claimId,
        String(claimAmount),
        updatedVisitCID
      ).catch(e => logger.debug('ehrchannel claim stub sync note:', { message: e.message }));
    } catch (e) {
      logger.warn('Could not log claim to ehrchannel visit:', { error: e.message });
    }
  }

  return res.status(201).json({
    success: true,
    channel: 'insurancechannel',
    claimCID,
    data: parseResult(result),
  });
}

// ── POST /claims/visits/:id/submit ───────────────────────────
router.post('/visits/:id/submit',
  authenticate, requireRole('billingofficer'), peerContext,
  [
    param('id').trim().notEmpty(),
    body('claimId').trim().notEmpty().withMessage('claimId required'),
    body('claimAmount').isFloat({ gt: 0 }).withMessage('claimAmount must be positive number'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    return handleSubmitClaim(req, res, req.params.id);
  })
);

// ── POST /claims/submit ──────────────────────────────────────
router.post('/submit',
  authenticate, requireRole('billingofficer'), peerContext,
  [
    body('visitId').trim().notEmpty().withMessage('visitId required'),
    body('claimId').trim().notEmpty().withMessage('claimId required'),
    body('claimAmount').isFloat({ gt: 0 }).withMessage('claimAmount must be positive number'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    return handleSubmitClaim(req, res, req.body.visitId);
  })
);

// ── Helper: Process AuditClaim ───────────────────────────────
async function handleAuditClaim(req, res, targetId) {
  const { auditNotes = 'Audited & Verified' } = req.body;
  logger.info('AuditClaim on insurancechannel', { targetId, userId: req.user.userId });

  const targetContract = req.insuranceContract || req.contract;

  // Retrieve current claim from insurancechannel
  let currentClaim = null;
  try {
    currentClaim = parseResult(await targetContract.evaluateTransaction('ClaimsContract:GetClaim', targetId));
  } catch (err) {
    logger.warn('GetClaim before audit note:', { error: err.message });
  }

  let newCID = currentClaim?.claimCID || currentClaim?.visitCID || '';
  if (newCID) {
    try {
      const packet = await fetchByCID(newCID);
      packet.auditHistory = packet.auditHistory || [];
      packet.auditHistory.push({
        auditedBy: req.user.userId,
        auditedAt: new Date().toISOString(),
        notes: auditNotes,
        status: 'AUDIT_PASSED',
      });
      packet.updatedAt = new Date().toISOString();
      newCID = await pinJSON(packet, `claim-${currentClaim.claimId || targetId}-audited.json`);
    } catch (e) {
      logger.warn('IPFS audit update notice:', { error: e.message });
    }
  }

  const result = await targetContract.submitTransaction(
    'ClaimsContract:AuditClaim',
    targetId,
    auditNotes,
    newCID
  );

  return res.json({ success: true, channel: 'insurancechannel', data: parseResult(result) });
}

// ── PUT /claims/visits/:id/audit ─────────────────────────────
router.put('/visits/:id/audit',
  authenticate, requireRole('claimsauditor'), peerContext,
  [
    param('id').trim().notEmpty(),
    body('auditNotes').trim().notEmpty().withMessage('auditNotes required'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    return handleAuditClaim(req, res, req.params.id);
  })
);

// ── PUT /claims/:id/audit ────────────────────────────────────
router.put('/:id/audit',
  authenticate, requireRole('claimsauditor'), peerContext,
  [
    param('id').trim().notEmpty(),
    body('auditNotes').trim().notEmpty().withMessage('auditNotes required'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    return handleAuditClaim(req, res, req.params.id);
  })
);

// ── Helper: Process ProcessClaim (Adjudication) ──────────────
async function handleProcessClaim(req, res, targetId) {
  const { decision, reason = '' } = req.body;
  const dec = decision.toUpperCase();
  logger.info('ProcessClaim on insurancechannel', { targetId, decision: dec, userId: req.user.userId });

  const targetContract = req.insuranceContract || req.contract;

  let currentClaim = null;
  try {
    currentClaim = parseResult(await targetContract.evaluateTransaction('ClaimsContract:GetClaim', targetId));
  } catch (err) {
    logger.warn('GetClaim before process note:', { error: err.message });
  }

  const claimTotal = currentClaim?.claimAmount ? parseFloat(currentClaim.claimAmount) : 0;
  let approvedAmount = req.body.approvedAmount !== undefined ? parseFloat(req.body.approvedAmount) : undefined;
  let copayAmount = req.body.copayAmount !== undefined ? parseFloat(req.body.copayAmount) : undefined;

  // Smart Policy Adjudication Defaults if not specified
  if (dec === 'APPROVED') {
    if (approvedAmount === undefined) {
      copayAmount = Math.round(claimTotal * 0.15); // Standard 15% co-pay
      approvedAmount = Math.max(0, claimTotal - copayAmount);
    } else if (copayAmount === undefined) {
      copayAmount = Math.max(0, claimTotal - approvedAmount);
    }
  } else if (dec === 'REJECTED') {
    approvedAmount = 0;
    copayAmount = 0;
  }

  let newCID = currentClaim?.claimCID || currentClaim?.visitCID || '';
  if (newCID) {
    try {
      const packet = await fetchByCID(newCID);
      packet.adjudication = {
        decision: dec,
        reason: reason || (dec === 'APPROVED' ? 'Policy coverage verified, claim approved' : 'Rejected per policy terms'),
        approvedAmount,
        copayAmount,
        processedBy: req.user.userId,
        processedAt: new Date().toISOString(),
        settlementStatus: dec === 'REJECTED' ? 'REJECTED' : 'READY_FOR_SETTLEMENT',
      };
      packet.updatedAt = new Date().toISOString();
      newCID = await pinJSON(packet, `claim-${currentClaim.claimId || targetId}-${dec.toLowerCase()}.json`);
    } catch (e) {
      logger.warn('IPFS process update notice:', { error: e.message });
    }
  }

  const result = await targetContract.submitTransaction(
    'ClaimsContract:ProcessClaim',
    targetId,
    dec,
    reason,
    newCID,
    approvedAmount !== undefined ? String(approvedAmount) : '',
    copayAmount !== undefined ? String(copayAmount) : ''
  );

  return res.json({
    success: true,
    channel: 'insurancechannel',
    adjudication: {
      decision: dec,
      approvedAmount,
      copayAmount,
    },
    data: parseResult(result),
  });
}

// ── PUT /claims/visits/:id/process ───────────────────────────
router.put('/visits/:id/process',
  authenticate, requireRole('insuranceofficer'), peerContext,
  [
    param('id').trim().notEmpty(),
    body('decision').trim().toUpperCase().isIn(['APPROVED', 'REJECTED', 'PARTIAL_APPROVAL'])
      .withMessage('decision must be APPROVED, REJECTED, or PARTIAL_APPROVAL'),
    body('reason').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    return handleProcessClaim(req, res, req.params.id);
  })
);

// ── PUT /claims/:id/process ──────────────────────────────────
router.put('/:id/process',
  authenticate, requireRole('insuranceofficer'), peerContext,
  [
    param('id').trim().notEmpty(),
    body('decision').trim().toUpperCase().isIn(['APPROVED', 'REJECTED', 'PARTIAL_APPROVAL'])
      .withMessage('decision must be APPROVED, REJECTED, or PARTIAL_APPROVAL'),
    body('reason').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    return handleProcessClaim(req, res, req.params.id);
  })
);

module.exports = router;
