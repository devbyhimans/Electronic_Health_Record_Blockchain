import React, { useState } from 'react';
import { Search, Plus, User, CreditCard, CheckCircle2, RefreshCw, LogIn } from 'lucide-react';
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
  const [identity, setIdentity] = useState('');       // pharmacist login ID (e.g. ph_alice)
  const [loggedIn, setLoggedIn] = useState(false);
  const [patientId, setPatientId] = useState('');
  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('login'); // 'login' | 'search' | 'bill' | 'success'
  const [lastTx, setLastTx] = useState(null);

  const [billData, setBillData] = useState({
    amount: '',
    medicines: [{ name: '', quantity: '1' }]
  });

  const handleLogin = (e) => {
    e.preventDefault();
    if (!identity.trim()) return;
    setLoggedIn(true);
    setStep('search');
  };

  const handleLogout = () => {
    setIdentity('');
    setLoggedIn(false);
    setStep('login');
    setPatientId('');
    setPatientData(null);
    setLastTx(null);
  };

  const searchPatient = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const profile = await api(`/api/patient/${patientId}?user=${identity}`);
      const history = await api(`/api/bills/patient/${patientId}?user=${identity}`).catch(() => []);
      setPatientData({ profile, history: Array.isArray(history) ? history : [] });
      setBillData({ amount: '', medicines: [{ name: '', quantity: '1' }] });
      setStep('bill');
    } catch (err) {
      if (err.message && err.message.includes('not found')) {
        alert(`Patient "${patientId}" is not registered on the blockchain.\n\nAsk the manager to register this patient first via the Manager portal.`);
      } else {
        alert('Error verifying patient: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const addMedicine = () => {
    setBillData({ ...billData, medicines: [...billData.medicines, { name: '', quantity: '1' }] });
  };

  const removeMedicine = (index) => {
    setBillData({ ...billData, medicines: billData.medicines.filter((_, i) => i !== index) });
  };

  const submitBill = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          user: identity,
          amount: billData.amount,
          medicineList: billData.medicines
        })
      });
      setLastTx(res);
      setStep('success');
    } catch (e) {
      alert('Submission failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('search');
    setPatientId('');
    setPatientData(null);
    setLastTx(null);
    setBillData({ amount: '', medicines: [{ name: '', quantity: '1' }] });
  };

  return (
    <div className="app">
      <nav className="nav">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="pulse-circle" style={{ width: '12px', height: '12px', background: '#3b82f6' }}></div>
          <span>MedBlock <span style={{ fontWeight: 300, color: '#94a3b8' }}>Pharmacist</span></span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {loggedIn && (
            <>
              <span style={{ fontFamily: 'monospace', color: '#10b981', fontSize: '0.85rem' }}>{identity}</span>
              <button className="btn" onClick={handleLogout} style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}>Logout</button>
            </>
          )}
          <div className={`badge ${loggedIn ? 'badge-green' : 'badge-yellow'}`}>{loggedIn ? 'BILLING ACTIVE' : 'NOT LOGGED IN'}</div>
        </div>
      </nav>

      <main className="app-container">
        <AnimatePresence mode="wait">

          {/* Step 0: Login */}
          {step === 'login' && (
            <motion.div key="login" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="glass-card" style={{ maxWidth: '500px', margin: 'auto' }}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ background: 'rgba(59,130,246,0.1)', width: '72px', height: '72px', borderRadius: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                  <LogIn size={36} color="#3b82f6" />
                </div>
                <h2>Pharmacist Login</h2>
                <p style={{ color: '#94a3b8' }}>Enter your pharmacist identity to access the billing portal.</p>
              </div>
              <form onSubmit={handleLogin}>
                <label>Pharmacist Identity</label>
                <input
                  value={identity}
                  onChange={e => setIdentity(e.target.value)}
                  placeholder="e.g. ph_alice"
                  required
                  style={{ fontSize: '1.1rem', textAlign: 'center', letterSpacing: '0.05em' }}
                />
                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1rem', marginTop: '0.5rem' }}>
                  <LogIn size={16} /> Sign In
                </button>
              </form>
              <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                Ask your manager to register you first at the Manager portal (:3001)
              </p>
            </motion.div>
          )}

          {/* Step 1: Search */}
          {step === 'search' && (
            <motion.div key="search" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="glass-card" style={{ maxWidth: '600px', margin: 'auto' }}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ background: 'rgba(59,130,246,0.1)', width: '72px', height: '72px', borderRadius: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                  <Search size={36} color="#3b82f6" />
                </div>
                <h2>Patient Verification</h2>
                <p>Enter the Patient UID to access their medical ledger and create billing entries.</p>
              </div>
              <form onSubmit={searchPatient}>
                <label>Patient Identifier</label>
                <input
                  value={patientId}
                  onChange={e => setPatientId(e.target.value)}
                  placeholder="e.g. pat001"
                  required
                  style={{ fontSize: '1.1rem', textAlign: 'center', letterSpacing: '0.05em' }}
                />
                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1rem' }} disabled={loading}>
                  {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                  {loading ? 'Verifying on Ledger...' : 'Access Patient Ledger'}
                </button>
              </form>
            </motion.div>
          )}

          {/* Step 2: Billing */}
          {step === 'bill' && (
            <motion.div key="bill" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
                {/* Patient Info Panel */}
                <div className="glass-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User color="#3b82f6" />
                    </div>
                    <div>
                      <h4 style={{ margin: 0 }}>{patientData?.profile?.name || patientId}</h4>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        {patientData?.profile?.age ? `Age: ${patientData.profile.age} · ` : ''}Verified Patient
                      </span>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '0.75rem', padding: '1rem' }}>
                    <h4 style={{ fontSize: '0.8rem', marginBottom: '0.75rem', color: '#94a3b8' }}>Past Prescriptions</h4>
                    {!patientData?.history || patientData.history.length === 0 ? (
                      <p style={{ fontSize: '0.75rem' }}>No history found on ledger.</p>
                    ) : (
                      <ul style={{ listStyle: 'none', padding: 0 }}>
                        {patientData.history.slice(0, 4).map((h, i) => (
                          <li key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                            <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{h.billId.slice(0, 10)}…</span>
                            <span style={{ color: '#10b981', fontWeight: 700 }}>${h.amount}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button className="btn" style={{ width: '100%', marginTop: '1.5rem' }} onClick={reset}>
                    ← New Search
                  </button>
                </div>

                {/* Bill Form */}
                <div className="glass-card">
                  <h3><CreditCard size={20} color="#3b82f6" /> Dispatch Bill & Prescription</h3>
                  <p style={{ marginBottom: '2rem' }}>This transaction will be recorded on the Fabric ledger and archived on IPFS.</p>

                  <form onSubmit={submitBill}>
                    <label>Billing Amount ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={billData.amount}
                      onChange={e => setBillData({ ...billData, amount: e.target.value })}
                      placeholder="0.00"
                      required
                    />

                    <h4 style={{ margin: '1rem 0 0.75rem', fontSize: '0.9rem' }}>Medicines & Dosage</h4>
                    {billData.medicines.map((m, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                        <input
                          placeholder="Medicine Name"
                          value={m.name}
                          onChange={e => {
                            const nm = [...billData.medicines];
                            nm[i] = { ...nm[i], name: e.target.value };
                            setBillData({ ...billData, medicines: nm });
                          }}
                          style={{ marginBottom: 0 }}
                          required
                        />
                        <input
                          placeholder="Qty"
                          value={m.quantity}
                          onChange={e => {
                            const nm = [...billData.medicines];
                            nm[i] = { ...nm[i], quantity: e.target.value };
                            setBillData({ ...billData, medicines: nm });
                          }}
                          style={{ marginBottom: 0 }}
                          required
                        />
                        {billData.medicines.length > 1 && (
                          <button type="button" onClick={() => removeMedicine(i)}
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.3rem' }}>×</button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="btn" onClick={addMedicine} style={{ marginBottom: '1.5rem', fontSize: '0.8rem' }}>
                      <Plus size={14} /> Add Medicine
                    </button>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1rem' }} disabled={loading}>
                      {loading ? <><RefreshCw size={16} className="animate-spin" /> Committing to Ledger…</> : 'Sign & Submit'}
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Success */}
          {step === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="glass-card" style={{ maxWidth: '520px', margin: 'auto', textAlign: 'center' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                <CheckCircle2 size={48} color="#10b981" />
              </div>
              <h2>Transaction Confirmed</h2>
              <p style={{ marginBottom: '2rem' }}>The bill has been successfully added to the patient's record across all swarm nodes.</p>

              {lastTx && (
                <div style={{ background: 'rgba(0,0,0,0.35)', padding: '1.5rem', borderRadius: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label>Bill ID</label>
                    <code style={{ display: 'block', color: '#3b82f6', wordBreak: 'break-all', fontSize: '0.8rem' }}>{lastTx.billId}</code>
                  </div>
                  <div>
                    <label>IPFS Hash</label>
                    <code style={{ display: 'block', color: '#10b981', wordBreak: 'break-all', fontSize: '0.75rem' }}>{lastTx.ipfsHash}</code>
                  </div>
                </div>
              )}

              <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', padding: '1rem', borderRadius: '0.75rem', fontFamily: 'monospace', fontSize: '0.78rem', textAlign: 'left', marginBottom: '1.5rem' }}>
                <div style={{ color: '#10b981' }}>✓ IPFS Archival Complete</div>
                <div style={{ color: '#10b981' }}>✓ Fabric Transaction Finalized</div>
                <div style={{ color: '#10b981' }}>✓ Patient Record Updated</div>
              </div>

              <button className="btn btn-primary" style={{ width: '100%' }} onClick={reset}>
                New Patient
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
