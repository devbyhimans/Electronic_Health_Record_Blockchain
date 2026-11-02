'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const authorization = require('../config/authorization.json');
const {
  canAccessAgent,
  canAccessEvent,
  canAccessPage,
  filterEventsForUser,
} = require('../src/authorization');

const allowedRoles = [
  ['admin', 'overview'],
  ['doctor', 'clinical-agent'],
  ['nurse', 'peer2.hospital'],
  ['pharmacist', 'pharmacy-agent'],
  ['labtechnician', 'lab-agent'],
  ['labsupervisor', 'lab-agent'],
  ['labadmin', 'lab-agent'],
  ['radiologist', 'lab-agent'],
];

const deniedRoles = [
  'patient', 'receptionist', 'patientService', 'medrecordofficer', 'labreceptionist',
  'insuranceofficer', 'claimsauditor', 'billingofficer', 'provideradmin', 'unknown',
];

for (const [role, target] of allowedRoles) {
  test(`allows approved role ${role} only its configured dashboard scope`, () => {
    const user = { role };
    if (role === 'admin') {
      assert.equal(canAccessPage(user, 'security', authorization), true);
      assert.equal(canAccessAgent(user, 'pharmacy-agent', 'HospitalMSP', authorization), true);
    } else {
      assert.equal(canAccessPage(user, 'overview', authorization), false);
      assert.equal(canAccessPage(user, 'agent', authorization), true);
      const org = role.startsWith('lab') || role === 'radiologist' ? 'DiagnosticsMSP' : 'HospitalMSP';
      if (role === 'nurse') {
        const { canAccessPeer } = require('../src/authorization');
        assert.equal(canAccessPeer(user, target, org, authorization), true);
        assert.equal(canAccessAgent(user, 'nurse-agent', org, authorization), false);
      } else {
        assert.equal(canAccessAgent(user, target, org, authorization), true);
      }
    }
  });
}

for (const role of deniedRoles) {
  test(`denies role ${role} by default`, () => {
    const user = { role };
    assert.equal(canAccessPage(user, 'overview', authorization), false);
    assert.equal(canAccessAgent(user, 'clinical-agent', 'HospitalMSP', authorization), false);
  });
}

test('denies missing, differently cased, or unmapped roles', () => {
  assert.equal(canAccessPage({}, 'overview', authorization), false);
  assert.equal(canAccessPage({ role: 'Doctor' }, 'agent', authorization), false);
  assert.equal(canAccessPage({ role: 'unknown' }, 'agent', authorization), false);
});

test('doctor cannot read pharmacy events even when both are in HospitalMSP', () => {
  const doctor = { role: 'doctor' };
  const pharmacyEvent = {
    eventType: 'AGENT_EXECUTION_COMPLETED',
    org: 'HospitalMSP',
    peerId: 'peer2.hospital',
    payload: { agentId: 'pharmacy-agent' },
  };
  assert.equal(canAccessEvent(doctor, pharmacyEvent, authorization), false);
});

test('shared nurse/pharmacy peer requires an explicit logical agent on events', () => {
  const nurse = { role: 'nurse' };
  const pharmacyEvent = { eventType: 'TRANSACTION_COMMITTED', org: 'HospitalMSP', peerId: 'peer2.hospital', payload: {} };
  const peerHealth = { eventType: 'PEER_STATUS_CHANGED', org: 'HospitalMSP', peerId: 'peer2.hospital', payload: { status: 'ONLINE' } };
  assert.equal(canAccessEvent(nurse, pharmacyEvent, authorization), false);
  assert.equal(canAccessEvent(nurse, peerHealth, authorization), true);
});

test('non-admin event views omit patientIdHash; admin retains the hash', () => {
  const event = {
    eventType: 'AGENT_EXECUTION_COMPLETED',
    org: 'HospitalMSP',
    payload: { agentId: 'clinical-agent', patientIdHash: `hmac-sha256:${'b'.repeat(64)}` },
  };
  assert.equal(filterEventsForUser({ role: 'doctor' }, [event], authorization)[0].payload.patientIdHash, undefined);
  assert.equal(filterEventsForUser({ role: 'admin' }, [event], authorization)[0].payload.patientIdHash, event.payload.patientIdHash);
});
