export const agentConfig = {
  // ── Hyperledger Fabric Peer Nodes ──────────────────────────────────────────
  'peer0.hospital': {
    title: 'Hospital Reception & Admin',
    peer: 'peer0.hospital.example.com:7051',
    kind: 'peer',
    org: 'HospitalMSP',
    metrics: ['activeVisits', 'prescriptions', 'failedTransactions']
  },
  'peer1.hospital': {
    title: 'Doctor & Clinical Peer',
    peer: 'peer1.hospital.example.com:9051',
    kind: 'peer',
    org: 'HospitalMSP',
    metrics: ['prescriptions', 'activePatients', 'failedTransactions']
  },
  'peer2.hospital': {
    title: 'Nurse & Dispensary Peer',
    peer: 'peer2.hospital.example.com:10051',
    kind: 'peer',
    org: 'HospitalMSP',
    metrics: ['vitalsRecorded', 'dispensed', 'failedTransactions']
  },
  'peer0.diagnostic': {
    title: 'Diagnostics & Lab Peer',
    peer: 'peer0.diagnostic.example.com:8051',
    kind: 'peer',
    org: 'DiagnosticsMSP',
    metrics: ['reports', 'uploads', 'failedTransactions']
  },
  'peer0.provider': {
    title: 'Insurance & Billing Peer',
    peer: 'peer0.provider.example.com:11051',
    kind: 'peer',
    org: 'ProviderMSP',
    metrics: ['approved', 'rejected', 'failedTransactions']
  },

  // ── Intelligent Healthcare Agents ──────────────────────────────────────────
  'lab-agent': {
    title: 'Lab Analysis & OCR Agent',
    agentId: 'lab-agent-v1',
    kind: 'ai',
    org: 'DiagnosticsMSP',
    metrics: ['runs', 'successRate', 'averageLatency', 'fallbackRate']
  },
  'clinical-agent': {
    title: 'Clinical Decision Agent',
    agentId: 'clinical-agent-v2',
    kind: 'ai',
    org: 'HospitalMSP',
    metrics: ['runs', 'toolCalls', 'averageLatency', 'humanReviewRate']
  },
  'governance-agent': {
    title: 'Governance & Audit Agent',
    agentId: 'governance-guard-v1',
    kind: 'ai',
    org: 'HospitalMSP',
    metrics: ['runs', 'approved', 'rejected', 'humanReviewRequired']
  }
};
