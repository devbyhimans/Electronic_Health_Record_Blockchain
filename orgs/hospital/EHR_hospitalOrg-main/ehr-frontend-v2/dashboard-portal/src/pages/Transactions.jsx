import React, { useState } from 'react'
import { DataTable } from '../components/DataTable'
import { ArrowRightLeft, Search, Filter, Hash } from 'lucide-react'
import { SeverityPill } from '../components/SeverityPill'

const mockTransactions = Array.from({ length: 20 }).map((_, i) => ({
  id: `tx-${Math.random().toString(36).substr(2, 9)}`,
  hash: `0x${Math.random().toString(16).substr(2, 40)}`,
  type: ['EHR_CREATE', 'EHR_UPDATE', 'ACCESS_GRANT', 'VCAP_VERIFY'][Math.floor(Math.random() * 4)],
  patientHash: `pat-${Math.random().toString(36).substr(2, 6)}`,
  timestamp: new Date(Date.now() - Math.floor(Math.random() * 10000000)).toISOString(),
  status: Math.random() > 0.05 ? 'SUCCESS' : 'FAILED'
}))

export default function Transactions() {
  const [searchTerm, setSearchTerm] = useState('')

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transactions Ledger</h1>
          <p className="text-slate-500 mt-1">Real-time view of blockchain activity and state changes.</p>
        </div>
        <div className="flex gap-3">
           <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                 type="text" 
                 placeholder="Search by Hash or ID..." 
                 className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm w-64 transition-all"
                 value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
              />
           </div>
           <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium text-sm">
              <Filter size={16} /> Filter
           </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
         <DataTable 
            columns={[
               { header: 'TX ID', cell: row => <div className="flex items-center gap-2 font-mono text-blue-600 hover:text-blue-800 cursor-pointer transition-colors"><Hash size={14} />{row.id}</div> },
               { header: 'Type', cell: row => <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-medium border border-slate-200">{row.type}</span> },
               { header: 'Patient Ref', cell: row => <span className="font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{row.patientHash}</span> },
               { header: 'Time', cell: row => <span className="text-slate-500 whitespace-nowrap text-sm">{new Date(row.timestamp).toLocaleString()}</span> },
               { header: 'Status', cell: row => <SeverityPill severity={row.status === 'SUCCESS' ? 'INFO' : 'CRITICAL'} /> },
               { header: 'Hash', cell: row => <span className="font-mono text-slate-400 text-xs truncate max-w-[150px] block" title={row.hash}>{row.hash}</span> }
            ]}
            data={mockTransactions.filter(tx => tx.id.includes(searchTerm) || tx.hash.includes(searchTerm))}
         />
      </div>
    </div>
  )
}
