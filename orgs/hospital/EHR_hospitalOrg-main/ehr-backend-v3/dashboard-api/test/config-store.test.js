'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findRepositoryRoot, resolveDataDirectory } = require('../src/config');

test('uses a configurable repository-relative data directory under dashboard-api', () => {
  const root = findRepositoryRoot(__dirname);
  const configured = 'orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/custom-data/data';
  assert.equal(resolveDataDirectory(root, { DASHBOARD_DATA_DIR: configured }), require('node:path').resolve(root, configured));
});

test('rejects absolute, escaped, or non-data runtime directories', () => {
  const root = findRepositoryRoot(__dirname);
  assert.throws(() => resolveDataDirectory(root, { DASHBOARD_DATA_DIR: '/tmp/events' }), /repository-relative/);
  assert.throws(() => resolveDataDirectory(root, { DASHBOARD_DATA_DIR: '../outside/data' }), /within the repository/);
  assert.throws(() => resolveDataDirectory(root, {
    DASHBOARD_DATA_DIR: 'orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/custom-events',
  }), /directory named data/);
});
