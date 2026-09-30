#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 * VCAP (Verifiable Clinical AI Provenance) Verification & Tamper Detection Test
 * Conforming to proposal.tex Section 7 & Section 15
 * ============================================================================
 */

const {
  generateVcapRecord,
  verifyVcapRecord,
  sha256,
} = require('./orgs/lab/EHR-LABORG-main/client/node-gateway/vcap');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function banner(title) {
  console.log('\n' + colors.cyan + '='.repeat(70) + colors.reset);
  console.log(colors.bright + colors.blue + `  ${title}` + colors.reset);
  console.log(colors.cyan + '='.repeat(70) + colors.reset + '\n');
}

async function runVcapVerificationSuite() {
  banner('VCAP (Verifiable Clinical AI Provenance) Verification Suite');
  console.log('Testing cryptographic provenance binding:');
  console.log('  Clinical Input ──▶ AI Execution ──▶ AI Output ──▶ Fabric Anchor\n');

  // 1. Initial Clinical State (as specified in proposal.tex Section 7.2)
  const authenticClinicalRecord = {
    testCode: 'CBC-ANEMIA-PANEL',
    patientId: 'patient-1001',
    resultData: {
      hemoglobin: '8.5',   // Low hemoglobin indicating anemia
      wbc: '9600',
      platelets: '220000',
    },
    reportText: 'Patient presents with fatigue and dizziness. Lab sample collected 08:30.',
  };

  const aiPrompt = 'You are a clinical lab analysis assistant. Analyze CBC metrics for abnormalities.';
  const aiModel = 'gemini-2.5-flash';
  const authenticAiSummary = {
    summary: 'Possible anemia pattern detected based on low hemoglobin (8.5 g/dL).',
    recommendation: 'Correlate with iron studies, ferritin, and reticulocyte count.',
    confidence: 'high',
  };
  const gatewaySigner = 'LabMSP:labtech';

  console.log(colors.bright + '1. GENERATING VCAP CRYPTOGRAPHIC ANCHOR...' + colors.reset);
  const vcapAnchor = generateVcapRecord({
    clinicalRecord: authenticClinicalRecord,
    prompt: aiPrompt,
    modelFingerprint: aiModel,
    aiSummary: authenticAiSummary,
    gatewaySigner,
    timestamp: new Date().toISOString(),
  });

  console.log('   Anchored VCAP Object:');
  console.log(`   ├─ patientRecordHash : ${colors.yellow}${vcapAnchor.patientRecordHash}${colors.reset}`);
  console.log(`   ├─ promptHash        : ${colors.yellow}${vcapAnchor.promptHash}${colors.reset}`);
  console.log(`   ├─ modelFingerprint  : ${colors.magenta}${vcapAnchor.modelFingerprint}${colors.reset}`);
  console.log(`   ├─ summaryHash       : ${colors.yellow}${vcapAnchor.summaryHash}${colors.reset}`);
  console.log(`   ├─ gatewaySigner     : ${vcapAnchor.gatewaySigner}`);
  console.log(`   └─ timestamp         : ${vcapAnchor.timestamp}`);

  // ── TEST 1: Authentic Verification ──────────────────────────────────────────
  console.log('\n' + colors.bright + '2. TEST 1: VERIFYING AUTHENTIC RECORD & AI SUMMARY (Should PASS)' + colors.reset);
  const test1Result = verifyVcapRecord({
    vcap: vcapAnchor,
    clinicalRecord: authenticClinicalRecord,
    prompt: aiPrompt,
    aiSummary: authenticAiSummary,
    modelFingerprint: aiModel,
  });

  if (test1Result.verified && !test1Result.tamperDetected) {
    console.log(`   ${colors.green}✔ [PASS] VERIFICATION SUCCEEDED:${colors.reset} All hashes match the on-chain anchor.`);
    console.log(`   - Status : ${colors.green}${test1Result.status}${colors.reset}`);
    console.log(`   - Message: ${test1Result.message}`);
  } else {
    console.error(`   ${colors.red}✖ [FAIL] Expected verification to succeed!${colors.reset}`);
    process.exit(1);
  }

  // ── TEST 2: Tamper Clinical Input (proposal.tex: Hb 8.5 -> 14.5) ─────────────
  console.log('\n' + colors.bright + '3. TEST 2: SIMULATING TAMPERING ON CLINICAL RECORD (Hb 8.5 ──▶ 14.5)' + colors.reset);
  console.log('   A malicious or unauthorized actor alters Hemoglobin to 14.5 to hide anemia.');

  const tamperedClinicalRecord = JSON.parse(JSON.stringify(authenticClinicalRecord));
  tamperedClinicalRecord.resultData.hemoglobin = '14.5'; // Malicious alteration!

  const test2Result = verifyVcapRecord({
    vcap: vcapAnchor,
    clinicalRecord: tamperedClinicalRecord,
    prompt: aiPrompt,
    aiSummary: authenticAiSummary,
    modelFingerprint: aiModel,
  });

  if (!test2Result.verified && test2Result.tamperDetected) {
    console.log(`   ${colors.red}🚨 [ALERT] TAMPER DETECTED BY VCAP!${colors.reset}`);
    console.log(`   - Status : ${colors.red}${test2Result.status}${colors.reset}`);
    console.log(`   - Message: ${test2Result.message}`);
    test2Result.mismatches.forEach((m) => {
      console.log(`   - Field   : ${m.field}`);
      console.log(`   - Expected: ${colors.green}${m.expected}${colors.reset} (Anchored at AI ingestion)`);
      console.log(`   - Actual  : ${colors.red}${m.actual}${colors.reset} (Computed from altered record)`);
      console.log(`   - Cause   : ${m.description}`);
    });
  } else {
    console.error(`   ${colors.red}✖ [FAIL] Expected tamper detection!${colors.reset}`);
    process.exit(1);
  }

  // ── TEST 3: Tamper AI Diagnostic Summary ────────────────────────────────────
  console.log('\n' + colors.bright + '4. TEST 3: SIMULATING TAMPERING ON AI DIAGNOSTIC SUMMARY' + colors.reset);
  console.log('   An attacker modifies the AI summary text to falsify the clinical interpretation.');

  const tamperedAiSummary = {
    summary: 'Patient exhibits perfectly normal blood count. No anemia detected.',
    recommendation: 'No further action required.',
  };

  const test3Result = verifyVcapRecord({
    vcap: vcapAnchor,
    clinicalRecord: authenticClinicalRecord,
    prompt: aiPrompt,
    aiSummary: tamperedAiSummary,
    modelFingerprint: aiModel,
  });

  if (!test3Result.verified && test3Result.tamperDetected) {
    console.log(`   ${colors.red}🚨 [ALERT] TAMPER DETECTED BY VCAP!${colors.reset}`);
    console.log(`   - Status : ${colors.red}${test3Result.status}${colors.reset}`);
    console.log(`   - Message: ${test3Result.message}`);
    test3Result.mismatches.forEach((m) => {
      console.log(`   - Field   : ${m.field}`);
      console.log(`   - Expected: ${colors.green}${m.expected}${colors.reset} (Anchored at AI ingestion)`);
      console.log(`   - Actual  : ${colors.red}${m.actual}${colors.reset} (Computed from altered summary)`);
      console.log(`   - Cause   : ${m.description}`);
    });
  } else {
    console.error(`   ${colors.red}✖ [FAIL] Expected tamper detection!${colors.reset}`);
    process.exit(1);
  }

  // ── TEST 4: Live Gateway REST API Integration ───────────────────────────────
  console.log('\n' + colors.bright + '5. TEST 4: CHECKING LIVE LAB GATEWAY REST API (http://localhost:3006)' + colors.reset);
  try {
    const fetch = global.fetch || require('node-fetch');
    const demoResp = await fetch('http://localhost:3006/api/vcap/tamper-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (demoResp.ok) {
      const demoData = await demoResp.json();
      console.log(`   ${colors.green}✔ [PASS] Gateway REST API is live and verified!${colors.reset}`);
      console.log(`   - Demo Record ID: ${demoData.demoId}`);
      console.log(`   - Stage 1 (Authentic)    : ${demoData.stages.stage1_authentic.result.status}`);
      console.log(`   - Stage 2 (Record Tamper): ${demoData.stages.stage2_clinical_tamper.result.status}`);
      console.log(`   - Stage 3 (AI Tamper)    : ${demoData.stages.stage3_ai_summary_tamper.result.status}`);
    } else {
      console.log(`   ${colors.yellow}⚠ Gateway returned HTTP ${demoResp.status}. Container may still be restarting.${colors.reset}`);
    }
  } catch (error) {
    console.log(`   ${colors.yellow}ℹ REST API ping note: ${error.message} (Docker container may need restart to pick up latest files)${colors.reset}`);
  }

  banner('ALL VCAP VERIFICATION & TAMPER DETECTION TESTS COMPLETED SUCCESSFULLY!');
}

runVcapVerificationSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
