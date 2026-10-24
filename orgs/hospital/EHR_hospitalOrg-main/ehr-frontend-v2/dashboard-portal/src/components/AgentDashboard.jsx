import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { agentConfig } from '../config/agentConfig'
import { fetchApi } from '../services/api'
import { MetricCard } from './MetricCard'
import { StatusBadge } from './StatusBadge'
import { LoadingSkeleton } from './LoadingSkeleton'
import { ErrorState } from './ErrorState'
import { DataTable } from './DataTable'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Activity } from 'lucide-react'
import { SeverityPill } from './SeverityPill'
import { AgentTrace } from './AgentTrace'

export function AgentDashboard() {
  const { agentId } = useParams()
  const agent = agentConfig[agentId]
  
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      if (!agent) {
         setError('Agent not found in config');
         setLoading(false);
         return;
      }
      try {
        setLoading(true)
        const res = await fetchApi(`/agents/${agentId}`)
        setData(res)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [agentId, agent])

  if (loading) return <div className="space-y-6"><LoadingSkeleton className="h-24 w-full" /><div className="grid grid-cols-4 gap-4"><LoadingSkeleton className="h-32" /><LoadingSkeleton className="h-32" /></div></div>
  if (error) return <ErrorState message={error} />
  if (!agent || !data) return null

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{agent.title}</h1>
          <p className="text-slate-500 font-mono mt-1 text-sm">{agent.kind === 'ai' ? agent.agentId : agent.peer}</p>
        </div>
        <div className="flex items-center gap-4">
          <StatusBadge status={data.health || 'ONLINE'} />
        </div>
      </div>

      {agent.kind === 'ai' && data.aiProps && (
        <div className="flex gap-4 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm">
          <div className="flex-1">
            <span className="text-blue-700 font-medium mr-2">Model Used:</span>
            <span className="text-slate-700">{data.aiProps.modelUsed}</span>
          </div>
          <div className="flex-1">
            <span className="text-blue-700 font-medium mr-2">Agent Version:</span>
            <span className="text-slate-700">{data.aiProps.agentVersion}</span>
          </div>
          <div className="flex-1">
            <span className="text-blue-700 font-medium mr-2">Governance Outcome:</span>
            <span className="text-slate-700">{data.aiProps.governanceOutcome}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {agent.metrics.map(metric => (
          <MetricCard 
            key={metric}
            title={metric.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}
            value={data.metrics?.[metric] || 0}
            icon={Activity}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">24h Performance Trace</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.chartData || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="runs" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{r: 4}} />
                <Line yAxisId="right" type="monotone" dataKey="latency" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{r: 4}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[396px]">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Live Event Feed</h2>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {(data.events || []).map((ev, i) => (
              <div key={i} className="flex gap-3 text-sm border-l-2 border-slate-200 pl-3">
                <div className="w-16 flex-shrink-0 text-slate-400 font-mono text-xs mt-0.5">
                  {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div>
                  <div className="mb-1"><SeverityPill severity={ev.type} /></div>
                  <div className="text-slate-700">{ev.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
           <h2 className="text-lg font-semibold text-slate-800">Recent Executions</h2>
        </div>
        <DataTable 
          columns={[
             { header: 'ID', accessorKey: 'id', cell: row => <span className="font-mono text-slate-500">{row.id}</span> },
             { header: 'Patient', accessorKey: 'patientIdHash', cell: row => <span className="font-mono bg-slate-100 px-2 py-1 rounded text-xs">{row.patientIdHash || 'N/A'}</span> },
             { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
             { header: 'Duration', accessorKey: 'duration', cell: row => `${row.duration}ms` },
          ]}
          data={[
             { id: 'exec-9821', patientIdHash: 'a3f9...c21', status: 'ONLINE', duration: 320 },
             { id: 'exec-9822', patientIdHash: 'b4x1...d99', status: 'DEGRADED', duration: 1540 },
          ]}
        />
      </div>

      {agent.kind === 'ai' && (
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-6">Execution Trace</h2>
            <AgentTrace stages={[
               { name: 'Report Received', status: 'DONE' },
               { name: 'OCR/Parsing', status: 'DONE' },
               { name: 'FHIR Conversion', status: 'DONE' },
               { name: 'Encrypted+IPFS Stored', status: 'DONE' },
               { name: 'Record Anchored', status: 'DONE' },
               { name: 'Agent Processing', status: 'WARN_MODEL_DRIFT' },
               { name: 'Governance', status: 'WAITING_HUMAN' },
               { name: 'Human Review', status: 'PENDING' },
               { name: 'VCAP Anchored', status: 'PENDING' },
               { name: 'VCAP Verified', status: 'PENDING' }
            ]} />
         </div>
      )}
    </div>
  )
}
