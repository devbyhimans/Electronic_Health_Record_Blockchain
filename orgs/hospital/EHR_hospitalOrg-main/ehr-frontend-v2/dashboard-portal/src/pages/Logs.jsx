import React, { useState } from 'react'
import { Terminal, Filter, Download } from 'lucide-react'

const generateLogs = () => {
   const levels = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
   const sources = ['api-gateway', 'fabric-peer', 'ipfs-node', 'clinical-agent', 'auth-service'];
   const messages = [
      'Successfully committed block to ledger',
      'High memory usage detected in peer container',
      'Failed to resolve DID for patient record',
      'IPFS swarm connection established successfully',
      'Routing transaction to ordering service cluster',
      'Agent evaluation completed successfully',
      'Timeout waiting for endorse responses from peers',
      'Encrypted payload generated for IPFS push',
      'Connected to WebSocket event stream',
   ];
   return Array.from({ length: 100 }).map((_, i) => ({
      id: i,
      timestamp: new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString(),
      level: levels[Math.floor(Math.random() * levels.length)],
      source: sources[Math.floor(Math.random() * sources.length)],
      message: messages[Math.floor(Math.random() * messages.length)]
   })).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
}

const mockLogs = generateLogs();

export default function Logs() {
  const [filter, setFilter] = useState('ALL')
  
  const filteredLogs = mockLogs.filter(l => filter === 'ALL' ? true : l.level === filter)

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col animate-fade-in max-w-7xl mx-auto">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">System Logs</h1>
          <p className="text-slate-500 mt-1">Aggregated service logs for debugging and tracing.</p>
        </div>
        <div className="flex gap-4 items-center">
           <div className="flex gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
              {['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'].map(level => (
                 <button 
                    key={level}
                    onClick={() => setFilter(level)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${filter === level ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                 >
                    {level}
                 </button>
              ))}
           </div>
           <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium text-sm">
             <Download size={16} /> Export
           </button>
        </div>
      </div>

      <div className="flex-1 bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden flex flex-col shadow-xl ring-1 ring-slate-900/50">
         <div className="h-12 bg-[#1e293b] flex items-center px-4 border-b border-slate-800/80 gap-3 shrink-0">
            <div className="flex gap-1.5 mr-2">
               <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
               <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
               <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
            </div>
            <Terminal size={16} className="text-slate-400" />
            <span className="text-slate-400 text-sm font-mono opacity-80">tail -f /var/log/ehr-platform.log</span>
         </div>
         <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-1.5 custom-scrollbar">
            {filteredLogs.map((log, index) => (
               <div key={log.id} className="flex gap-4 hover:bg-slate-800/50 px-2 py-1 rounded transition-colors group">
                  <span className="text-slate-500 shrink-0 select-none group-hover:text-slate-400 transition-colors">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className={`shrink-0 w-14 font-semibold ${
                     log.level === 'INFO' ? 'text-blue-400' :
                     log.level === 'WARN' ? 'text-amber-400' :
                     log.level === 'ERROR' ? 'text-red-400' : 'text-slate-400'
                  }`}>
                     [{log.level}]
                  </span>
                  <span className="text-emerald-400/90 shrink-0 w-36 truncate" title={log.source}>[{log.source}]</span>
                  <span className="text-slate-300 break-all">{log.message}</span>
               </div>
            ))}
         </div>
      </div>
    </div>
  )
}
