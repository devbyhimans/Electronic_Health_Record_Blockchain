export const roleViews = {
  admin: ['overview', 'network', 'agents', 'transactions', 'security', 'ipfs', 'logs'],
  doctor: ['agents'],
  nurse: ['agents'],
  pharmacist: ['agents'],
  labtechnician: ['agents'],
  labsupervisor: ['agents'],
  labadmin: ['agents'],
  radiologist: ['agents'],
};

export function allowedViews(role) { return roleViews[role] || []; }
