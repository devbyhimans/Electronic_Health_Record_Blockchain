import React, { useEffect, useState } from 'react'
import { fetchApi } from '../services/api'

export function useDashboardData(path) {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  useEffect(() => { let active = true; setLoading(true); fetchApi(path).then(value => { if (active) setData(value) }).catch(err => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [path])
  return { data, error, loading }
}

export function DataView({ title, description, path, rows, columns, children }) {
  const { data, error, loading } = useDashboardData(path)
  const values = rows ? rows(data) : []
  return <section className="max-w-7xl mx-auto space-y-5"><header><h1 className="text-2xl font-bold text-slate-900">{title}</h1><p className="text-slate-500 mt-1">{description}</p></header>
    {loading && <p className="p-4 bg-white border rounded-lg text-slate-500">Loading dashboard data…</p>}
    {error && <p role="alert" className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">{error}</p>}
    {!loading && !error && <><div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-700">{data?.status?.state || 'Status unavailable'}{data?.status?.reason ? ` · ${data.status.reason}` : ''}{data?.status?.mock ? ' · MOCK DATA' : ''}</div>{children?.(data)}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr>{columns.map(col => <th key={col.label} className="text-left px-4 py-3 font-semibold text-slate-600">{col.label}</th>)}</tr></thead><tbody>{values.map((row, index) => <tr key={row.eventId || row.id || row.runId || index} className="border-t">{columns.map(col => <td key={col.label} className="px-4 py-3 text-slate-700">{col.render ? col.render(row) : row[col.key] ?? '—'}</td>)}</tr>)}</tbody></table>{!values.length && <p className="p-5 text-slate-500">No data has been reported by a connected producer.</p>}</div></>}
  </section>
}

export function eventRows(data) { return data?.items || [] }
export function valueText(value) { return value == null ? '—' : typeof value === 'object' ? value.state || value.value || '—' : String(value) }
