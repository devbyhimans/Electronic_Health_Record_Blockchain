import React from 'react'
import { Shield, ShieldAlert, Key, Lock, AlertTriangle, CheckCircle } from 'lucide-react'
import { DataTable } from '../components/DataTable'
import { SeverityPill } from '../components/SeverityPill'

const mockAudits = Array.from({ length: 15 }).map((_, i) => ({
  id: `evt-${Math.floor(Math.random() * 10000)}`,
  event: ['Unauthorized Access Attempt', 'Key Rotation Scheduled', 'Data Export Approved', 'Emergency Break-Glass', 'Smart Contract Upgrade'][Math.floor(Math.random() * 5)],
  actor: `User-${Math.random().toString(36).substring(2,6)}`,
  severity: Math.random() > 0.8 ? 'CRITICAL' : Math.random() > 0.5 ? 'WARNING' : 'INFO',
  timestamp: new Date(Date.now() - Math.floor(Math.random() * 86400000)).toLocaleString()
}))

export default function Security() {
  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Security & Audits</h1>
        <p className="text-slate-500 mt-1">Monitor access controls, cryptography, and security events.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><Lock size={24} /></div>
            <div>
               <h3 className="font-semibold text-slate-900">Encryption</h3>
               <p className="text-sm text-slate-500 mt-1">AES-256-GCM active for all at-rest IPFS data.</p>
            </div>
         </div>
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Key size={24} /></div>
            <div>
               <h3 className="font-semibold text-slate-900">Key Management</h3>
               <p className="text-sm text-slate-500 mt-1">Last rotation: 14 days ago. Health optimal.</p>
            </div>
         </div>
         <div className="bg-amber-50 border border-amber-200 p-6 rounded-xl shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-lg"><ShieldAlert size={24} /></div>
            <div>
               <h3 className="font-semibold text-amber-900">Active Threats</h3>
               <p className="text-sm text-amber-700 mt-1">2 suspicious login attempts blocked today.</p>
            </div>
         </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-lg font-semibold text-slate-800">Security Audit Log</h2>
            <button className="text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100">Export CSV</button>
         </div>
         <DataTable 
            columns={[
               { header: 'Event ID', cell: row => <span className="font-mono text-slate-500 text-sm">{row.id}</span> },
               { header: 'Severity', cell: row => <SeverityPill severity={row.severity} /> },
               { header: 'Event Description', cell: row => <span className="font-medium text-slate-800">{row.event}</span> },
               { header: 'Actor', cell: row => <span className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-xs text-slate-600 font-mono">{row.actor}</span> },
               { header: 'Timestamp', cell: row => <span className="text-sm text-slate-500">{row.timestamp}</span> }
            ]}
            data={mockAudits}
         />
      </div>
    </div>
  )
}
