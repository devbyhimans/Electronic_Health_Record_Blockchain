import React, { useState, useEffect } from 'react';
import { User, History, ShieldCheck, ExternalLink, Lock, Unlock, Eye, RefreshCw, FileText, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://100.124.176.94:3000';

const api = async (path, opts = {}) => {
  const res = await fetch(`${API_BASE_URL}${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Request failed');
  return json;
};

export default function App() {
  const [patientId, setPatientId] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState(null);
  const [bills, setBills] = useState([]);
  const [accessList, setAccessList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('history');
  const [grantId, setGrantId] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      // Fetch bills and access list in parallel
      const [billsData, accessData] = await Promise.all([
        api(`/api/bills/patient/${patientId}?user=${patientId}`).catch(() => []),
        api(`/api/patient/${patientId}/access-list?user=${patientId}`).catch(() => [])
      ]);
      setBills(Array.isArray(billsData) ? billsData : []);
      setAccessList(Array.isArray(accessData) ? accessData : []);

      // Try to fetch patient profile (might fail if not on ledger)
      const profileData = await api(`/api/patient/${patientId}?user=${patientId}`).catch(() => null);
      setProfile(profileData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!patientId.trim()) return;
    setLoading(true);
    try {
      // Verify patient exists on ledger
      await api(`/api/patient/${patientId}?user=${patientId}`);
      setLoggedIn(true);
      loadData();
    } catch (err) {
      if (err.message && err.message.includes('not found')) {
        showToast('Patient ID not found on the blockchain. Please register first.', 'error');
      } else {
        // If network/chaincode error, still allow UI access
        setLoggedIn(true);
        loadData();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGrant = async (e) => {
    e.preventDefault();
    try {
      await api('/api/grant-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: patientId, requesterId: grantId })
      });
      setAccessList([...accessList, grantId]);
      setGrantId('');
      showToast(`Access granted to ${grantId}`);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleRevoke = async (id) => {
    try {
      await api('/api/revoke-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: patientId, requesterId: id })
      });
      setAccessList(accessList.filter(x => x !== id));
      showToast(`Access revoked from ${id}`);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Login screen
  if (!loggedIn) {
    return (
      <div className="app">
        <nav className="nav">
          <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="pulse-circle" style={{ width: '12px', height: '12px', background: '#10b981' }}></div>
            <span>MedBlock <span style={{ fontWeight: 300, color: '#94a3b8' }}>Patient Portal</span></span>
          </div>
          <div className="badge badge-green">Secure & Decentralised</div>
        </nav>
        <main className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
          <AnimatePresence>
            {toast && (
              <motion.div initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ position: 'fixed', top: '5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 999,
                  background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444',
                  borderRadius: '1rem', padding: '1rem 2rem', backdropFilter: 'blur(16px)', color: 'white', fontWeight: 600 }}>
                {toast.msg}
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
              <User size={36} color="#10b981" />
            </div>
            <h2 style={{ marginBottom: '0.5rem' }}>Patient Access</h2>
            <p style={{ marginBottom: '2rem' }}>Enter your Patient ID to access your blockchain-secured medical records.</p>
            <form onSubmit={handleLogin}>
              <label>Patient Identifier</label>
              <input
                value={patientId}
                onChange={e => setPatientId(e.target.value)}
                placeholder="e.g. pat_001"
                style={{ textAlign: 'center', fontSize: '1.1rem', letterSpacing: '0.05em' }}
                required
              />
              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.9rem' }} disabled={loading}>
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <LogIn size={16} />}
                {loading ? 'Verifying…' : 'Access My Records'}
              </button>
            </form>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 999,
              background: toast.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
              border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#10b981'}`,
              borderRadius: '1rem', padding: '1rem 1.5rem', backdropFilter: 'blur(16px)', color: 'white', fontWeight: 600 }}>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="nav">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="pulse-circle" style={{ width: '12px', height: '12px', background: '#10b981' }}></div>
          <span>MedBlock <span style={{ fontWeight: 300, color: '#94a3b8' }}>Patient</span></span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="btn" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="badge badge-green">ID: {patientId}</div>
          <button className="btn" onClick={() => { setLoggedIn(false); setPatientId(''); setBills([]); setAccessList([]); }} style={{ fontSize: '0.75rem' }}>
            Sign Out
          </button>
        </div>
      </nav>

      <main className="app-container">
        <div className="tabs">
          <div className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Medical History</div>
          <div className={`tab ${activeTab === 'access' ? 'active' : ''}`} onClick={() => setActiveTab('access')}>Access Governance</div>
          <div className={`tab ${activeTab === 'identity' ? 'active' : ''}`} onClick={() => setActiveTab('identity')}>Identity</div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="glass-card">
                <h3><History size={20} color="#10b981" /> Immutable Record Log</h3>
                <p>Your transactions are secured by Hyperledger Fabric and archived on IPFS.</p>
                <div style={{ marginTop: '2rem' }}>
                  {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
                      <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 1rem' }} />
                      <p>Fetching records from the blockchain…</p>
                    </div>
                  ) : bills.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                      <FileText size={48} style={{ margin: '0 auto 1rem' }} />
                      <p>No transactions found on the blockchain for your ID.</p>
                    </div>
                  ) : (
                    <table>
                      <thead>
                        <tr><th>Date</th><th>Bill ID</th><th>Amount</th><th>Provider</th><th>IPFS</th><th>View</th></tr>
                      </thead>
                      <tbody>
                        {bills.map((b, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '0.8rem' }}>{new Date(b.timestamp).toLocaleDateString()}</td>
                            <td style={{ fontFamily: 'monospace', color: '#10b981', fontSize: '0.78rem' }}>{b.billId.slice(0, 14)}…</td>
                            <td style={{ fontWeight: 800, color: '#eab308' }}>${b.amount}</td>
                            <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{b.empId}</td>
                            <td style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: '#94a3b8' }}>{b.ipfsHash ? b.ipfsHash.slice(0, 14) + '…' : '—'}</td>
                            <td>
                              {b.ipfsHash && (
                                <button className="btn" style={{ padding: '0.3rem 0.6rem' }}
                                  onClick={() => window.open(`http://100.124.176.94:8080/ipfs/${b.ipfsHash}`, '_blank')}>
                                  <Eye size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'access' && (
            <motion.div key="access" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="grid">
                <div className="glass-card">
                  <h3><Unlock size={20} color="#10b981" /> Grant New Access</h3>
                  <p>Authorize a doctor or insurance provider to view your records.</p>
                  <form onSubmit={handleGrant} style={{ marginTop: '2rem' }}>
                    <label>Third-Party Identifier</label>
                    <input value={grantId} onChange={e => setGrantId(e.target.value)} placeholder="e.g. dr_brown" required />
                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                      <ShieldCheck size={16} /> Authorize Identity
                    </button>
                  </form>
                </div>

                <div className="glass-card">
                  <h3><Lock size={20} color="#ef4444" /> Active Permissions</h3>
                  {accessList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.4 }}>
                      <Lock size={32} style={{ margin: '0 auto 1rem' }} />
                      <p style={{ fontSize: '0.85rem' }}>No external parties have been granted access.</p>
                    </div>
                  ) : (
                    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {accessList.map((id, i) => (
                        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.9rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <ShieldCheck size={16} color="#10b981" />
                            <span style={{ fontWeight: 600 }}>{id}</span>
                          </div>
                          <button title="Revoke Access" onClick={() => handleRevoke(id)}
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', color: '#ef4444', cursor: 'pointer', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'identity' && (
            <motion.div key="identity" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="glass-card" style={{ maxWidth: '600px' }}>
                <h3><ShieldCheck size={20} color="#3b82f6" /> Blockchain Identity</h3>
                <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[
                    { label: 'Patient ID', value: patientId, color: '#10b981' },
                    { label: 'Name', value: profile?.name || '—' },
                    { label: 'Age', value: profile?.age || '—' },
                    { label: 'MSP ID', value: 'Org1MSP', mono: true },
                    { label: 'Registered', value: profile?.registeredAt ? new Date(profile.registeredAt).toLocaleString() : '—' },
                    { label: 'Prescriptions', value: `${bills.length} on ledger` }
                  ].map(({ label, value, color, mono }) => (
                    <div key={label} style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                      <span style={{ fontWeight: 700, color: color || 'white', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
