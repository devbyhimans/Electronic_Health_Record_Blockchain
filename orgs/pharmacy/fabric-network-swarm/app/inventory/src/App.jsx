import React, { useState, useEffect } from 'react';
import { Package, Activity, Search, RefreshCw, Plus, Minus, AlertTriangle, ShieldCheck, User, Pill, ArrowRight, ExternalLink, Database, TrendingDown, ClipboardList } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('stock');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState('inventory_mgr_01');
  const [toast, setToast] = useState(null);

  // New Item State
  const [newItem, setNewItem] = useState({ itemId: '', name: '', quantity: '', price: '', unit: 'tablets' });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api(`/api/inventory?user=${currentUser}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      showToast('Failed to load inventory: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAddStock = async (e) => {
    e.preventDefault();
    try {
      await api('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, user: currentUser })
      });
      showToast(`${newItem.name} stock updated on ledger!`);
      setNewItem({ itemId: '', name: '', quantity: '', price: '', unit: 'tablets' });
      loadData();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const lowStockItems = items.filter(i => i.quantity <= (i.lowStockThreshold || 50));

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
          <Package size={28} color="#eab308" />
          <span>MedBlock <span style={{ fontWeight: 300, color: '#94a3b8' }}>Inventory</span></span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="glass-card" style={{ padding: '0.4rem 1rem', borderRadius: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)' }}>
            <User size={14} color="#eab308" />
            <input
              value={currentUser}
              onChange={e => setCurrentUser(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '130px', fontSize: '0.8rem', marginBottom: 0 }}
            />
          </div>
          <button className="btn" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </nav>

      <main className="app-container">
        <div className="tabs">
          <div className={`tab ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')}>Stock Ledger</div>
          <div className={`tab ${activeTab === 'manage' ? 'active' : ''}`} onClick={() => setActiveTab('manage')}>Inventory Management</div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'stock' && (
            <motion.div key="stock" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="grid">
                <div className="glass-card" style={{ gridColumn: 'span 2' }}>
                  <h3><Database size={20} color="#eab308" /> Pharmacy Real-Time Stock</h3>
                  <p>Global inventory state distributed across the blockchain swarm.</p>
                  
                  <div style={{ marginTop: '2.5rem' }}>
                    {items.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.4 }}>
                        <Database size={48} style={{ margin: '0 auto 1.5rem' }} />
                        <p>No inventory records found on the ledger.</p>
                      </div>
                    ) : (
                      <table>
                        <thead>
                          <tr><th>Item ID</th><th>Medicine</th><th>Quantity</th><th>Price</th><th>Last Sync</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {items.map((item, i) => (
                            <tr key={i}>
                              <td style={{ fontFamily: 'monospace', color: '#eab308' }}>{item.itemId}</td>
                              <td style={{ fontWeight: 600 }}>{item.name}</td>
                              <td><span style={{ fontWeight: 800 }}>{item.quantity}</span> <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.unit}</span></td>
                              <td style={{ color: '#10b981' }}>${item.price}</td>
                              <td style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(item.lastRestocked || item.createdAt).toLocaleString()}</td>
                              <td>
                                {item.quantity <= (item.lowStockThreshold || 50) 
                                  ? <span className="badge badge-red">Low Stock</span>
                                  : <span className="badge badge-green">Healthy</span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <div className="glass-card">
                  <h3><TrendingDown size={20} color="#ef4444" /> Low Stock Alerts</h3>
                  <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {lowStockItems.length === 0 ? (
                      <div style={{ padding: '1rem', textAlign: 'center', opacity: 0.5, fontSize: '0.85rem' }}>
                        All stock levels are optimal.
                      </div>
                    ) : (
                      lowStockItems.map((item, i) => (
                        <div key={i} style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '0.75rem', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.name}</div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Level: {item.quantity} / {item.lowStockThreshold || 50}</div>
                          </div>
                          <AlertTriangle size={18} color="#ef4444" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'manage' && (
            <motion.div key="manage" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="grid">
                <div className="glass-card">
                  <h3><Plus size={20} color="#10b981" /> Add / Restock Medicine</h3>
                  <p style={{ fontSize: '0.8rem', marginBottom: '2rem' }}>Updates are anchored to the blockchain and visible to pharmacists instantly.</p>
                  
                  <form onSubmit={handleAddStock}>
                    <label>Item SKU / ID</label>
                    <input value={newItem.itemId} onChange={e => setNewItem({...newItem, itemId: e.target.value})} placeholder="med_001" required />
                    
                    <label>Medicine Name</label>
                    <input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="Paracetamol 500mg" required />
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label>Quantity</label>
                        <input type="number" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} placeholder="500" required />
                      </div>
                      <div>
                        <label>Base Price ($)</label>
                        <input type="number" step="0.01" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} placeholder="10.00" />
                      </div>
                    </div>

                    <label>Unit</label>
                    <select value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})}>
                      <option value="tablets">Tablets</option>
                      <option value="vials">Vials</option>
                      <option value="bottles">Bottles</option>
                      <option value="patches">Patches</option>
                    </select>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                      <ShieldCheck size={18} /> Update Stock Ledger
                    </button>
                  </form>
                </div>

                <div className="glass-card">
                  <h3><ClipboardList size={20} color="#3b82f6" /> Inventory Compliance</h3>
                  <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                      <h4 style={{ fontSize: '0.85rem' }}>Blockchain Anchoring</h4>
                      <p style={{ fontSize: '0.75rem' }}>Every inventory update generates a new block on the ledger. This ensures zero "ghost stock" and complete auditability for controlled substances.</p>
                    </div>
                    <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '0.75rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <TrendingDown size={16} color="#3b82f6" />
                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Auto-Deduction Active</span>
                      </div>
                      <p style={{ fontSize: '0.7rem' }}>Pharmacy billing is linked to this inventory. When a pharmacist issues a bill, these stock levels are automatically adjusted on the blockchain.</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
