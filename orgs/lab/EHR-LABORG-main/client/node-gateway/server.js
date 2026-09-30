'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');
const { loadGatewayEnvironment } = require('./runtime-env');

loadGatewayEnvironment();

const {
  getAiAgentConfig,
  runAgenticClinicalAnalysis,
  buildLabReportPrompt,
} = require('./ai-agent');
const {
  generateVcapRecord,
  verifyVcapRecord,
  sha256,
} = require('./vcap');
const {
  createLabResult,
  getAllLabResults,
  getLabResultsByPatient,
  listGatewayPeers,
  readLabResult,
  updateLabStatus,
  getVcapProvenance,
  verifyVcap,
} = require('./gateway');
const {
  extractTextFromLabReport,
  isSupportedLabReportMimeType,
} = require('./report-extractor');
const {
  addBinaryToIpfs,
  addJsonToIpfs,
  getIpfsConfig,
  ipfsHealth,
  readJsonFromIpfs,
} = require('./ipfs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BIND_HOST = process.env.GATEWAY_BIND_HOST || '0.0.0.0';
const WEB_ROOT = path.join(__dirname, 'public');
const uploadReportFile = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_REPORT_UPLOAD_BYTES || (10 * 1024 * 1024)),
  },
});

function resolveAdvertisedHost() {
  if (process.env.GATEWAY_PUBLIC_HOST) {
    return process.env.GATEWAY_PUBLIC_HOST;
  }

  return (
    process.env.MACHINE1_IP
    || process.env.MACHINE2_IP
    || process.env.MACHINE3_IP
    || 'localhost'
  );
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(WEB_ROOT));

function selectedPeer(req) {
  const peer = req.query.peer || req.headers['x-gateway-peer'];
  return typeof peer === 'string' && peer.trim().length > 0 ? peer.trim() : undefined;
}

function normalizeToArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return [value];
  }

  return [];
}

function parseBooleanValue(value, defaultValue = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  const text = String(value || '').trim().toLowerCase();
  if (!text) {
    return defaultValue;
  }

  if (['true', '1', 'yes', 'on'].includes(text)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(text)) {
    return false;
  }

  return defaultValue;
}

