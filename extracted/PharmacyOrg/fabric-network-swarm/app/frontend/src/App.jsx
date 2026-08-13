import React, { useState } from 'react'
import './index.css'
import Dashboard from './Dashboard'
import CreateRecord from './CreateRecord'
import { ShieldCheck, User, LogOut, Pill } from 'lucide-react'

function App() {
  const [view, setView] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState('user1');

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
          <span>Blockchain: <span style={{ color: '#10b981' }}>Connected</span></span>
          <span>IPFS: <span style={{ color: '#10b981' }}>Connected</span></span>
          <span>Org: <span style={{ color: '#10b981' }}>Pharmacy</span></span>
        </div>
        <p>© 2026 Decentralized Pharmacy Ledger Systems</p>
      </footer>
    </div>
  )
}

export default App
