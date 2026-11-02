import React, { useState } from 'react'
import { Activity, ArrowUpRight, Bot, Database, Network, ShieldAlert, Waves, Blocks } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDashboardData, valueText } from '../components/DataView'

const metricCards = [
  { name: 'Connected peers', key: 'peers', icon: Network, tone: 'blue', note: 'Fabric network' },
  { name: 'Services online', key: 'services', icon: Activity, tone: 'green', note: 'Health checks' },
  { name: 'Agents configured', key: 'agents', icon: Bot, tone: 'violet', note: 'Registry status' },
  { name: 'Transactions / min', key: 'tx', icon: Waves, tone: 'amber', note: 'Observed activity' },
  { name: 'Security events', key: 'security', icon: ShieldAlert, tone: 'rose', note: 'Connected producers' },
  { name: 'IPFS uploads', key: 'ipfs', icon: Database, tone: 'cyan', note: 'Reported metrics' },
]

export default function Overview() {
  const { data, error, loading } = useDashboardData('/overview')
  const [blockWindow, setBlockWindow] = useState('24h')
  const { data: blockData, error: blockError, loading: blockLoading } = useDashboardData(`/blocks/metrics?window=${blockWindow}`)
  const health = data?.network?.serviceHealth
  const serviceMetric = health ? { value: health.value == null ? null : `${health.value} / ${health.checked}`, status: health.status } : null
  const metrics = {
    peers: data?.network?.connectedPeers,
    services: serviceMetric,
    agents: { value: data?.agents?.items?.length ?? null, status: data?.agents?.status },
    tx: data?.transactions?.metrics?.txPerMinute,
    security: { value: data?.security?.summary?.eventCount ?? null, status: data?.security?.summary?.status },
    ipfs: { value: data?.ipfs?.metrics?.uploads ?? null, status: data?.ipfs?.metrics?.status },
  }
  const alerts = { value: data?.alerts?.count ?? null, status: data?.alerts?.status }
  return <section className="dashboard-overview space-y-6">
    <div className="overview-hero">
      <div className="overview-hero-copy">
        <p className="eyebrow">CARE OPERATIONS · LIVE OVERVIEW</p>
        <h1>Good day<span className="hero-dot">.</span></h1>
        <p className="hero-subtitle">A clear view of the services and events currently connected to your EHR network.</p>
        <div className="hero-caption"><span className="pulse-ring"><Activity size={17}/></span><span>Operational insights from verified sources</span></div>
      </div>
      <div className="hero-orbit" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-core"><Activity size={34}/></div><span className="orbit-node node-one"/><span className="orbit-node node-two"/><span className="orbit-node node-three"/></div>
      <div className="hero-alert-card"><div className="hero-alert-icon"><ShieldAlert size={17}/></div><div><p>Active alerts</p><strong>{valueText(alerts.value)}</strong><small>{alerts.status?.state || 'Status unavailable'}</small></div><ArrowUpRight size={16} className="ml-auto text-slate-400"/></div>
    </div>

    {loading && <p className="dashboard-message">Loading dashboard data…</p>}
    {error && <p role="alert" className="dashboard-message is-error">{error}</p>}
    <div className="section-heading"><div><p className="eyebrow">NETWORK PULSE</p><h2>Platform snapshot</h2></div><span className="data-caption">Values appear when reported by connected sources</span></div>
    <div className="metric-grid">{metricCards.map(card => {
      const metric = metrics[card.key]
      const Icon = card.icon
      return <article key={card.key} className={`overview-metric tone-${card.tone}`}><div className="metric-top"><span className="metric-icon"><Icon size={18}/></span><span className="metric-source">{card.note}</span></div><p className="metric-label">{card.name}</p><div className="metric-value-row"><strong>{valueText(metric?.value)}</strong><span className="metric-status" title={metric?.status?.reason || ''}>{metric?.status?.state || 'Not connected'}</span></div><div className="metric-bottom"><span>{metric?.status?.reason || 'Waiting for source data'}</span><span className="mini-bars" aria-hidden="true"><i/><i/><i/><i/><i/></span></div></article>
    })}</div>
    <section className="block-analytics" aria-labelledby="block-analytics-title">
      <div className="block-analytics-heading">
        <div><p className="eyebrow">FABRIC LEDGER · OBSERVED DATA</p><h2 id="block-analytics-title">Blocks &amp; transactions</h2><p className="block-analytics-subtitle">Counts are derived from committed block metadata retained by the collector.</p></div>
        <label className="block-window-control"><span>History</span><select value={blockWindow} onChange={event => setBlockWindow(event.target.value)}><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
      </div>
      {blockError && <p role="alert" className="dashboard-message is-error">{blockError}</p>}
      <div className="block-stat-grid">
        <article className="block-stat-card"><span className="block-stat-icon"><Blocks size={18}/></span><span className="block-stat-label">Total ledger blocks</span><strong>{valueText(blockData?.totalLedgerBlocks)}</strong><small>{blockData?.status?.state === 'OK' ? `Last processed: ${blockData.latestProcessedBlock}` : blockData?.status?.reason || 'Waiting for Fabric collector'}</small></article>
        <article className="block-stat-card"><span className="block-stat-icon tx"><ArrowUpRight size={18}/></span><span className="block-stat-label">Transactions in latest observed block</span><strong>{valueText(blockData?.transactionsInLatestObservedBlock)}</strong><small>{blockData?.observedBlocksInWindow ? `${blockData.observedBlocksInWindow} transaction-bearing blocks in this window` : 'No retained transaction data'}</small></article>
        <article className="block-stat-card"><span className="block-stat-icon daily"><Activity size={18}/></span><span className="block-stat-label">Transactions in selected window</span><strong>{valueText(blockData?.transactionsInWindow)}</strong><small>From retained Fabric commit and validation events</small></article>
      </div>
      <div className="block-chart-card">
        <div className="block-chart-title"><div><h3>Ledger activity over time</h3><p>{blockData?.bucket === 'hour' ? 'Hourly' : 'Daily'} counts · UTC</p></div><div className="chart-legend"><span><i className="legend-blocks"/>Blocks</span><span><i className="legend-transactions"/>Transactions</span></div></div>
        {blockLoading ? <p className="dashboard-message">Loading Fabric block history…</p> : blockData?.history?.length ? <div className="block-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={blockData.history} margin={{ top: 12, right: 14, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--chart-grid)"/><XAxis dataKey="timestamp" tickFormatter={value => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...(blockWindow === '24h' ? { hour: 'numeric' } : {}) }).format(new Date(value))} minTickGap={28} tick={{ fill: 'var(--chart-label)', fontSize: 10 }}/><YAxis allowDecimals={false} tick={{ fill: 'var(--chart-label)', fontSize: 10 }}/><Tooltip labelFormatter={value => new Date(value).toLocaleString()} contentStyle={{ borderRadius: 12, borderColor: 'var(--chart-grid)', background: 'var(--chart-tooltip)', color: 'var(--workspace-text)' }}/><Bar dataKey="blocks" name="Blocks" fill="#7eb0ff" radius={[5,5,0,0]} maxBarSize={24}/><Line dataKey="transactions" name="Transactions" stroke="#16a878" strokeWidth={2.5} dot={{ r: 3, fill: '#16a878' }} activeDot={{ r: 5 }}/></ComposedChart></ResponsiveContainer></div> : <div className="block-chart-empty"><Blocks size={23}/><strong>No real block history available</strong><span>{blockData?.status?.reason || 'The chart will populate after the Fabric collector records block transactions.'}</span></div>}
        {blockData?.coverageStart && <p className="chart-coverage">Available retained history from {new Date(blockData.coverageStart).toLocaleString()} · empty blocks are included in total height but cannot be assigned to a day without a ledger timestamp.</p>}
      </div>
    </section>
    <div className="overview-footnote"><span className="footnote-dot"/>No patient records or clinical values are displayed on this operational dashboard. Mock events, if enabled, are labelled by the source.</div>
  </section>
}
