import React from 'react'
import { useDashboardData, valueText } from '../components/DataView'

export default function Overview() {
  const { data, error, loading } = useDashboardData('/overview')
  const health = data?.network?.serviceHealth
  const serviceMetric = health ? { value: health.value == null ? null : `${health.value} / ${health.checked}`, status: health.status } : null
  return <section className="max-w-7xl mx-auto space-y-6"><header><h1 className="text-2xl font-bold">Dashboard overview</h1><p className="text-slate-500 mt-1">Aggregate operational data reported by connected producers.</p></header>
    {loading && <p className="p-4 bg-white border rounded-lg">Loading dashboard data…</p>}{error && <p role="alert" className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">{error}</p>}
    {data && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{[
      ['Connected peers', data.network?.connectedPeers], ['Services online / checked', serviceMetric],
      ['Agents configured', { value: data.agents?.items?.length ?? null, status: data.agents?.status }],
      ['Transactions / minute', data.transactions?.metrics?.txPerMinute],
      ['Security events', { value: data.security?.summary?.eventCount ?? null, status: data.security?.summary?.status }],
      ['IPFS uploads', { value: data.ipfs?.metrics?.uploads ?? null, status: data.ipfs?.metrics?.status }],
      ['Active alerts', { value: data.alerts?.count ?? null, status: data.alerts?.status }],
    ].map(([name, metric]) => <article key={name} className="bg-white border border-slate-200 rounded-xl p-5"><h2 className="font-semibold text-slate-800">{name}</h2><p className="text-2xl font-bold mt-3">{valueText(metric?.value)}</p><p className="text-sm text-slate-500 mt-2">{metric?.status?.state || 'Status unavailable'}{metric?.status?.mock ? ' · MOCK DATA' : ''}</p><p className="text-xs text-slate-500 mt-1">{metric?.status?.reason || 'Reported by connected event or health producers.'}</p></article>)}</div>}
  </section>
}
