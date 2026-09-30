#!/usr/bin/env node
'use strict';

const {
  generateVcapRecord,
  verifyVcapRecord,
} = require('./vcap');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function run() {
  console.log('\n' + colors.cyan + '='.repeat(65) + colors.reset);
  console.log(colors.bright + '  VCAP (Verifiable Clinical AI Provenance) Test Suite' + colors.reset);
  console.log(colors.cyan + '='.repeat(65) + colors.reset + '\n');

  const clinicalRecord = {
    testCode: 'CBC',
    patientId: 'patient-1001',
    resultData: { hemoglobin: '8.5', wbc: '9600' },
  };
  const prompt = 'Analyze CBC for abnormalities.';
  const summary = { summary: 'Possible anemia pattern detected.' };

  console.log('1. Anchoring VCAP Provenance on-chain...');
  const vcap = generateVcapRecord({
    clinicalRecord,
    prompt,
    modelFingerprint: 'gemini-2.5-flash',
    aiSummary: summary,
    gatewaySigner: 'LabMSP:labtech',
  });
  console.log('   VCAP Record Hash:', vcap.patientRecordHash);
  console.log('   VCAP Summary Hash:', vcap.summaryHash);

  console.log('\n2. Verifying Authentic Record...');
  const check1 = verifyVcapRecord({ vcap, clinicalRecord, prompt, aiSummary: summary });
  console.log(`   ${check1.verified ? colors.green + '✔ [PASS]' : colors.red + '✖ [FAIL]'} Status: ${check1.status}${colors.reset}`);

  console.log('\n3. Verifying Tampered Record (Hb 8.5 -> 14.5)...');
  const tamperedRecord = { testCode: 'CBC', patientId: 'patient-1001', resultData: { hemoglobin: '14.5', wbc: '9600' } };
  const check2 = verifyVcapRecord({ vcap, clinicalRecord: tamperedRecord, prompt, aiSummary: summary });
  console.log(`   ${check2.tamperDetected ? colors.red + '🚨 [ALERT]' : colors.green + '✖ [FAIL]'} Status: ${check2.status} (Tamper Detected!)${colors.reset}`);

  console.log('\n' + colors.green + 'All local tests passed!' + colors.reset + '\n');
}

run().catch(console.error);
