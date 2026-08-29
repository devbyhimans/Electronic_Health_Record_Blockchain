import React, { useState, useEffect } from 'react';
import { Search, Plus, User, Activity, RefreshCw, Users, ClipboardList, ShieldCheck, DollarSign, ExternalLink, Package, Server, Database, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://100.124.176.94:3000';

const api = async (path, opts = {}) => {
  const res = await fetch(`${API_BASE_URL}${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Request failed');
  return json;
};

// Docker Swarm Overlay Data (Static Info)
const SWARM_LAYOUT = [
  { pc: 'PC1 (Manager)', host: '100.124.176.94', containers: ['CA', 'Orderer', 'Peer0', 'CouchDB0', 'Backend', 'IPFS Daemon', 'Vite Portals (3001-3004)'] },
  { pc: 'PC2 (Worker)', host: '100.83.121.98', containers: ['Peer1', 'CouchDB1'] },
  { pc: 'PC3 (Worker)', host: '100.117.138.55', containers: ['Peer2', 'CouchDB2'] }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('pulse');
  const [network, setNetwork] = useState({ nodes: {}, ipfs: 'CHECKING' });
  const [employees, setEmployees] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // New Employee Form
  const [newEmp, setNewEmp] = useState({ userId: '', role: 'billing', name: '', dept: 'Internal' });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [n, e, a, i] = await Promise.all([
        api('/api/network-status'),
        api('/api/employees').catch(() => []),
        api('/api/bills/audit?user=manager').catch(() => []),
        api('/api/inventory?user=manager').catch(() => [])
      ]);
      setNetwork(n);
      setEmployees(Array.isArray(e) ? e : []);
      setAuditLog(Array.isArray(a) ? a : []);
      setInventory(Array.isArray(i) ? i : []);
    } catch (e) {
      console.error(e);
      showToast('Failed to load data: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const registerEmployee = async (e) => {
    e.preventDefault();
    try {
      await api('/api/register-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: newEmp.userId,
          role: newEmp.role,
          name: newEmp.name,
          metadata: { dept: newEmp.dept }
        })
      });
      setNewEmp({ userId: '', role: 'billing', name: '', dept: 'Internal' });
      showToast('Employee registered & certificate mapped!');
      loadData();
    } catch (e) {
      showToast('Registration failed: ' + e.message, 'error');
    }
  };

  useEffect(() => { loadData(); }, []);

  const getNodeStatus = (height) => {
    if (height === 'OFFLINE') return { cls: 'badge-red', label: 'OFFLINE', color: '#ef4444' };
    if (height === 'CHECKING' || height === 'Unknown') return { cls: 'badge-yellow', label: 'CHECKING', color: '#eab308' };
    return { cls: 'badge-green', label: 'ACTIVE', color: '#10b981' };
  };

  return (
    <div className="app">
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
          <div className="pulse-circle" style={{ width: '12px', height: '12px' }}></div>
          <span>MedBlock <span style={{ fontWeight: 300, color: '#94a3b8' }}>Admin Hub</span></span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="btn" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className={`badge ${network.ipfs === 'UP' ? 'badge-green' : 'badge-red'}`}>IPFS: {network.ipfs}</div>
        </div>
      </nav>

      <main className="app-container">
        <div className="tabs">
          <div className={`tab ${activeTab === 'pulse' ? 'active' : ''}`} onClick={() => setActiveTab('pulse')}>Swarm Pulse</div>
          <div className={`tab ${activeTab === 'workforce' ? 'active' : ''}`} onClick={() => setActiveTab('workforce')}>Workforce</div>
          <div className={`tab ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>Inventory</div>
          <div className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>Audit Trail</div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'pulse' && (
            <motion.div key="pulse" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="grid">
                <div className="glass-card" style={{ gridColumn: 'span 2' }}>
                  <h3><Activity size={20} color="#10b981" /> Fabric Swarm Telemetry</h3>
                  <div className="grid" style={{ marginTop: '1.5rem' }}>
                    {Object.keys(network.nodes).length === 0 ? (
                      <div style={{ opacity: 0.5 }}>Fetching node data...</div>
                    ) : (
                      Object.entries(network.nodes).map(([id, height]) => {
                        const s = getNodeStatus(height);
                        return (
                          <div key={id} className="glass-card" style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', border: 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.7rem' }}>{id}</span>
                              <div className={`badge ${s.cls}`}>{s.label}</div>
                            </div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '1rem', color: s.color }}>
                              {height === 'OFFLINE' || height === 'Unknown' ? '---' : `#${height}`}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <h3 style={{ marginTop: '3rem' }}><Server size={20} color="#3b82f6" /> Swarm Architecture Distribution</h3>
                  <table style={{ marginTop: '1.5rem' }}>
                    <thead><tr><th>Physical PC</th><th>Host IP</th><th>Deployed Containers</th></tr></thead>
                    <tbody>
                      {SWARM_LAYOUT.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{row.pc}</td>
                          <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{row.host}</td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                              {row.containers.map((c, ci) => <span key={ci} className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontSize: '0.65rem' }}>{c}</span>)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="glass-card">
                  <h3><Info size={20} color="#eab308" /> System Summary</h3>
                  <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#94a3b8' }}>IPFS Cluster</span><div className={`badge ${network.ipfs === 'UP' ? 'badge-green' : 'badge-red'}`}>{network.ipfs}</div></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#94a3b8' }}>Staff IDs</span><span style={{ fontWeight: 800 }}>{employees.length}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#94a3b8' }}>Tx Count</span><span style={{ fontWeight: 800, color: '#10b981' }}>{auditLog.length}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#94a3b8' }}>Stock Lines</span><span style={{ fontWeight: 800, color: '#eab308' }}>{inventory.length}</span></div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'workforce' && (
            <motion.div key="workforce" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
                <div className="glass-card">
                  <h3><Plus size={20} color="#10b981" /> Onboard Staff</h3>
                  <form onSubmit={registerEmployee} style={{ marginTop: '1.5rem' }}>
                    <label>Identity ID</label><input value={newEmp.userId} onChange={e => setNewEmp({...newEmp, userId: e.target.value})} placeholder="emp_001" required />
                    <label>Full Name</label><input value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} placeholder="Dr. Alice" required />
                    <label>Role</label>
                    <select value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})}>
                      <option value="billing">Pharmacist (Billing)</option>
                      <option value="inventory">Inventory Officer</option>
                      <option value="manager">Administrator</option>
                    </select>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>Authorize Identity</button>
                  </form>
                </div>
                <div className="glass-card">
                  <h3><Users size={20} color="#3b82f6" /> Staff Registry</h3>
                  <table>
                    <thead><tr><th>Identity</th><th>Name</th><th>Role</th><th>Status</th></tr></thead>
                    <tbody>
                      {employees.map((emp, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'monospace', color: '#10b981' }}>{emp.empId}</td>
                          <td>{emp.name}</td>
                          <td><span className="badge badge-blue">{emp.role}</span></td>
                          <td>{emp.isActive ? <div className="pulse-circle" style={{ width: '8px', height: '8px' }}></div> : 'Inactive'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'inventory' && (
            <motion.div key="inventory" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="glass-card">
                <h3><Package size={20} color="#eab308" /> Pharmacy Inventory Audit</h3>
                <p>Consolidated stock monitoring across the distributed network.</p>
                <table style={{ marginTop: '2rem' }}>
                  <thead><tr><th>SKU</th><th>Medicine</th><th>In Stock</th><th>Unit Price</th><th>Status</th></tr></thead>
                  <tbody>
                    {inventory.map((item, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace' }}>{item.itemId}</td>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td><strong>{item.quantity}</strong> <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{item.unit}</span></td>
                        <td style={{ color: '#10b981' }}>${item.price}</td>
                        <td>{item.quantity <= 50 ? <span className="badge badge-red">Low Stock</span> : <span className="badge badge-green">Healthy</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'audit' && (
            <motion.div key="audit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="glass-card">
                <h3><ClipboardList size={20} color="#3b82f6" /> Global Audit Trail</h3>
                <table>
                  <thead><tr><th>Date</th><th>Bill ID</th><th>Patient</th><th>Amount</th><th>Signer</th></tr></thead>
                  <tbody>
                    {auditLog.map((log, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: '0.75rem' }}>{new Date(log.timestamp).toLocaleString()}</td>
                        <td style={{ fontFamily: 'monospace', color: '#3b82f6' }}>{log.billId.slice(0, 16)}…</td>
                        <td style={{ fontWeight: 600 }}>{log.patientId}</td>
                        <td style={{ color: '#10b981' }}>${log.amount}</td>
                        <td><code style={{ fontSize: '0.7rem' }}>{log.empId}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
