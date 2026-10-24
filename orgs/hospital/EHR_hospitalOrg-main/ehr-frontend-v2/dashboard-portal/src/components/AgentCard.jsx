import React from 'react'
import { Link } from 'react-router-dom'
import { Bot, Network as NetworkIcon, Activity } from 'lucide-react'
import { StatusBadge } from './StatusBadge'

export function AgentCard({ agentId, agent }) {
  return (
    <Link to={`/agents/${agentId}`} className="block">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${agent.kind === 'ai' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
              {agent.kind === 'ai' ? <Bot size={24} /> : <NetworkIcon size={24} />}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{agent.title}</h3>
              <p className="text-sm text-slate-500 font-mono">{agent.kind === 'ai' ? agent.agentId : agent.peer}</p>
            </div>
          </div>
          <StatusBadge status="ONLINE" />
        </div>
        
        <div className="grid grid-cols-2 gap-4 mt-4">
          {agent.metrics.slice(0, 2).map(metric => (
            <div key={metric} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div className="text-xs text-slate-500 capitalize">{metric.replace(/([A-Z])/g, ' $1').trim()}</div>
              <div className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Activity size={14} className="text-slate-400" />
                ---
              </div>
            </div>
          ))}
        </div>
      </div>
    </Link>
  )
}
