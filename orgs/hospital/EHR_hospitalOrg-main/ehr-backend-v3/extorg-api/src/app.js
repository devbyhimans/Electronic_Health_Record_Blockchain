'use strict';

require('dotenv').config();
process.env.SERVICE_NAME = 'extorg-api';

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const path      = require('path');
const rateLimit = require('express-rate-limit');

const logger          = require('./config/logger');
const gateway         = require('./fabric/gatewayManager');
const { PEER_MAP, _base } = require('./fabric/peerRouter');
const { errorHandler }= require('./middleware/errorHandler');

const authRoutes   = require('./routes/auth');
const labRoutes    = require('./routes/lab');
const claimsRoutes = require('./routes/claims');

const app  = express();
const PORT = process.env.PORT || 4004;

app.use(cors({ origin: '*', credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
// Lab report attachments arrive as base64 (3 MB file ≈ 4 MB of JSON).
app.use('/lab/visits/:id/request/:reqId/attachments', express.json({ limit: '6mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', { stream: { write: m => logger.http(m.trim()) } }));

// Serve static Insurance & TPA Claims Deck frontend
app.use('/insurance', express.static(path.join(__dirname, '../public')));
app.get('/insurance', (req, res) => res.redirect('/insurance/'));

app.get('/health', (req, res) => res.json({
  success: true,
  service: 'extorg-api',
  orgs: ['DiagnosticsMSP', 'ProviderMSP'],
  peers: ['peer0.diagnostic.example.com', 'peer0.provider.example.com'],
  roles: {
    diagnostics: ['labreceptionist', 'labtechnician', 'radiologist', 'labsupervisor', 'labadmin'],
    provider:    ['billingofficer', 'claimsauditor', 'insuranceofficer', 'provideradmin'],
  },
  status: 'ok',
  time: new Date().toISOString(),
}));

app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));

app.use('/auth',   authRoutes);
app.use('/lab',    labRoutes);
app.use('/claims', claimsRoutes);

app.use((req, res) => res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.path}` }));
app.use(errorHandler);

async function start() {
  logger.info('Starting extorg-api...', {
    port: PORT,
    fabricBase: process.env.FABRIC_BASE_PATH,
    diagPeer: process.env.DIAG_PEER_ADDRESS || 'localhost:8051',
    provPeer: process.env.PROV_PEER_ADDRESS || 'localhost:11051',
  });

  Object.entries(PEER_MAP).forEach(([role, cfg]) => {
    logger.info(`Role config: ${role}`, { peer: cfg.address, mspId: cfg.mspId, mspPath: cfg.mspPath });
  });

  await gateway.init();

  const server = app.listen(PORT, () => {
    logger.info(`extorg-api listening on :${PORT}`);
    logger.info('── Lab routes (DiagnosticsMSP) ──');
    logger.info('GET  /lab/catalog · GET /lab/requests?status=');
    logger.info('GET  /lab/visits/:id/request/:reqId');
    logger.info('PUT  …/acknowledge · PUT …/submit · PUT …/approve · PUT …/reject');
    logger.info('POST …/attachments · GET …/attachments/:cid');
    logger.info('── Claims routes (ProviderMSP) ──');
    logger.info('GET  /claims/visits/:id');
    logger.info('GET  /claims/visits/:id/history');
    logger.info('POST /claims/visits/:id/submit');
    logger.info('PUT  /claims/visits/:id/audit');
    logger.info('PUT  /claims/visits/:id/process');
  });

  const shutdown = async (sig) => {
    logger.info(`${sig} — shutting down`);
    server.close(async () => { await gateway.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

if (require.main === module) {
  start().catch(err => { logger.error('Startup failed', { error: err.message }); process.exit(1); });
}

module.exports = { app, start };
