'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const SUPPORTED_ROLES = ['labtechnician', 'labsupervisor', 'labadmin'];
const DEFAULT_MSP_ID = 'LabMSP';
const SALT_ROUNDS = 10;
// Pre-computed dummy hash to prevent timing attacks when username does not exist
const DUMMY_HASH = '$2b$10$e79VlqK1/k343Jt1R7R53eA6R6r3eE1iE6f6k6n6q6s6u6w6y6A6.';

function resolveUsersFilePath() {
  if (process.env.LAB_USERS_FILE && process.env.LAB_USERS_FILE.trim().length > 0) {
    return path.resolve(process.env.LAB_USERS_FILE.trim());
  }
  return path.resolve(__dirname, '..', 'data', 'users.json');
}

function ensureDataDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadUsers() {
  const filePath = resolveUsersFilePath();
  ensureDataDirectoryExists(filePath);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2), 'utf8');
    return {};
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (error) {
    throw new Error(`Failed to load laboratory user registry: ${error.message}`);
  }
}

function saveUsers(users) {
  const filePath = resolveUsersFilePath();
  ensureDataDirectoryExists(filePath);

  const tempPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function isValidRole(role) {
  return typeof role === 'string' && SUPPORTED_ROLES.includes(role.trim());
}

function sanitizeUsername(username) {
  return String(username || '').trim();
}

function createUser({ username, password, role, userId }) {
  const cleanUsername = sanitizeUsername(username);
  if (!cleanUsername || !/^[a-zA-Z0-9_-]{3,30}$/.test(cleanUsername)) {
    throw new Error('Username must be 3-30 characters and contain only letters, numbers, hyphens, or underscores');
  }

  const cleanRole = String(role || '').trim();
  if (!isValidRole(cleanRole)) {
    throw new Error(`Unsupported role: '${cleanRole}'. Supported roles: ${SUPPORTED_ROLES.join(', ')}`);
  }

  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Password must be at least 12 characters');
  }

  const users = loadUsers();

  if (users[cleanUsername]) {
    throw new Error(`User '${cleanUsername}' already exists`);
  }

  const canonicalUserId = String(userId || `usr-${cleanRole}-${cleanUsername.toLowerCase()}`).trim();
  const userIdExists = Object.values(users).some(u => u.userId === canonicalUserId);
  if (userIdExists) {
    throw new Error(`User ID '${canonicalUserId}' is already assigned`);
  }

  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);

  const userRecord = {
    userId: canonicalUserId,
    username: cleanUsername,
    role: cleanRole,
    mspId: DEFAULT_MSP_ID,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  users[cleanUsername] = userRecord;
  saveUsers(users);

  return {
    userId: userRecord.userId,
    username: userRecord.username,
    role: userRecord.role,
    mspId: userRecord.mspId,
    createdAt: userRecord.createdAt,
  };
}

function verifyCredentials(username, password) {
  const cleanUsername = sanitizeUsername(username);
  const users = loadUsers();
  const user = users[cleanUsername];

  if (!user || !user.passwordHash) {
    // Constant-time execution to prevent timing side-channel attacks
    bcrypt.compareSync(typeof password === 'string' ? password : '', DUMMY_HASH);
    return null;
  }

  const matches = bcrypt.compareSync(
    typeof password === 'string' ? password : '',
    user.passwordHash
  );

  if (!matches) {
    return null;
  }

  return {
    userId: user.userId,
    username: user.username,
    role: user.role,
    mspId: user.mspId || DEFAULT_MSP_ID,
    createdAt: user.createdAt,
  };
}

function getUser(username) {
  const cleanUsername = sanitizeUsername(username);
  const users = loadUsers();
  const user = users[cleanUsername];
  if (!user) return null;

  return {
    userId: user.userId,
    username: user.username,
    role: user.role,
    mspId: user.mspId || DEFAULT_MSP_ID,
    createdAt: user.createdAt,
  };
}

module.exports = {
  SUPPORTED_ROLES,
  DEFAULT_MSP_ID,
  loadUsers,
  createUser,
  verifyCredentials,
  getUser,
  isValidRole,
  resolveUsersFilePath,
};
