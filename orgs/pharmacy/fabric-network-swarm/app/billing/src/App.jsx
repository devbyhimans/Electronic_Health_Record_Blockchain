import React, { useState, useEffect } from 'react';
import { Pill, Activity, FileText, Send, User, Package, CheckCircle, RefreshCw, ShieldCheck, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://100.124.176.94:3000';

// Fixed prescription templates
const PRESCRIPTION_TEMPLATES = {
  "post_op": {
    name: "Post-Op Recovery Pack",
    medicines: [
      { name: "Amoxicillin 500mg", quantity: "20" },
      { name: "Ibuprofen 400mg", quantity: "15" },
      { name: "Metoclopramide 10mg", quantity: "10" }
    ]
  },
  "chronic_care": {
    name: "Chronic Care Monthly",
    medicines: [
      { name: "Metformin 850mg", quantity: "60" },
      { name: "Atorvastatin 20mg", quantity: "30" },
      { name: "Lisinopril 10mg", quantity: "30" }
    ]
  },
  "emergency_kit": {
    name: "Acute Emergency Response",
    medicines: [
      { name: "Epinephrine Auto-Injector", quantity: "2" },
      { name: "Salbutamol Inhaler 100mcg", quantity: "1" },
      { name: "Hydrocortisone 100mg Injection", quantity: "4" }
    ]
  },
  "custom": {
    name: "Custom Prescription",
    medicines: []
  }
};

const api = async (path, opts = {}) => {
  const res = await fetch(`${API_BASE_URL}${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Request failed');
  return json;
};

export default function App() {
  const [patientId, setPatientId] = useState('');
  const [currentUser, setCurrentUser] = useState('billing_office_1');
  const [selectedTemplate, setSelectedTemplate] = useState('post_op');
  const [medicines, setMedicines] = useState(PRESCRIPTION_TEMPLATES.post_op.medicines);
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentTx, setRecentTx] = useState(null);
  const [ipfsStatus, setIpfsStatus] = useState('CHECKING');

  // Fetch IPFS status on mount
  useEffect(() => {
    api('/api/ipfs-status')
      .then(data => setIpfsStatus(data.status))
      .catch(() => setIpfsStatus('DOWN'));
  }, []);

  const applyTemplate = (templateId) => {
    setSelectedTemplate(templateId);
    setMedicines([...PRESCRIPTION_TEMPLATES[templateId].medicines]);
  };

  // Compute total amount from medicines quantity when no manual amount given
  const computedAmount = customAmount || medicines.reduce((sum, m) => {
    const qty = parseFloat(m.quantity) || 0;
    return sum + qty * 2.5; // $2.5 per unit as default pricing
  }, 0).toFixed(2);

  const submitPrescription = async (e) => {
    e.preventDefault();
    if (medicines.length === 0 || medicines.every(m => !m.name)) {
      return alert('Add at least one medicine to the prescription.');
    }
    setLoading(true);
    try {
      // Uses /api/billing (backend now also accepts /api/prescription as alias)
      const result = await api('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: currentUser,
          patientId,
          name: PRESCRIPTION_TEMPLATES[selectedTemplate]?.name || 'Custom Prescription',
          medicineList: medicines,
          templateId: selectedTemplate,
          amount: computedAmount
        })
      });
      setRecentTx(result);
      setPatientId('');
      setMedicines(PRESCRIPTION_TEMPLATES.post_op.medicines);
      setSelectedTemplate('post_op');
      setCustomAmount('');
    } catch (err) {
      alert('Transaction Failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateMedicine = (index, field, value) => {
    const updated = [...medicines];
    updated[index] = { ...updated[index], [field]: value };
    setMedicines(updated);
  };

  const addMedicine = () => setMedicines([...medicines, { name: '', quantity: '1' }]);
  const removeMedicine = (index) => setMedicines(medicines.filter((_, i) => i !== index));

  return (
    <div className="app">
      <nav className="nav">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Pill size={24} color="#3b82f6" />
          <span>MedBlock <span style={{ fontWeight: 300, color: '#94a3b8' }}>Billing</span></span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="glass-card" style={{ padding: '0.4rem 1rem', borderRadius: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)' }}>
            <User size={14} color="#3b82f6" />
            <input
              value={currentUser}
              onChange={e => setCurrentUser(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '130px', fontSize: '0.8rem', marginBottom: 0 }}
              placeholder="Employee ID"
            />
          </div>
          <div className={`badge ${ipfsStatus === 'UP' ? 'badge-green' : ipfsStatus === 'DOWN' ? 'badge-red' : 'badge-yellow'}`}>
            IPFS {ipfsStatus}
          </div>
        </div>
      </nav>

      <main className="app-container">
        <div className="grid">
          {/* Left: Issue Prescription */}
          <div className="glass-card">
            <h3><FileText size={20} color="#3b82f6" /> Issue New Prescription</h3>
            <p style={{ fontSize: '0.8rem', marginBottom: '2rem' }}>All issuances are immutable and stored with SHA-256 integrity checks on IPFS.</p>

            <form onSubmit={submitPrescription}>
              <label>Recipient Patient ID</label>
              <input value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="e.g. pat_001" required />

              <label>Select Template</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {Object.keys(PRESCRIPTION_TEMPLATES).map(t => (
                  <div
                    key={t}
                    onClick={() => applyTemplate(t)}
                    style={{
                      padding: '0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      textAlign: 'center',
                      borderRadius: '0.75rem',
                      border: `1px solid ${selectedTemplate === t ? '#3b82f6' : 'var(--border)'}`,
                      background: selectedTemplate === t ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                      color: selectedTemplate === t ? '#3b82f6' : 'var(--text-secondary)',
                      fontWeight: selectedTemplate === t ? 700 : 400,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {PRESCRIPTION_TEMPLATES[t].name}
                  </div>
                ))}
              </div>

              {/* Medicine List */}
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '1rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.8rem', color: '#3b82f6' }}>Prescription Contents</h4>
                  <button type="button" className="btn" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }} onClick={addMedicine}>
                    + Add Item
                  </button>
                </div>
                {medicines.length === 0 ? (
                  <div style={{ textAlign: 'center', opacity: 0.3, padding: '1rem' }}><Package size={28} /></div>
                ) : (
                  medicines.map((m, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr auto', gap: '0.4rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <input
                        value={m.name}
                        onChange={e => updateMedicine(i, 'name', e.target.value)}
                        placeholder="Medicine name"
                        style={{ marginBottom: 0, fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
                        required
                      />
                      <input
                        value={m.quantity}
                        onChange={e => updateMedicine(i, 'quantity', e.target.value)}
                        placeholder="Qty"
                        style={{ marginBottom: 0, fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
                        required
                      />
                      <button type="button" onClick={() => removeMedicine(i)}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem', padding: '0.3rem' }}>
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Amount */}
              <label>Billing Amount ($) <span style={{ color: '#94a3b8', fontWeight: 400 }}>(auto-computed if blank)</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                placeholder={`Auto: $${computedAmount}`}
                style={{ marginBottom: '1.5rem' }}
              />

              <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', gap: '0.75rem' }}>
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                {loading ? 'Anchoring to Blockchain…' : 'Sign & Anchor Transaction'}
              </button>
            </form>
          </div>

          {/* Right: Status + Result */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-card">
              <h3><Activity size={20} color="#10b981" /> Distribution Status</h3>
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '1rem' }}>
                  {ipfsStatus === 'UP'
                    ? <CheckCircle color="#10b981" size={20} />
                    : <RefreshCw color="#eab308" size={20} className={ipfsStatus === 'CHECKING' ? 'animate-spin' : ''} />
                  }
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>IPFS Gateway {ipfsStatus === 'UP' ? 'Online' : ipfsStatus === 'DOWN' ? 'Offline' : 'Checking…'}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>127.0.0.1:5001 / port 8080</div>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0 0.5rem' }}>
                  ✓ Each prescription is uploaded to IPFS before the blockchain commit.<br />
                  ✓ The IPFS CID is permanently stored on the Fabric ledger as proof.
                </div>
              </div>
            </div>

            <AnimatePresence>
              {recentTx && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="glass-card"
                  style={{ borderLeft: '3px solid #10b981' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: '#10b981' }}>
                    <CheckCircle size={18} /> <strong>Transaction Confirmed</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem' }}>
                    <div>
                      <label>Bill ID</label>
                      <code style={{ display: 'block', color: '#3b82f6', wordBreak: 'break-all' }}>{recentTx.billId}</code>
                    </div>
                    <div>
                      <label>IPFS Hash</label>
                      <code style={{ display: 'block', color: '#10b981', wordBreak: 'break-all', fontSize: '0.72rem' }}>{recentTx.ipfsHash}</code>
                    </div>
                  </div>
                  <button
                    className="btn"
                    style={{ width: '100%', marginTop: '1.5rem', fontSize: '0.8rem' }}
                    onClick={() => window.open(`http://100.124.176.94:8080/ipfs/${recentTx.ipfsHash}`, '_blank')}
                  >
                    <ExternalLink size={14} /> View IPFS Receipt
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