function parseJsonField(value, fieldName) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  const text = String(value || '').trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${fieldName}: ${error.message}`);
  }
}

function trimmedField(value) {
  return String(value || '').trim();
}

function normalizeError(error) {
  if (error && error.code === 'LIMIT_FILE_SIZE') {
    return {
      status: 400,
      message: `reportFile exceeds upload limit (${Math.round((Number(process.env.MAX_REPORT_UPLOAD_BYTES || (10 * 1024 * 1024))) / (1024 * 1024))} MB)`,
    };
  }

  const message = (error && error.message ? error.message : String(error)).trim();

  if (/ipfs api|econnrefused|failed to fetch/i.test(message)) {
    return { status: 503, message };
  }

  if (/required|invalid json|unsupported report file type|exceeds upload limit/i.test(message)) {
    return { status: 400, message };
  }

  if (/already exists/i.test(message)) {
    return { status: 409, message };
  }

  if (/does not exist/i.test(message)) {
    return { status: 404, message };
  }

  return { status: 500, message };
}

app.get('/api/meta', (_req, res) => {
  const ipfs = getIpfsConfig();
  const ai = getAiAgentConfig();
  res.json({
    peers: listGatewayPeers(),
    defaultPeer: process.env.GATEWAY_PEER || 'peer0.lab.example.com',
    channel: 'ehrchannel',
    chaincode: 'labresults',
    vcapStandard: 'VCAP-HL7-FABRIC v1.0.0 (proposal.tex)',
    ipfs,
    ai: {
      provider: ai.provider,
      model: ai.model,
      configured: ai.configured,
    },
  });
});

app.get('/api/ipfs/health', async (_req, res) => {
  const health = await ipfsHealth();
  res.json(health);
});

app.post('/api/ipfs/add-json', async (req, res, next) => {
  try {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'data')) {
      throw new Error('data is required');
    }

    const ipfs = await addJsonToIpfs(req.body.data, {
      fileName: req.body.fileName || 'lab-result-data.json',
      pin: req.body.pin !== false,
    });

    res.status(201).json(ipfs);
  } catch (error) {
    next(error);
  }
});

app.get('/api/ipfs/json/:cid', async (req, res, next) => {
  try {
    const payload = await readJsonFromIpfs(req.params.cid);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post('/api/ai/analyze', async (req, res, next) => {
  try {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'resultData')) {
      throw new Error('resultData is required');
    }

    const peerName = selectedPeer(req);
    let patientHistory = [];
    const warnings = [];

    if (req.body.patientId) {
      try {
        const historyResponse = await getLabResultsByPatient(req.body.patientId, {
          peerName,
        });
        patientHistory = normalizeToArray(historyResponse.result);
      } catch (error) {
        warnings.push(`Unable to load patient history: ${error.message}`);
      }
    }

    const ai = await runAgenticClinicalAnalysis({
      resultData: req.body.resultData,
      testCode: req.body.testCode,
      patientId: req.body.patientId,
      patientHistory,
      reportText: req.body.reportText,
      reportTextSource: req.body.reportTextSource,
    });

    let aiIpfs = null;
    if (req.body.persistToIpfs !== false) {
      aiIpfs = await addJsonToIpfs(ai, {
        fileName: `${req.body.resultId || req.body.patientId || 'labresult'}-ai-summary.json`,
      });
    }

    res.json({
      peer: peerName || process.env.GATEWAY_PEER || 'peer0.lab.example.com',
      historyCount: patientHistory.length,
      warnings,
      ai,
      vcap: ai.vcap,
      aiIpfs,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/records', async (req, res, next) => {
  try {
    const response = await getAllLabResults({ peerName: selectedPeer(req) });
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.get('/api/records/:resultId', async (req, res, next) => {
  try {
    const response = await readLabResult(req.params.resultId, { peerName: selectedPeer(req) });
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.get('/api/patients/:patientId/records', async (req, res, next) => {
  try {
    const response = await getLabResultsByPatient(req.params.patientId, {
      peerName: selectedPeer(req),
    });
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.post('/api/records', async (req, res, next) => {
  try {
    const peerName = selectedPeer(req);
    let vcap = req.body.vcap || null;

    if (!vcap && parseBooleanValue(req.body.runAiAgents, false)) {
      const ai = await runAgenticClinicalAnalysis({
        resultData: req.body.resultData,
        testCode: req.body.testCode,
        patientId: req.body.patientId,
      });
      vcap = ai.vcap;
    }

    const response = await createLabResult(
      {
        resultId: req.body.resultId,
        patientId: req.body.patientId,
        testCode: req.body.testCode,
        collectedAt: req.body.collectedAt,
        status: req.body.status,
        resultData: req.body.resultData,
        vcap,
      },
      { peerName }
    );

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

app.post('/api/records/ipfs', uploadReportFile.single('reportFile'), async (req, res, next) => {
  try {
    const hasResultData = Object.prototype.hasOwnProperty.call(req.body || {}, 'resultData')
      && trimmedField(req.body.resultData).length > 0;
    const hasReportFile = Boolean(req.file && req.file.buffer && req.file.size > 0);

    if (!hasResultData && !hasReportFile) {
      throw new Error('Either resultData JSON or reportFile is required');
    }

    const parsedResultData = hasResultData ? parseJsonField(req.body.resultData, 'resultData') : null;
    const resultId = trimmedField(req.body.resultId);
    const peerName = selectedPeer(req);
    const runAiAgents = parseBooleanValue(req.body.runAiAgents, true);

    const warnings = [];
    let reportFileIpfs = null;
    let extractedReportText = '';

    if (hasReportFile) {
      const mimeType = String(req.file.mimetype || '').toLowerCase();
      if (!isSupportedLabReportMimeType(mimeType)) {
        throw new Error(`Unsupported report file type: ${mimeType || 'unknown'}`);
      }

      reportFileIpfs = await addBinaryToIpfs(req.file.buffer, {
        fileName: req.file.originalname || `${resultId || 'labreport'}-report`,
        contentType: mimeType,
      });

      try {
        extractedReportText = await extractTextFromLabReport({
          buffer: req.file.buffer,
          mimeType,
        });
      } catch (error) {
        warnings.push(`Unable to extract report text: ${error.message}`);
      }

      if (!extractedReportText) {
        warnings.push('Report file uploaded but no readable text was extracted.');
      }
    }

    const ipfsEnvelope = reportFileIpfs
      ? {
        schema: 'labReportPayload.v2',
        resultData: parsedResultData,
        reportFile: {
          cid: reportFileIpfs.cid,
          digest: reportFileIpfs.digest,
          byteLength: reportFileIpfs.size,
          gatewayUrl: reportFileIpfs.gatewayUrl,
          contentType: reportFileIpfs.contentType,
          fileName: req.file.originalname || reportFileIpfs.name,
        },
        extractedText: extractedReportText || null,
        extractedTextChars: extractedReportText.length,
      }
      : parsedResultData;

    const ipfsPayload = await addJsonToIpfs(ipfsEnvelope, {
      fileName: `${resultId || 'labresult'}-payload.json`,
    });

    let patientHistory = [];
    if (runAiAgents && req.body.patientId) {
      try {
        const historyResponse = await getLabResultsByPatient(req.body.patientId, {
          peerName,
        });
        patientHistory = normalizeToArray(historyResponse.result);
      } catch (error) {
        warnings.push(`Unable to load patient history: ${error.message}`);
      }
    }

    let ai = null;
    let aiIpfs = null;
    if (runAiAgents) {
      const resultDataForAi = parsedResultData || {
        reportFile: reportFileIpfs
          ? {
            cid: reportFileIpfs.cid,
            contentType: reportFileIpfs.contentType,
            fileName: req.file.originalname || reportFileIpfs.name,
          }
          : null,
      };

      ai = await runAgenticClinicalAnalysis({
        resultData: resultDataForAi,
        testCode: req.body.testCode,
        patientId: req.body.patientId,
        patientHistory,
        reportText: extractedReportText,
        reportTextSource: reportFileIpfs
          ? (req.file.originalname || reportFileIpfs.name)
          : undefined,
      });

      aiIpfs = await addJsonToIpfs(ai, {
        fileName: `${resultId || 'labresult'}-ai-summary.json`,
      });
    }

    const chainResultData = {
      storage: 'ipfs',
      cid: ipfsPayload.cid,
      digest: ipfsPayload.digest,
      byteLength: ipfsPayload.size,
      gatewayUrl: ipfsPayload.gatewayUrl,
      schema: 'labResultData.v1',
    };

    if (reportFileIpfs) {
      chainResultData.reportFile = {
        cid: reportFileIpfs.cid,
        digest: reportFileIpfs.digest,
        byteLength: reportFileIpfs.size,
        gatewayUrl: reportFileIpfs.gatewayUrl,
        contentType: reportFileIpfs.contentType,
        fileName: req.file.originalname || reportFileIpfs.name,
        extractedTextChars: extractedReportText.length,
      };
    }

    if (runAiAgents && ai && aiIpfs) {
      chainResultData.ai = {
        enabled: true,
        provider: ai.provider,
        model: ai.model,
        generatedAt: ai.generatedAt,
        summary: ai.labReportAnalysis && ai.labReportAnalysis.summary,
        recommendation:
          ai.clinicalDecisionSupport && ai.clinicalDecisionSupport.recommendation,
        confidence: {
          labReport:
            (ai.labReportAnalysis && ai.labReportAnalysis.confidence) || 'unknown',
          decisionSupport:
            (ai.clinicalDecisionSupport && ai.clinicalDecisionSupport.confidence) ||
            'unknown',
        },
        summaryCid: aiIpfs.cid,
        summaryDigest: aiIpfs.digest,
        ok: ai.ok,
        warning: ai.warning,
        disclaimer: ai.disclaimer,
      };

      // Anchor VCAP Cryptographic Provenance
      if (ai.vcap) {
        chainResultData.vcap = ai.vcap;
        chainResultData.clinicalInput = ai.clinicalInput;
        chainResultData.activePrompt = ai.activePrompt;
      }
    }

    const response = await createLabResult(
      {
        resultId,
        patientId: trimmedField(req.body.patientId),
        testCode: trimmedField(req.body.testCode),
        collectedAt: trimmedField(req.body.collectedAt),
        status: trimmedField(req.body.status),
        resultData: chainResultData,
        vcap: (ai && ai.vcap) || null,
      },
      { peerName }
    );

    res.status(201).json({
      ...response,
      ipfs: ipfsPayload,
      reportFileIpfs,
      extractedTextChars: extractedReportText.length,
      extractedTextPreview: extractedReportText.slice(0, 500),
      ai,
      vcap: (ai && ai.vcap) || null,
      aiIpfs,
      warnings,
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/records/:resultId/status', async (req, res, next) => {
  try {
    const response = await updateLabStatus(req.params.resultId, req.body.status, {
      peerName: selectedPeer(req),
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.get('/api/records/:resultId/resolve-data', async (req, res, next) => {
  try {
    const response = await readLabResult(req.params.resultId, { peerName: selectedPeer(req) });
    const resultData = response.result && response.result.resultData;

    if (!resultData || resultData.storage !== 'ipfs' || !resultData.cid) {
      res.json({
        ...response,
        resolved: false,
        message: 'resultData is stored directly on-chain or does not include an IPFS CID',
      });
      return;
    }

    const ipfsPayload = await readJsonFromIpfs(resultData.cid);

    res.json({
      ...response,
      resolved: true,
      ipfs: ipfsPayload,
    });
  } catch (error) {
    next(error);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// VCAP REST API ENDPOINTS: Provenance Inspection & Tamper Verification
// ═════════════════════════════════════════════════════════════════════════════

app.get('/api/records/:resultId/vcap', async (req, res, next) => {
  try {
    const peerName = selectedPeer(req);
    const readResp = await readLabResult(req.params.resultId, { peerName });
    const record = readResp.result;

    const vcap = record.vcap || (record.resultData && record.resultData.vcap) || null;
    if (!vcap) {
      res.status(404).json({
        ok: false,
        error: `Record ${req.params.resultId} does not contain an on-chain VCAP anchor.`,
      });
      return;
    }

    res.json({
      ok: true,
      resultId: req.params.resultId,
      vcap,
      docType: record.docType,
      patientId: record.patientId,
      testCode: record.testCode,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/vcap/verify', async (req, res, next) => {
  try {
    const resultId = trimmedField(req.body.resultId);
    if (!resultId) {
      throw new Error('resultId is required');
    }

    const peerName = selectedPeer(req);
    const readResp = await readLabResult(resultId, { peerName });
    const record = readResp.result;

    const vcap = record.vcap || (record.resultData && record.resultData.vcap) || null;
    if (!vcap) {
      res.status(404).json({
        ok: false,
        error: `Record ${resultId} does not contain an on-chain VCAP anchor.`,
      });
      return;
    }

    // Resolve clinical input
    let clinicalRecord = req.body.clinicalRecord;
    let aiSummary = req.body.aiSummary;
    let promptText = req.body.prompt;

    if (!clinicalRecord) {
      if (record.resultData && record.resultData.clinicalInput) {
        clinicalRecord = record.resultData.clinicalInput;
      } else if (record.resultData && record.resultData.storage === 'ipfs' && record.resultData.cid) {
        try {
          const ipfsDoc = await readJsonFromIpfs(record.resultData.cid);
          clinicalRecord = {
            resultData: ipfsDoc.data && ipfsDoc.data.resultData ? ipfsDoc.data.resultData : ipfsDoc.data,
            testCode: record.testCode,
            patientId: record.patientId,
            reportText: (ipfsDoc.data && ipfsDoc.data.extractedText) || '',
          };
        } catch (_e) {
          clinicalRecord = {
            resultData: record.resultData,
            testCode: record.testCode,
            patientId: record.patientId,
            reportText: '',
          };
        }
      } else {
        clinicalRecord = {
          resultData: (record.resultData && record.resultData.metrics) || record.resultData,
          testCode: record.testCode,
          patientId: record.patientId,
          reportText: '',
        };
      }
    }

    if (!aiSummary) {
      if (record.resultData && record.resultData.ai) {
        aiSummary = {
          summary: record.resultData.ai.summary || '',
          recommendation: record.resultData.ai.recommendation || '',
        };
      } else {
        aiSummary = { summary: 'No summary' };
      }
    }

    if (!promptText && record.resultData && record.resultData.activePrompt) {
      promptText = record.resultData.activePrompt;
    }

    // Handle simulation flag
    const simulateTamper = parseBooleanValue(req.body.simulateTamper, false);
    const tamperTarget = req.body.tamperTarget || 'clinicalRecord';

    if (simulateTamper) {
      if (tamperTarget === 'clinicalRecord') {
        // Classic example from proposal.tex: change Hb from 8.5 to 14.5
        clinicalRecord = JSON.parse(JSON.stringify(clinicalRecord));
        if (clinicalRecord.resultData && typeof clinicalRecord.resultData === 'object') {
          clinicalRecord.resultData.hemoglobin = '14.5 (TAMPERED: was 8.5)';
        } else {
          clinicalRecord = { ...clinicalRecord, tampered: true, alteredValue: '14.5' };
        }
      } else if (tamperTarget === 'aiSummary') {
        aiSummary = {
          summary: 'TAMPERED: All diagnostic values perfectly normal, patient healthy.',
          recommendation: 'TAMPERED: No treatment necessary.',
        };
      }
    }

    // Call Fabric Chaincode VerifyVCAP
    const contractResp = await verifyVcap(
      resultId,
      clinicalRecord,
      promptText || '',
      aiSummary,
      vcap.modelFingerprint,
      { peerName }
    );

    res.json({
      ok: true,
      resultId,
      simulateTamper,
      tamperTarget: simulateTamper ? tamperTarget : null,
      verification: contractResp.result,
      fabricLive: contractResp.fabricLive,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/vcap/tamper-demo', async (_req, res, next) => {
  try {
    const demoId = `vcap-demo-${Date.now()}`;
    const clinicalInput = {
      resultData: { hemoglobin: '8.5', wbc: '9600', platelets: '220000' },
      testCode: 'CBC-ANEMIA-PANEL',
      patientId: 'patient-demo-1',
      reportText: 'Patient shows signs of fatigue. Lab Hemoglobin measured at 8.5 g/dL.',
    };

    const promptText = buildLabReportPrompt({
      resultData: clinicalInput.resultData,
      testCode: clinicalInput.testCode,
      patientId: clinicalInput.patientId,
      reportText: clinicalInput.reportText,
    });

    const aiSummary = {
      summary: 'Possible anemia pattern detected due to low hemoglobin (8.5 g/dL).',
      recommendation: 'Evaluate iron stores and consider clinical correlation for anemia.',
    };

    // 1. Generate VCAP anchor
    const vcap = generateVcapRecord({
      clinicalRecord: clinicalInput,
      prompt: promptText,
      modelFingerprint: 'gemini-2.5-flash',
      aiSummary,
      gatewaySigner: 'LabMSP:labtech',
    });

    // 2. Anchor to ledger
    await createLabResult({
      resultId: demoId,
      patientId: clinicalInput.patientId,
      testCode: clinicalInput.testCode,
      collectedAt: new Date().toISOString(),
      status: 'FINAL',
      resultData: {
        storage: 'ledger',
        metrics: clinicalInput.resultData,
        clinicalInput,
        activePrompt: promptText,
        ai: aiSummary,
        vcap,
      },
      vcap,
    });

    // 3. Step 1: Authentic Verification
    const step1Authentic = verifyVcapRecord({
      vcap,
      clinicalRecord: clinicalInput,
      prompt: promptText,
      aiSummary,
      modelFingerprint: 'gemini-2.5-flash',
    });

    // 4. Step 2: Clinical Input Tamper Simulation (Hb 8.5 -> 14.5)
    const tamperedInput = JSON.parse(JSON.stringify(clinicalInput));
    tamperedInput.resultData.hemoglobin = '14.5';
    const step2ClinicalTamper = verifyVcapRecord({
      vcap,
      clinicalRecord: tamperedInput,
      prompt: promptText,
      aiSummary,
      modelFingerprint: 'gemini-2.5-flash',
    });

    // 5. Step 3: AI Output Tamper Simulation
    const tamperedSummary = {
      summary: 'Altered diagnosis: Hemoglobin is completely normal, patient does not have anemia.',
      recommendation: 'No follow up needed.',
    };
    const step3AiTamper = verifyVcapRecord({
      vcap,
      clinicalRecord: clinicalInput,
      prompt: promptText,
      aiSummary: tamperedSummary,
      modelFingerprint: 'gemini-2.5-flash',
    });

    res.json({
      ok: true,
      demoId,
      explanation: 'VCAP (Verifiable Clinical AI Provenance) Demonstration based on proposal.tex Section 7',
      anchoredVcap: vcap,
      stages: {
        stage1_authentic: {
          description: 'Original authentic clinical record and AI summary verified against on-chain VCAP.',
          result: step1Authentic,
        },
        stage2_clinical_tamper: {
          description: 'Malicious modification: Hemoglobin changed from 8.5 to 14.5.',
          result: step2ClinicalTamper,
        },
        stage3_ai_summary_tamper: {
          description: 'Malicious modification: AI summary rewritten to claim patient is healthy.',
          result: step3AiTamper,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }

  res.sendFile(path.join(WEB_ROOT, 'index.html'));
});

app.use((error, _req, res, _next) => {
  const normalized = normalizeError(error);
  res.status(normalized.status).json({ error: normalized.message });
});

app.listen(PORT, BIND_HOST, () => {
  const advertisedHost = resolveAdvertisedHost();
  console.log(`Lab dashboard is running at http://localhost:${PORT}`);

  if (advertisedHost !== 'localhost') {
    console.log(`Network access URL: http://${advertisedHost}:${PORT}`);
  }
});
