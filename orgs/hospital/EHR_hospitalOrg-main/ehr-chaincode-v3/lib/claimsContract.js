'use strict';

const { Contract } = require('fabric-contract-api');
const {
  requireRole,
  now,
  getState,
  putState,
} = require('./accessControl');
const { visitKey, VISIT_STATUS } = require('./visitContract');

function claimKey(claimId) {
  return `CLAIM:${claimId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ClaimsContract — multi-channel insurance claim lifecycle.
// Supports both single-channel (ehrchannel) and dedicated dual-channel (insurancechannel).
// ─────────────────────────────────────────────────────────────────────────────

class ClaimsContract extends Contract {
  constructor() {
    super('ClaimsContract');
  }

  // ── SubmitClaim ───────────────────────────────────────────────────────────
  // Billing officer submits an insurance claim.
  // Supports optional patientId & policyId for dual-channel (insurancechannel).
  async SubmitClaim(ctx, visitId, claimId, claimAmount, visitCID, patientId, policyId) {
    const { userId } = requireRole(ctx, 'billingofficer');

    if (!visitId || !claimId || !claimAmount) {
      throw new Error('visitId, claimId, and claimAmount are required');
    }

    const amount = parseFloat(claimAmount);
    if (isNaN(amount) || amount <= 0) throw new Error('claimAmount must be a positive number');

    let visit = await getState(ctx, visitKey(visitId));
    if (!visit) {
      // In dual-channel architecture: initialize claim record on insurancechannel
      visit = {
        docType: 'claim',
        visitId,
        claimId,
        patientId: patientId || 'UNKNOWN',
        policyId: policyId || 'POL-STANDARD',
        claimAmount: amount,
        claimSubmittedBy: userId,
        claimStatus: 'SUBMITTED',
        status: VISIT_STATUS.CLAIM_SUBMITTED,
        channel: 'insurancechannel',
        claimCID: visitCID || '',
        visitCID: visitCID || '',
        cidHistory: visitCID ? [{ cid: visitCID, updatedBy: userId, updatedAt: now(ctx), reason: 'CLAIM_SUBMITTED' }] : [],
        createdAt: now(ctx),
        updatedAt: now(ctx)
      };
    } else {
      visit.claimId          = claimId;
      visit.claimAmount      = amount;
      visit.claimSubmittedBy = userId;
      visit.claimStatus      = 'SUBMITTED';
      visit.status           = VISIT_STATUS.CLAIM_SUBMITTED;
      if (policyId) visit.policyId = policyId;

      if (visitCID) {
        visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(ctx), reason: 'CLAIM_SUBMITTED' });
        visit.claimCID = visitCID;
        visit.visitCID = visitCID;
      }
      visit.updatedAt = now(ctx);
    }

    await putState(ctx, visitKey(visitId), visit);
    await putState(ctx, claimKey(claimId), { docType: 'claimRef', claimId, visitId, status: visit.status, amount });
    return JSON.stringify(visit);
  }

  // ── AuditClaim ────────────────────────────────────────────────────────────
  // Claims auditor reviews the claim. Status → CLAIM_UNDER_AUDIT.
  async AuditClaim(ctx, visitId, auditNotes, visitCID) {
    const { userId } = requireRole(ctx, 'claimsauditor');

    let visit = await getState(ctx, visitKey(visitId));
    if (!visit) {
      const ref = await getState(ctx, claimKey(visitId));
      if (ref && ref.visitId) visit = await getState(ctx, visitKey(ref.visitId));
    }
    if (!visit) throw new Error(`Claim or visit not found: ${visitId}`);

    if (visit.status !== VISIT_STATUS.CLAIM_SUBMITTED && visit.claimStatus !== 'SUBMITTED') {
      throw new Error(`Claim must be in SUBMITTED state to audit. Current: '${visit.status || visit.claimStatus}'`);
    }
    if (!auditNotes || auditNotes.trim() === '') throw new Error('auditNotes required');

    visit.auditedBy   = userId;
    visit.auditNotes  = auditNotes;
    visit.claimStatus = 'UNDER_AUDIT';
    visit.status      = VISIT_STATUS.CLAIM_UNDER_AUDIT;
    visit.updatedAt   = now(ctx);

    if (visitCID) {
      visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(ctx), reason: 'CLAIM_AUDITED' });
      visit.visitCID = visitCID;
    }

    await putState(ctx, visitKey(visit.visitId), visit);
    if (visit.claimId) {
      await putState(ctx, claimKey(visit.claimId), { docType: 'claimRef', claimId: visit.claimId, visitId: visit.visitId, status: visit.status });
    }
    return JSON.stringify(visit);
  }

  // ── ProcessClaim ──────────────────────────────────────────────────────────
  // Insurance officer approves or rejects. decision: 'APPROVED' | 'REJECTED' | 'PARTIAL_APPROVAL'.
  async ProcessClaim(ctx, visitId, decision, reason, visitCID, approvedAmount, copayAmount) {
    const { userId } = requireRole(ctx, 'insuranceofficer');

    let visit = await getState(ctx, visitKey(visitId));
    if (!visit) {
      const ref = await getState(ctx, claimKey(visitId));
      if (ref && ref.visitId) visit = await getState(ctx, visitKey(ref.visitId));
    }
    if (!visit) throw new Error(`Claim or visit not found: ${visitId}`);

    if (visit.status !== VISIT_STATUS.CLAIM_UNDER_AUDIT && visit.claimStatus !== 'UNDER_AUDIT') {
      throw new Error(`Claim must be UNDER_AUDIT to process. Current: '${visit.status || visit.claimStatus}'`);
    }

    const dec = decision.toUpperCase();
    if (!['APPROVED', 'REJECTED', 'PARTIAL_APPROVAL'].includes(dec)) {
      throw new Error('decision must be APPROVED, REJECTED, or PARTIAL_APPROVAL');
    }
    if (dec === 'REJECTED' && (!reason || reason.trim() === '')) {
      throw new Error('Rejection reason is required');
    }

    visit.processedBy = userId;
    visit.claimReason = reason || '';
    visit.claimStatus = dec;
    visit.status      = dec === 'REJECTED' ? VISIT_STATUS.CLAIM_REJECTED : VISIT_STATUS.CLAIM_APPROVED;
    if (approvedAmount !== undefined && approvedAmount !== '') {
      visit.approvedAmount = parseFloat(approvedAmount);
    } else if (dec === 'APPROVED') {
      visit.approvedAmount = visit.claimAmount;
    }
    if (copayAmount !== undefined && copayAmount !== '') {
      visit.copayAmount = parseFloat(copayAmount);
    }
    visit.processedAt = now(ctx);
    visit.updatedAt   = now(ctx);

    if (visitCID) {
      visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(ctx), reason: `CLAIM_${dec}` });
      visit.visitCID = visitCID;
    }

    await putState(ctx, visitKey(visit.visitId), visit);
    if (visit.claimId) {
      await putState(ctx, claimKey(visit.claimId), { docType: 'claimRef', claimId: visit.claimId, visitId: visit.visitId, status: visit.status });
    }

    // Emit event for automated bank settlement & notification
    ctx.stub.setEvent('ClaimSettled', Buffer.from(JSON.stringify({
      claimId: visit.claimId,
      visitId: visit.visitId,
      decision: dec,
      approvedAmount: visit.approvedAmount || 0,
      timestamp: now(ctx)
    })));

    return JSON.stringify(visit);
  }

  // ── GetClaim ──────────────────────────────────────────────────────────────
  async GetClaim(ctx, id) {
    let visit = await getState(ctx, visitKey(id));
    if (!visit) {
      const ref = await getState(ctx, claimKey(id));
      if (ref && ref.visitId) visit = await getState(ctx, visitKey(ref.visitId));
    }
    if (!visit) throw new Error(`Claim not found: ${id}`);
    return JSON.stringify(visit);
  }

  // ── GetAllClaims ──────────────────────────────────────────────────────────
  async GetAllClaims(ctx) {
    const results = [];
    const iterator = await ctx.stub.getStateByRange('VISIT:', 'VISIT:\uffff');
    let res = await iterator.next();
    while (!res.done) {
      if (res.value && res.value.value.toString()) {
        try {
          const rec = JSON.parse(res.value.value.toString('utf8'));
          if (rec.claimId || rec.docType === 'claim' || String(rec.status).startsWith('CLAIM_')) {
            results.push(rec);
          }
        } catch (_) {}
      }
      res = await iterator.next();
    }
    await iterator.close();
    return JSON.stringify(results);
  }
}

module.exports = { ClaimsContract, claimKey };
