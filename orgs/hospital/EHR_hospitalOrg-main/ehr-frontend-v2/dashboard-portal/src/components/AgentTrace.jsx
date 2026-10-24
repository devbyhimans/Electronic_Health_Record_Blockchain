import React from 'react'
import { CheckCircle2, XCircle, AlertCircle, Clock, Circle, User } from 'lucide-react'

export function AgentTrace({ stages = [] }) {
  const getIcon = (status) => {
    if (status === 'DONE') return <CheckCircle2 className="text-emerald-500 bg-white" size={24} />
    if (status === 'FAILED' || status.startsWith('FAIL_')) return <XCircle className="text-red-500 bg-white" size={24} />
    if (status.startsWith('WARN_')) return <AlertCircle className="text-amber-500 bg-white" size={24} />
    if (status === 'WAITING_HUMAN') return <User className="text-blue-500 bg-white" size={24} />
    if (status === 'PENDING') return <Circle className="text-slate-300 bg-white" size={24} />
    if (status === 'SKIPPED') return <Circle className="text-slate-400 bg-white" size={24} strokeDasharray="4 4" />
    return <Circle className="text-slate-300 bg-white" size={24} />
  }

  const getColor = (status) => {
    if (status === 'DONE') return 'bg-emerald-500'
    if (status === 'FAILED' || status.startsWith('FAIL_')) return 'bg-red-500'
    if (status.startsWith('WARN_')) return 'bg-amber-500'
    if (status === 'WAITING_HUMAN') return 'bg-blue-500'
    return 'bg-slate-200'
  }
  
  const getTextColor = (status) => {
     if (status === 'FAILED' || status.startsWith('FAIL_')) return 'text-red-600'
     if (status.startsWith('WARN_')) return 'text-amber-600'
     if (status === 'WAITING_HUMAN') return 'text-blue-600'
     if (status === 'PENDING' || status === 'SKIPPED') return 'text-slate-500'
     return 'text-slate-900'
  }

  return (
    <div className="relative pl-4 space-y-8 py-4">
      {stages.map((stage, idx) => (
        <div key={idx} className="flex gap-4 items-start relative z-10">
          <div className="mt-0.5 relative flex flex-col items-center">
            {getIcon(stage.status)}
            {idx < stages.length - 1 && (
               <div className={`w-0.5 h-10 mt-1 ${getColor(stage.status)}`} />
            )}
          </div>
          <div>
            <h4 className={`font-medium ${getTextColor(stage.status)}`}>{stage.name}</h4>
            {stage.status !== 'DONE' && stage.status !== 'PENDING' && (
              <p className="text-xs font-mono mt-1 opacity-80">{stage.status}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
