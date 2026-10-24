import React from 'react'
import { Server, Activity, Cpu, HardDrive, Wifi } from 'lucide-react'
import { agentConfig } from '../config/agentConfig'
import { StatusBadge } from '../components/StatusBadge'

export default function NetworkPage() {
  const peers = Object.entries(agentConfig).filter(([_, agent]) => agent.kind === 'peer')

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Network Topology</h1>
        <p className="text-slate-500 mt-1">Status of distributed nodes across the consortium.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {peers.map(([id, agent]) => (
            <div key={id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
               <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                     <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Server size={24} />
                     </div>
                     <div>
                        <h3 className="font-bold text-slate-900">{agent.title} Node</h3>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{agent.peer}</p>
                     </div>
                  </div>
                  <StatusBadge status="ONLINE" />
               </div>
               
               <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm group">
                     <div className="flex items-center gap-2 text-slate-500"><Activity size={16} className="group-hover:text-emerald-500 transition-colors" /> Latency</div>
                     <span className="font-medium text-emerald-600">{Math.floor(Math.random() * 40 + 10)} ms</span>
                  </div>
                  <div className="flex items-center justify-between text-sm group">
                     <div className="flex items-center gap-2 text-slate-500"><Cpu size={16} className="group-hover:text-blue-500 transition-colors" /> CPU Usage</div>
                     <span className="font-medium text-slate-700">{Math.floor(Math.random() * 60 + 20)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm group">
                     <div className="flex items-center gap-2 text-slate-500"><HardDrive size={16} className="group-hover:text-purple-500 transition-colors" /> Storage</div>
                     <span className="font-medium text-slate-700">{Math.floor(Math.random() * 500 + 100)} GB</span>
                  </div>
               </div>
               
               <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono text-truncate max-w-[150px] truncate block">ID: {Math.random().toString(36).substring(2,15)}</span>
                  <div className="flex items-center gap-1 text-emerald-500 text-xs font-medium">
                     <Wifi size={12} className="animate-pulse" /> Syncing
                  </div>
               </div>
            </div>
         ))}
      </div>
    </div>
  )
}
