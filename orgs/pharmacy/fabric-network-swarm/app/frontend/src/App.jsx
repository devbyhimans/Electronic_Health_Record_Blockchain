import React, { useEffect, useState } from 'react'
import './index.css'
import Dashboard from './Dashboard'
import CreateRecord from './CreateRecord'
import { ShieldCheck, User, LogOut, Pill } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { API_BASE_URL } from './config'

function App() {
  const [view, setView] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState('user1');
  const [serviceStatus, setServiceStatus] = useState({ fabric: 'Checking', ipfs: 'Checking' });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/api/network-status`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Health endpoint unavailable');
        return response.json();
      })
      .then(result => {
        const heights = Object.values(result.nodes || {});
        setServiceStatus({
          fabric: heights.some(height => typeof height === 'number') ? 'Responding' : 'Unavailable',
          ipfs: result.ipfs === 'UP' ? 'Responding' : 'Unavailable',
        });
      })
      .catch(() => setServiceStatus({ fabric: 'Unavailable', ipfs: 'Unavailable' }));
    return () => controller.abort();
  }, []);

  return (
    <div className="app">
      <nav className="nav">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
           <Pill size={28} color="#10b981" />
           <span>Pharmacy <span style={{ fontWeight: 300, color: '#94a3b8' }}>MedBlock</span></span>
        </div>
        
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
           <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
             <User size={18} color="#10b981" />
              <select 
                value={currentUser} 
                onChange={(e) => setCurrentUser(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', outline: 'none', margin: 0, padding: 0, width: 'auto' }}
              >
                <option value="user1">User 1 (Employee)</option>
                <option value="admin">Admin</option>
              </select>
           </div>
           
           <span style={{ fontSize: '0.9rem', color: '#94a3b8', cursor: 'pointer' }} onClick={() => setView('dashboard')}>Dashboard</span>
           <LogOut size={20} color="#94a3b8" style={{ cursor: 'pointer' }} />
           <ThemeToggle />
        </div>
      </nav>

      <main className="app-container">
        {view === 'dashboard' ? (
          <Dashboard onAddRecord={() => setView('create')} currentUser={currentUser} />
        ) : (
          <CreateRecord 
            onCancel={() => setView('dashboard')} 
            onSave={() => setView('dashboard')} 
            currentUser={currentUser}
          />
        )}
      </main>

      <footer style={{ textAlign: 'center', padding: '4rem', color: '#64748b', fontSize: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '1rem' }}>
          <span>Fabric health: <span>{serviceStatus.fabric}</span></span>
          <span>IPFS health: <span>{serviceStatus.ipfs}</span></span>
          <span>Organization: Pharmacy</span>
        </div>
        <p>© 2026 Decentralized Pharmacy Ledger Systems</p>
      </footer>
    </div>
  )
}

export default App
