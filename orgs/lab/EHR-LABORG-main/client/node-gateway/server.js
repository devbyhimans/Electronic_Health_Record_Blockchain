'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');
const { loadGatewayEnvironment } = require('./runtime-env');

loadGatewayEnvironment();

const {
  getAiAgentConfig,
  runAgenticClinicalAnalysis,
} = require('./ai-agent');
const {
  createLabResult,
  getAllLabResults,
  getLabResultsByPatient,
  listGatewayPeers,
  readLabResult,
  updateLabStatus,
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
  if (!health.ok) {
    res.status(503).json(health);
    return;
  }

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
    const response = await createLabResult(
      {
        resultId: req.body.resultId,
        patientId: req.body.patientId,
        testCode: req.body.testCode,
        collectedAt: req.body.collectedAt,
        status: req.body.status,
        resultData: req.body.resultData,
      },
      { peerName: selectedPeer(req) }
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
    }

    const response = await createLabResult(
      {
        resultId,
        patientId: trimmedField(req.body.patientId),
        testCode: trimmedField(req.body.testCode),
        collectedAt: trimmedField(req.body.collectedAt),
        status: trimmedField(req.body.status),
        resultData: chainResultData,
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
