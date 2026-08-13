import React, { useState, useEffect } from 'react';
import { Search, Plus, User, Activity, Calendar, ExternalLink, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL, IPFS_GATEWAY_URL } from './config';

const Dashboard = ({ onAddRecord, currentUser }) => {
  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecords();
  }, [currentUser]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/all?user=${currentUser}`);
      const data = await resp.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = records.filter(r => 
    (r.name && r.name.toLowerCase().includes(searchTerm.toLowerCase())) || 
    (r.patientId && r.patientId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="dashboard-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity color="#10b981" /> Managed Records
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Secured by Pharmacy MedBlock Consortium</p>
        </div>
        <button className="btn btn-primary" onClick={onAddRecord}>
          <Plus size={20} /> New Record
        </button>
      </div>

      <div className="glass-card" style={{ marginBottom: '2rem', padding: '1rem' }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '1rem', top: '0.8rem', color: '#64748b' }} size={20} />
          <input 
            type="text" 
            placeholder="Search Pharmacy Database..." 
            style={{ paddingLeft: '3rem', margin: 0 }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <Activity className="animate-pulse" size={48} color="#10b981" />
        </div>
      ) : (
        <div className="grid">
          <AnimatePresence>
            {filteredRecords.map((record) => (
              <motion.div 
                layout
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                key={record.patientId + record.timestamp}
                className="glass-card"
                style={{ borderLeft: record.docType === 'pharmacy_ehr' ? '4px solid #10b981' : '1px solid rgba(255,255,255,0.1)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>
                    {record.patientId}
                  </div>
                  <ShieldCheck size={18} color="#10b981" />
                </div>
                <h3 style={{ marginBottom: '0.5rem' }}>{record.name}</h3>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1rem' }}>
                  <p>IPFS CID:</p>
                  <code style={{ fontSize: '0.7rem', color: '#10b981' }}>{record.ipfsHash ? record.ipfsHash.substring(0,20) + '...' : 'N/A'}</code>
                </div>
                
                <hr style={{ border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '1rem 0' }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
                    <Calendar size={14} /> {new Date(record.timestamp).toLocaleDateString()}
                  </div>
                  <a 
                    href={`${IPFS_GATEWAY_URL}/${record.ipfsHash}`} 
                    target="_blank" 
                    rel="noreferrer"
                    style={{ color: '#8b5cf6', textDecoration: 'none', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    View Original <ExternalLink size={12} />
                  </a>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};

export default Dashboard;
