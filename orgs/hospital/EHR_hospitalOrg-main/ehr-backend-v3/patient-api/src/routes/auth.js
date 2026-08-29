'use strict';

/**
 * auth.js — Patient registration and login
 *
 * POST /auth/register  — create patient account (called by receptionist flow
 *                        OR patient sets their own password after receiving patientId)
 * POST /auth/login     — patientId + password → JWT
 * GET  /auth/me        — return current patient info from JWT
 * PUT  /auth/password  — change password (requires current password)
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const db            = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { wrap }      = require('../middleware/errorHandler');
const logger        = require('../config/logger');

const SALT_ROUNDS = 10;

function issueToken(patientId) {
  return jwt.sign(
    { patientId, role: 'patient' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// ── POST /auth/register ───────────────────────────────────────────────────────
// Creates a patient account in SQLite.
// The patientId must already exist on the blockchain (registered by receptionist).
// This call sets the patient's password so they can log in.
//
// In practice: called by peer0-api after RegisterPatient, or by patient themselves
// when they receive their patientId via SMS/email from the hospital.
router.post('/register',
  [
    body('patientId').trim().notEmpty().withMessage('patientId required'),
    body('password').isLength({ min: 6 }).withMessage('password must be at least 6 characters'),
    body('email').optional().isEmail(),
    body('phone').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { patientId, password, email = '', phone = '' } = req.body;

    if (db.patientExists(patientId)) {
      return res.status(409).json({ success: false, error: `Patient account already exists: ${patientId}` });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const patient = db.createPatient({ patientId, passwordHash, email, phone });

    const token = issueToken(patientId);
    logger.info('Patient registered', { patientId });

    return res.status(201).json({
      success: true,
      data: {
        token,
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
        patient: { patientId: patient.patientId, email: patient.email, phone: patient.phone },
      },
    });
  })
);

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login',
  [
    body('patientId').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { patientId, password } = req.body;
    const patient = db.getPatient(patientId);

    if (!patient || !(await bcrypt.compare(password, patient.passwordHash))) {
      logger.warn('Login failed', { patientId });
      return res.status(401).json({ success: false, error: 'Invalid patientId or password' });
    }

    const token = issueToken(patientId);
    logger.info('Login OK', { patientId });

    return res.json({
      success: true,
      data: {
        token,
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
        patient: { patientId: patient.patientId, email: patient.email, phone: patient.phone },
      },
    });
  })
);

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  const patient = db.getPatient(req.patient.patientId);
  if (!patient) return res.status(404).json({ success: false, error: 'Patient account not found' });
  return res.json({
    success: true,
    data: {
      patientId: patient.patientId,
      email:     patient.email,
      phone:     patient.phone,
      createdAt: patient.createdAt,
    },
  });
});

// ── PUT /auth/password ────────────────────────────────────────────────────────
router.put('/password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 6 }),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { currentPassword, newPassword } = req.body;
    const patient = db.getPatient(req.patient.patientId);

    if (!patient || !(await bcrypt.compare(currentPassword, patient.passwordHash))) {
      return res.status(401).json({ success: false, error: 'Current password incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.updatePassword({ patientId: req.patient.patientId, passwordHash });
    logger.info('Password changed', { patientId: req.patient.patientId });
    return res.json({ success: true, data: { message: 'Password updated' } });
  })
);

module.exports = router;
