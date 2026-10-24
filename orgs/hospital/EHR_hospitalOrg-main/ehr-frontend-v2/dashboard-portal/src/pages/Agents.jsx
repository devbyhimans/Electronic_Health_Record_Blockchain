import React from 'react'
import { agentConfig } from '../config/agentConfig'
import { AgentCard } from '../components/AgentCard'

export default function Agents() {
  const aiAgents = Object.entries(agentConfig).filter(([_, agent]) => agent.kind === 'ai')
  const orgRoles = Object.entries(agentConfig).filter(([_, agent]) => agent.kind === 'peer')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Network Agents & Peers</h1>
        <p className="text-slate-500">Monitor all AI agents and organization nodes across the EHR network.</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-200 pb-2">AI Agents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {aiAgents.map(([id, agent]) => (
            <AgentCard key={id} agentId={id} agent={agent} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-200 pb-2">Organization Nodes (Peers)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {orgRoles.map(([id, agent]) => (
            <AgentCard key={id} agentId={id} agent={agent} />
          ))}
        </div>
      </section>
    </div>
  )
}
