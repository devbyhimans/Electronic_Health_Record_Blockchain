'use strict';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_STABLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1';
const MODEL_FALLBACKS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
];

function shouldRetryAnotherModel(modelName, statusCode) {
  // User-required behavior: if Gemini 2.5 Flash fails, immediately allow fallback to Flash Lite.
  if (modelName === 'gemini-2.5-flash') {
    return true;
  }

  return statusCode === 404 || statusCode === 429 || statusCode >= 500;
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) {
      continue;
    }

    seen.add(text);
    out.push(text);
  }

  return out;
}

function getAiAgentConfig() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  return {
    provider: 'gemini',
    model: DEFAULT_MODEL,
    configured: Boolean(apiKey),
    apiKey,
  };
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

function toSafeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return JSON.stringify({});
  }
}

function normalizeReportText(reportText) {
  return String(reportText || '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function trimReportTextForPrompt(reportText, maxChars = 6000) {
  const normalized = normalizeReportText(reportText);
  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}\n...[truncated ${normalized.length - maxChars} chars]`;
}

function buildHistoryContext(patientHistory) {
  return normalizeToArray(patientHistory)
    .slice(0, 8)
    .map((record) => ({
      resultId: record.resultId,
      testCode: record.testCode,
      collectedAt: record.collectedAt,
      status: record.status,
      resultData: record.resultData,
    }));
}

function parseJsonFromModelText(rawText, modelName) {
  const trimmed = String(rawText || '').trim();

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    // Some models wrap JSON in markdown fences.
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      try {
        return JSON.parse(fenceMatch[1]);
      } catch (_innerError) {
        // Fall through to generic error below.
      }
    }
  }

  throw new Error(`Gemini response content was not valid JSON for model ${modelName}.`);
}

async function callGeminiJson({
  systemInstruction,
  userPrompt,
  temperature = 0.2,
}) {
  const config = getAiAgentConfig();

  if (!config.configured) {
    throw new Error('Gemini API key is not configured (set GEMINI_API_KEY).');
  }

  const modelsToTry = uniqueNonEmpty([config.model, ...MODEL_FALLBACKS]);
  const apiBaseUrls = uniqueNonEmpty([GEMINI_BASE_URL, GEMINI_STABLE_BASE_URL]);
  const errors = [];

  for (const modelName of modelsToTry) {
    for (const baseUrl of apiBaseUrls) {
      const endpoint = `${baseUrl}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `${systemInstruction}\n\n${userPrompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature,
          },
        }),
      });

      const text = await response.text();
      if (!response.ok) {
        const message = `Gemini API request failed for model ${modelName} via ${baseUrl} (${response.status}): ${text || response.statusText}`;
        errors.push(message);

        // Retry according to model/status policy, including explicit Flash -> Flash Lite fallback.
        if (shouldRetryAnotherModel(modelName, response.status)) {
          continue;
        }

        throw new Error(message);
      }

      let payload;
      try {
        payload = JSON.parse(text);
      } catch (_error) {
        throw new Error(`Gemini API returned non-JSON response for model ${modelName}.`);
      }

      const candidate = payload && payload.candidates && payload.candidates[0];
      const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
      const rawJsonText = part && part.text;

      if (!rawJsonText) {
        throw new Error(`Gemini response did not include content text for model ${modelName}.`);
      }

      return {
        data: parseJsonFromModelText(rawJsonText, modelName),
        modelUsed: modelName,
      };
    }
  }

  throw new Error(
    errors.slice(0, 3).join(' | ') || 'Gemini API request failed for all candidate models.'
  );
}

function fallbackLabReportAnalysis(resultData, reportText) {
  const raw = `${toSafeJson(resultData)}\n${normalizeReportText(reportText)}`;
  const lower = raw.toLowerCase();
  const likelyAnemia = lower.includes('"hb"') || lower.includes('hemoglobin');
  const likelyDiabetes = lower.includes('hba1c') || lower.includes('glucose');

  const riskFlags = [];
  if (likelyAnemia) {
    riskFlags.push('Possible anemia pattern');
  }
  if (likelyDiabetes) {
    riskFlags.push('Possible glycemic abnormality pattern');
  }

  return {
    summary: likelyAnemia
      ? 'Low hemoglobin values may indicate possible anemia; clinical correlation is required.'
      : likelyDiabetes
        ? 'Glucose-related terms were detected; verify glycemic status against lab reference ranges.'
      : 'Basic heuristic analysis completed. No strong abnormality inferred from keyword scan.',
    abnormalities: likelyAnemia
      ? ['Hemoglobin-related data found; verify against lab reference range.']
      : likelyDiabetes
        ? ['Glucose/HbA1c-related data found; confirm threshold and trend.']
      : [],
    riskFlags,
    confidence: 'low',
    source: 'fallback-heuristic',
  };
}

function fallbackDecisionSupport(patientHistory, reportText) {
  const historyCount = normalizeToArray(patientHistory).length;
  const hasReportText = normalizeReportText(reportText).length > 0;

  return {
    recommendation:
      historyCount > 0
        ? 'Review historical trends and correlate with current symptoms before treatment decisions.'
        : hasReportText
          ? 'Use extracted report narrative with clinical context; confirm key values with original report formatting.'
          : 'No prior history provided. Consider repeat labs and clinical assessment.',
    possibleRisks: [],
    nextSteps: [
      'Correlate findings with symptoms and vitals.',
      'Confirm abnormal values with reference ranges and repeat tests if needed.',
    ],
    confidence: 'low',
    source: 'fallback-heuristic',
  };
}

function buildLabReportPrompt({ resultData, testCode, patientId, reportText, reportTextSource }) {
  const preparedReportText = trimReportTextForPrompt(reportText);

  return [
    'You are a clinical lab analysis assistant.',
    'Analyze lab result payload and identify possible abnormalities.',
    'If reportExtractedText is present, treat it as OCR/text extracted from an uploaded PDF/image lab report and use it as additional context.',
    'Return strict JSON with keys:',
    'summary (string), abnormalities (array of strings), riskFlags (array of strings), confidence (high|medium|low).',
    'Keep it concise and non-diagnostic. Mention uncertainty where relevant.',
    `patientId: ${patientId || ''}`,
    `testCode: ${testCode || ''}`,
    `resultData: ${toSafeJson(resultData)}`,
    `reportTextSource: ${reportTextSource || ''}`,
    `reportExtractedText: ${preparedReportText}`,
  ].join('\n');
}

function buildDecisionSupportPrompt({
  resultData,
  testCode,
  patientId,
  patientHistory,
  reportText,
  reportTextSource,
}) {
  const preparedReportText = trimReportTextForPrompt(reportText);

  return [
    'You are a clinical decision support assistant.',
    'Given current lab result and limited patient history, suggest possible next clinical review steps.',
    'If reportExtractedText is present, include relevant findings from the extracted PDF/image report text.',
    'Return strict JSON with keys:',
    'recommendation (string), possibleRisks (array of strings), nextSteps (array of strings), confidence (high|medium|low).',
    'Do not provide final diagnosis. Include cautious language.',
    `patientId: ${patientId || ''}`,
    `testCode: ${testCode || ''}`,
    `currentResultData: ${toSafeJson(resultData)}`,
    `patientHistory: ${toSafeJson(buildHistoryContext(patientHistory))}`,
    `reportTextSource: ${reportTextSource || ''}`,
    `reportExtractedText: ${preparedReportText}`,
  ].join('\n');
}

async function runLabReportAnalysisAgent({ resultData, testCode, patientId, reportText, reportTextSource }) {
  const systemInstruction =
    'You support clinicians by summarizing abnormalities. You are not a decision-maker.';

  const result = await callGeminiJson({
    systemInstruction,
    userPrompt: buildLabReportPrompt({
      resultData,
      testCode,
      patientId,
      reportText,
      reportTextSource,
    }),
    temperature: 0.2,
  });
  const aiOutput = result.data;

  return {
    modelUsed: result.modelUsed,
    summary: String(aiOutput.summary || '').trim() || 'No summary generated.',
    abnormalities: normalizeToArray(aiOutput.abnormalities).map((item) => String(item)),
    riskFlags: normalizeToArray(aiOutput.riskFlags).map((item) => String(item)),
    confidence: String(aiOutput.confidence || 'low').toLowerCase(),
    source: 'gemini',
  };
}

async function runClinicalDecisionSupportAgent({
  resultData,
  testCode,
  patientId,
  patientHistory,
  reportText,
  reportTextSource,
}) {
  const systemInstruction =
    'You provide clinician support suggestions from trends and current labs. You are not a replacement for doctors.';

  const result = await callGeminiJson({
    systemInstruction,
    userPrompt: buildDecisionSupportPrompt({
      resultData,
      testCode,
      patientId,
      patientHistory,
      reportText,
      reportTextSource,
    }),
    temperature: 0.2,
  });
  const aiOutput = result.data;

  return {
    modelUsed: result.modelUsed,
    recommendation: String(aiOutput.recommendation || '').trim() || 'No recommendation generated.',
    possibleRisks: normalizeToArray(aiOutput.possibleRisks).map((item) => String(item)),
    nextSteps: normalizeToArray(aiOutput.nextSteps).map((item) => String(item)),
    confidence: String(aiOutput.confidence || 'low').toLowerCase(),
    source: 'gemini',
  };
}

async function runAgenticClinicalAnalysis({
  resultData,
  testCode,
  patientId,
  patientHistory,
  reportText,
  reportTextSource,
}) {
  const config = getAiAgentConfig();
  const generatedAt = new Date().toISOString();
  const reportTextCharCount = normalizeReportText(reportText).length;

  if (!config.configured) {
    return {
      ok: false,
      provider: config.provider,
      model: config.model,
      generatedAt,
      reportTextCharCount,
      warning: 'Gemini API key is not configured; using fallback heuristics.',
      labReportAnalysis: fallbackLabReportAnalysis(resultData, reportText),
      clinicalDecisionSupport: fallbackDecisionSupport(patientHistory, reportText),
      disclaimer:
        'AI output is assistive only and must be reviewed by a licensed clinician.',
    };
  }

  try {
    const [labReportAnalysis, clinicalDecisionSupport] = await Promise.all([
      runLabReportAnalysisAgent({
        resultData,
        testCode,
        patientId,
        reportText,
        reportTextSource,
      }),
      runClinicalDecisionSupportAgent({
        resultData,
        testCode,
        patientId,
        patientHistory,
        reportText,
        reportTextSource,
      }),
    ]);

    const resolvedModel =
      clinicalDecisionSupport.modelUsed || labReportAnalysis.modelUsed || config.model;

    return {
      ok: true,
      provider: config.provider,
      model: resolvedModel,
      generatedAt,
      reportTextCharCount,
      labReportAnalysis,
      clinicalDecisionSupport,
      disclaimer:
        'AI output is assistive only and must be reviewed by a licensed clinician.',
    };
  } catch (error) {
    return {
      ok: false,
      provider: config.provider,
      model: config.model,
      generatedAt,
      reportTextCharCount,
      warning: `Gemini call failed: ${error.message}`,
      labReportAnalysis: fallbackLabReportAnalysis(resultData, reportText),
      clinicalDecisionSupport: fallbackDecisionSupport(patientHistory, reportText),
      disclaimer:
        'AI output is assistive only and must be reviewed by a licensed clinician.',
    };
  }
}

module.exports = {
  getAiAgentConfig,
  runAgenticClinicalAnalysis,
};
