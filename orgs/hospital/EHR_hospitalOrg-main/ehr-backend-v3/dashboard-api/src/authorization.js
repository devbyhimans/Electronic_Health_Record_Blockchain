'use strict';

function getRolePolicy(authorization, role) {
  if (!authorization || authorization.default !== 'deny' || typeof role !== 'string') return null;
  return authorization.roles?.[role] || null;
}

function matches(list, value) {
  return Array.isArray(list) && (list.includes('*') || list.includes(value));
}

function isAdmin(role, authorization) {
  return getRolePolicy(authorization, role)?.isAdmin === true;
}

function canAccessPage(user, page, authorization) {
  const policy = getRolePolicy(authorization, user?.role);
  return Boolean(policy && matches(policy.pages, page));
}

function canAccessAgent(user, agentId, organization, authorization) {
  const policy = getRolePolicy(authorization, user?.role);
  if (!policy || !matches(policy.agentIds, agentId)) return false;
  return matches(policy.orgs, organization);
}

function canAccessPeer(user, peerId, organization, authorization) {
  const policy = getRolePolicy(authorization, user?.role);
  if (!policy || !matches(policy.peerIds, peerId)) return false;
  return matches(policy.orgs, organization);
}

function canAccessEvent(user, event, authorization) {
  const policy = getRolePolicy(authorization, user?.role);
  if (!policy || !event || !matches(policy.orgs, event.org)) return false;
  if (isAdmin(user.role, authorization)) return true;

  if (event.payload?.agentId && matches(policy.agentIds, event.payload.agentId)) return true;

  // Peer health is non-clinical and is visible to roles assigned to that peer.
  // Transaction and execution events require an explicit logical agent tag so
  // a shared physical peer cannot leak another role's activity.
  if (['PEER_STATUS_CHANGED', 'PEER_DOWN', 'API_STATUS_CHANGED', 'API_DOWN'].includes(event.eventType)) {
    return matches(policy.peerIds, event.peerId);
  }
  return false;
}

function redactPatientReference(event, user, authorization) {
  const policy = getRolePolicy(authorization, user?.role);
  if (!event || policy?.showPatientIdHash) return event;
  const copy = { ...event, payload: { ...(event.payload || {}) } };
  delete copy.payload.patientIdHash;
  return copy;
}

function filterEventsForUser(user, events, authorization) {
  return events
    .filter((event) => canAccessEvent(user, event, authorization))
    .map((event) => redactPatientReference(event, user, authorization));
}

module.exports = {
  canAccessAgent,
  canAccessEvent,
  canAccessPage,
  canAccessPeer,
  filterEventsForUser,
  getRolePolicy,
  isAdmin,
  redactPatientReference,
};
