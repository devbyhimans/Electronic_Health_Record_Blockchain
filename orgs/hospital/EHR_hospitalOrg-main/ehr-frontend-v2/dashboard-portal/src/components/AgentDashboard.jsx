import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchApi } from '../services/api'
import { LoadingSkeleton } from './LoadingSkeleton'
import { AgentTrace } from './AgentTrace'

const label = value => value == null ? '—' : typeof value === 'object' ? value.value ?? value.state ?? '—' : String(value)
export function AgentDashboard() {
  const { agentId } = useParams(); const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  useEffect(() => { let active = true; fetchApi(`/agents/${encodeURIComponent(agentId)}`).then(result => { if (active) setData(result) }).catch(err => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [agentId])
  if (loading) return <LoadingSkeleton className="h-32 w-full" />
  if (error) return <div role="alert" className="p-5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">{error}</div>
  const agent = data?.agent; const metrics = data?.metrics?.metrics || {}; const executions = data?.executions?.items || []; const events = data?.events?.items || []
  return <section className="max-w-7xl mx-auto space-y-6"><Link to="/agents" className="text-blue-700 hover:underline">← Agents</Link>
    <header className="bg-white border rounded-xl p-5"><h1 className="text-2xl font-bold">{agent?.id || agentId}</h1><p className="text-slate-600 mt-1">{agent?.kind || 'Agent'} · {agent?.org || 'Organization unavailable'}</p><p className="mt-2 text-sm">Status: {agent?.status?.state || 'Not connected'}{agent?.status?.reason ? ` · ${agent.status.reason}` : ''}</p></header>
    {(agent?.model || agent?.modelVersion || agent?.vcapStatus) && <p className="text-sm text-slate-600">Model: {agent.model || '—'} · Version: {agent.modelVersion || '—'} · VCAP: {agent.vcapStatus || '—'}</p>}
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{Object.entries(metrics).map(([name, metric]) => <article key={name} className="bg-white border rounded-xl p-4"><h2 className="text-sm text-slate-500">{name}</h2><p className="text-2xl font-semibold mt-2">{label(metric)}</p><p className="text-xs text-slate-500 mt-1">{metric?.status?.state || 'Status unavailable'}</p></article>)}</div>
    <article className="bg-white border rounded-xl p-5"><h2 className="font-semibold mb-3">Recent executions and trace stitching</h2>{executions.length ? executions.map(run => <details key={run.runId} className="border-t py-3"><summary className="cursor-pointer">{run.runId} · {run.status}{run.mock ? ' · MOCK DATA' : ''}</summary><AgentTrace stages={run.stages || []}/></details>) : <p className="text-slate-500">No execution events received. Producer status: {data?.executions?.status?.state || 'Not connected'}.</p>}</article>
    <article className="bg-white border rounded-xl p-5"><h2 className="font-semibold mb-3">Recent events</h2>{events.length ? <ul className="divide-y">{events.map(event => <li key={event.eventId} className="py-3 text-sm"><strong>{event.eventType || event.type}</strong><span className="text-slate-500"> · {event.timestamp}</span>{event.mock && <span className="ml-2 text-amber-700">MOCK DATA</span>}</li>)}</ul> : <p className="text-slate-500">No events received. Producer status: {data?.events?.status?.state || 'Not connected'}.</p>}</article>
  </section>
}
