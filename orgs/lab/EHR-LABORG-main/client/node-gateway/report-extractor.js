'use strict';

const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

const SUPPORTED_REPORT_MIME_TYPES = new Set([
  'application/pdf',
  ...SUPPORTED_IMAGE_MIME_TYPES,
]);

function isSupportedLabReportMimeType(mimeType) {
  return SUPPORTED_REPORT_MIME_TYPES.has(String(mimeType || '').toLowerCase());
}

function isImageMimeType(mimeType) {
  return SUPPORTED_IMAGE_MIME_TYPES.has(String(mimeType || '').toLowerCase());
}

function normalizeExtractedText(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractTextFromPdf(buffer) {
  const parsed = await pdfParse(buffer);
  return normalizeExtractedText(parsed && parsed.text);
}

async function extractTextFromImage(buffer) {
  const ocrResult = await Tesseract.recognize(buffer, 'eng');
  return normalizeExtractedText(ocrResult && ocrResult.data && ocrResult.data.text);
}

async function extractTextFromLabReport({ buffer, mimeType }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('report file buffer is required for text extraction');
  }

  const normalizedMimeType = String(mimeType || '').toLowerCase();
  if (normalizedMimeType === 'application/pdf') {
    return extractTextFromPdf(buffer);
  }

  if (isImageMimeType(normalizedMimeType)) {
    return extractTextFromImage(buffer);
  }

  throw new Error(
    `Unsupported report file type: ${normalizedMimeType || 'unknown'} (allowed: PDF, PNG, JPG, JPEG, WEBP, BMP, TIFF)`
  );
}

module.exports = {
  extractTextFromLabReport,
  isSupportedLabReportMimeType,
};
