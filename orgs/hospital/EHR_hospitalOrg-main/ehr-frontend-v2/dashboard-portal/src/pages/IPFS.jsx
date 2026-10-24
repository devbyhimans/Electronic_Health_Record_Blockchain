import React from 'react'
import { Database, HardDrive, Share2, Globe, FileText } from 'lucide-react'
import { DataTable } from '../components/DataTable'

const mockFiles = Array.from({ length: 10 }).map((_, i) => ({
  cid: `Qm${Math.random().toString(36).substring(2, 40)}`,
  size: `${Math.floor(Math.random() * 50) + 1} MB`,
  pins: Math.floor(Math.random() * 5) + 1,
  type: ['Encrypted EHR', 'Lab Report', 'Prescription', 'Medical Image'][Math.floor(Math.random() * 4)],
  added: new Date(Date.now() - Math.floor(Math.random() * 10000000)).toLocaleString()
}))

export default function IPFS() {
  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">IPFS Storage Node</h1>
        <p className="text-slate-500 mt-1">Decentralized storage layer metrics and pinned content.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center justify-center hover:-translate-y-1 transition-transform duration-300 group">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors"><Database size={24} /></div>
            <div className="text-3xl font-bold text-slate-900">4.2 TB</div>
            <div className="text-sm font-medium text-slate-500 mt-1">Total Pinned Size</div>
         </div>
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center justify-center hover:-translate-y-1 transition-transform duration-300 group">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors"><Share2 size={24} /></div>
            <div className="text-3xl font-bold text-slate-900">142</div>
            <div className="text-sm font-medium text-slate-500 mt-1">Connected Swarm Peers</div>
         </div>
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center justify-center hover:-translate-y-1 transition-transform duration-300 group">
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mb-3 group-hover:bg-purple-600 group-hover:text-white transition-colors"><Globe size={24} /></div>
            <div className="text-3xl font-bold text-slate-900">2.1 GB/s</div>
            <div className="text-sm font-medium text-slate-500 mt-1">Network Bandwidth</div>
         </div>
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center justify-center hover:-translate-y-1 transition-transform duration-300 group">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-3 group-hover:bg-amber-500 group-hover:text-white transition-colors"><FileText size={24} /></div>
            <div className="text-3xl font-bold text-slate-900">89.4k</div>
            <div className="text-sm font-medium text-slate-500 mt-1">Encrypted Documents</div>
         </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Recently Pinned CIDs</h2>
         </div>
         <DataTable 
            columns={[
               { header: 'CID', cell: row => <span className="font-mono text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-xs truncate max-w-[250px] block" title={row.cid}>{row.cid}</span> },
               { header: 'Document Type', cell: row => <span className="font-medium text-slate-800 text-sm">{row.type}</span> },
               { header: 'Size', cell: row => <span className="text-slate-600 text-sm">{row.size}</span> },
               { header: 'Replicas', cell: row => <span className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-xs font-medium text-slate-600">{row.pins} nodes</span> },
               { header: 'Added At', cell: row => <span className="text-slate-500 text-sm">{row.added}</span> }
            ]}
            data={mockFiles}
         />
      </div>
    </div>
  )
}
