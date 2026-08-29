'use strict';

const fs = require('fs');
const path = require('path');

function parseEnvLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const withoutExport = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trim()
    : trimmed;

  const equalsIndex = withoutExport.indexOf('=');
  if (equalsIndex <= 0) {
    return null;
  }

  const key = withoutExport.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  let value = withoutExport.slice(equalsIndex + 1).trim();
  const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
  const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");
  if (hasDoubleQuotes || hasSingleQuotes) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    // Keep explicit shell-provided values and fill only missing/empty ones.
    if (process.env[parsed.key] === undefined || process.env[parsed.key] === '') {
      process.env[parsed.key] = parsed.value;
    }
  }
}

function loadGatewayEnvironment() {
  const rootDir = path.resolve(__dirname, '..', '..');
  loadEnvFile(path.join(rootDir, 'env', 'network.env'));

  const optionalMachineEnv = String(process.env.GATEWAY_MACHINE_ENV || '').trim();
  if (!optionalMachineEnv) {
    return;
  }

  const machineEnvFile = optionalMachineEnv.endsWith('.env')
    ? optionalMachineEnv
    : `${optionalMachineEnv}.env`;
  loadEnvFile(path.join(rootDir, 'env', machineEnvFile));
}

module.exports = {
  loadGatewayEnvironment,
};
