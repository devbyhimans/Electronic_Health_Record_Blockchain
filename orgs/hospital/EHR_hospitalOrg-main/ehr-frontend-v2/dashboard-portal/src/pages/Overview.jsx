import React, { useState, useRef, useEffect } from 'react'
import { Activity, ArrowUpRight, Bot, Database, Network, ShieldAlert, Waves, Blocks, Box, Layers, ShieldCheck, Copy, Check } from 'lucide-react'
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

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)
  const copy = (e) => {
    e.stopPropagation()
    if (value) {
      navigator.clipboard?.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <div className="block-field">
      {label && (
        <div className="block-field-label">
          <span>{label}</span>
          {copied && <span className="text-emerald-500 font-bold flex items-center gap-1 text-[9px]"><Check size={10} /> Copied!</span>}
        </div>
      )}
      <div className="block-field-value">
        <span>{value || '—'}</span>
        {value && (
          <button type="button" onClick={copy} className="copy-btn" title="Copy to clipboard">
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          </button>
        )}
      </div>
    </div>
  )
}

function BlockCard({ block, isLatest, isSelected, onClick, onHoverStart, onHoverEnd }) {
  const shortHash = block.blockHash ? `${block.blockHash.slice(0, 8)}...${block.blockHash.slice(-6)}` : '—'

  return (
    <div
      className="block-card-wrapper"
      onMouseEnter={(e) => onHoverStart(block, e.currentTarget)}
      onMouseLeave={onHoverEnd}
      onClick={() => onClick(block)}
    >
      <div className={`block-item ${isLatest ? 'is-latest' : ''} ${isSelected ? 'is-selected' : ''}`}>
        <div className="block-top-row">
          <span className="block-number-tag">
            <Box size={14} className="text-blue-500" />
            #{block.blockNumber}
          </span>
          {isLatest && <span className="block-latest-badge">LATEST</span>}
        </div>
        <div className="block-hash-preview">
          {shortHash}
        </div>
        <div className="block-meta-row">
          <span>{block.txCount || 0} tx</span>
          <span className="text-[9px]">
            {block.timestamp ? new Date(block.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

function CustomChartTooltip({ active, payload, label, blocks = [] }) {
  if (active && payload && payload.length) {
    const bucketDate = new Date(label).toLocaleString()
    const blocksCount = payload.find(p => p.dataKey === 'blocks')?.value ?? 0
    const txCount = payload.find(p => p.dataKey === 'transactions')?.value ?? 0
    const matching = blocks.filter(b => {
      const bTime = new Date(b.timestamp).getTime()
      const lTime = new Date(label).getTime()
      return Math.abs(bTime - lTime) <= 86400000
    })

    return (
      <div className="chart-custom-tooltip">
        <p className="chart-tooltip-time">{bucketDate}</p>
        <div className="chart-tooltip-stats">
          <span><i className="legend-blocks inline-block w-2 h-2 rounded-sm mr-1.5" />{blocksCount} Blocks</span>
          <span><i className="legend-transactions inline-block w-2 h-2 rounded-sm mr-1.5" />{txCount} Transactions</span>
        </div>
        {matching.length > 0 && (
          <div className="chart-tooltip-blocks">
            {matching.slice(0, 3).map(mb => (
              <div key={mb.blockNumber} className="chart-tooltip-block-row">
                <strong>#{mb.blockNumber}</strong>
                <code className="text-[9px] font-mono text-slate-500">{mb.blockHash?.slice(0, 14)}…</code>
              </div>
            ))}
            {matching.length > 3 && <small className="text-slate-400">+{matching.length - 3} more blocks</small>}
          </div>
        )}
      </div>
    )
  }
  return null
}

export default function Overview() {
  const { data, error, loading } = useDashboardData('/overview')
  const [blockWindow, setBlockWindow] = useState('24h')
  const { data: blockData, error: blockError, loading: blockLoading } = useDashboardData(`/blocks/metrics?window=${blockWindow}`)
  
  const [hoveredBlock, setHoveredBlock] = useState(null)
  const [hoverPos, setHoverPos] = useState(null)
  const [selectedBlock, setSelectedBlock] = useState(null)
  const hoverTimeoutRef = useRef(null)

  useEffect(() => {
    if (!selectedBlock && blockData?.blocks?.length > 0) {
      setSelectedBlock(blockData.blocks[0])
    }
  }, [blockData?.blocks, selectedBlock])

  const handleHoverStart = (block, element) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    const rect = element.getBoundingClientRect()
    const showBelow = rect.top < 380
    const top = showBelow ? rect.bottom + 12 : rect.top - 12
    const left = Math.max(200, Math.min(window.innerWidth - 200, rect.left + rect.width / 2))
    setHoverPos({ top, left, showBelow })
    setHoveredBlock(block)
  }

  const handleHoverEnd = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredBlock(null)
      setHoverPos(null)
    }, 150)
  }

  const handleTooltipEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
  }

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
        <div>
          <p className="eyebrow">FABRIC LEDGER · OBSERVED DATA</p>
          <h2 id="block-analytics-title">Blocks &amp; transactions</h2>
          <p className="block-analytics-subtitle">Counts are derived from committed block metadata retained by the collector.</p>
        </div>
        <label className="block-window-control">
          <span>History</span>
          <select value={blockWindow} onChange={event => setBlockWindow(event.target.value)}>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </label>
      </div>

      {blockError && <p role="alert" className="dashboard-message is-error">{blockError}</p>}

      <div className="block-stat-grid">
        <article className="block-stat-card"><span className="block-stat-icon"><Blocks size={18}/></span><span className="block-stat-label">Total ledger blocks</span><strong>{valueText(blockData?.totalLedgerBlocks)}</strong><small>{blockData?.status?.state === 'OK' ? `Last processed: ${blockData.latestProcessedBlock}` : blockData?.status?.reason || 'Waiting for Fabric collector'}</small></article>
        <article className="block-stat-card"><span className="block-stat-icon tx"><ArrowUpRight size={18}/></span><span className="block-stat-label">Transactions in latest observed block</span><strong>{valueText(blockData?.transactionsInLatestObservedBlock)}</strong><small>{blockData?.observedBlocksInWindow ? `${blockData.observedBlocksInWindow} transaction-bearing blocks in this window` : 'No retained transaction data'}</small></article>
        <article className="block-stat-card"><span className="block-stat-icon daily"><Activity size={18}/></span><span className="block-stat-label">Transactions in selected window</span><strong>{valueText(blockData?.transactionsInWindow)}</strong><small>From retained Fabric commit and validation events</small></article>
      </div>

      {/* Interactive Ledger Blocks Chain Stream */}
      <div className="block-chart-card">
        <div className="block-chart-title">
          <div>
            <h3>Committed Ledger Blocks</h3>
            <p>Click any block to pin full inspection details below, or hover to preview hash and node address.</p>
          </div>
          <span className="text-[11px] font-medium text-slate-500">
            {blockData?.blocks?.length ? `${blockData.blocks.length} blocks in view` : 'Observing chain'}
          </span>
        </div>
        {blockLoading ? (
          <p className="dashboard-message mt-3">Loading ledger blocks…</p>
        ) : blockData?.blocks?.length ? (
          <>
            <div className="block-chain-container">
              {blockData.blocks.map((b, idx) => (
                <React.Fragment key={b.blockNumber}>
                  <BlockCard
                    block={b}
                    isLatest={idx === 0}
                    isSelected={selectedBlock?.blockNumber === b.blockNumber}
                    onClick={(blk) => setSelectedBlock(selectedBlock?.blockNumber === blk.blockNumber ? null : blk)}
                    onHoverStart={handleHoverStart}
                    onHoverEnd={handleHoverEnd}
                  />
                  {idx < blockData.blocks.length - 1 && <div className="block-connector" />}
                </React.Fragment>
              ))}
            </div>

            {/* Dedicated Detailed Inspector for Selected Block */}
            {selectedBlock && (
              <div className="block-inspector-panel">
                <div className="block-inspector-header">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-blue-500" />
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                      Block #{selectedBlock.blockNumber} Details
                    </h4>
                    {selectedBlock.blockNumber === blockData?.blocks?.[0]?.blockNumber && (
                      <span className="block-latest-badge">LATEST</span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                      <ShieldCheck size={11} /> Verified Ledger Block
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedBlock(null)}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                  >
                    Close Inspector ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <CopyField label="Cryptographic Block Hash" value={selectedBlock.blockHash} />
                  <CopyField label="Public Node Address &amp; Channel" value={`${selectedBlock.publicAddress || 'peer0.hospital.example.com:7051'} · ${selectedBlock.channel || 'ehrchannel'}`} />
                  <CopyField label="Previous Block Hash" value={selectedBlock.previousHash || 'Genesis Block (0x0)'} />
                  <CopyField label="Block Data Hash (Payload Merkle Root)" value={selectedBlock.dataHash} />
                </div>

                <div className="block-field mt-3">
                  <div className="block-field-label">
                    <span>Transactions &amp; Block Timestamp</span>
                    <span className="text-slate-400 font-normal">
                      {selectedBlock.timestamp ? new Date(selectedBlock.timestamp).toUTCString() : '—'}
                    </span>
                  </div>
                  <div className="block-field-value text-xs flex-col !items-start gap-1.5">
                    <div className="flex items-center justify-between w-full">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {selectedBlock.txCount || (selectedBlock.txIds?.length ?? 0)} transaction(s) committed
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Local: {selectedBlock.timestamp ? new Date(selectedBlock.timestamp).toLocaleString() : '—'}
                      </span>
                    </div>
                    {selectedBlock.txIds && selectedBlock.txIds.length > 0 && (
                      <div className="w-full mt-1 space-y-1.5">
                        {selectedBlock.txIds.map((txId, idx) => (
                          <div key={idx} className="font-mono text-[11px] text-blue-600 dark:text-blue-400 flex items-center justify-between bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800">
                            <span className="truncate pr-2">Tx #{idx + 1}: {txId}</span>
                            <CopyField label="" value={txId} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="block-chart-empty py-6">
            <Blocks size={22} />
            <strong>No blocks observed in this time window</strong>
            <span>Switch history dropdown to "All time" to inspect all ledger blocks since genesis.</span>
          </div>
        )}
      </div>

      <div className="block-chart-card">
        <div className="block-chart-title"><div><h3>Ledger activity over time</h3><p>{blockData?.bucket === 'hour' ? 'Hourly' : 'Daily'} counts · UTC</p></div><div className="chart-legend"><span><i className="legend-blocks"/>Blocks</span><span><i className="legend-transactions"/>Transactions</span></div></div>
        {blockLoading ? <p className="dashboard-message">Loading Fabric block history…</p> : blockData?.history?.length ? <div className="block-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={blockData.history} margin={{ top: 12, right: 14, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--chart-grid)"/><XAxis dataKey="timestamp" tickFormatter={value => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...(blockWindow === '24h' ? { hour: 'numeric' } : {}) }).format(new Date(value))} minTickGap={28} tick={{ fill: 'var(--chart-label)', fontSize: 10 }}/><YAxis allowDecimals={false} tick={{ fill: 'var(--chart-label)', fontSize: 10 }}/><Tooltip content={<CustomChartTooltip blocks={blockData?.blocks} />} /><Bar dataKey="blocks" name="Blocks" fill="#7eb0ff" radius={[5,5,0,0]} maxBarSize={24}/><Line dataKey="transactions" name="Transactions" stroke="#16a878" strokeWidth={2.5} dot={{ r: 3, fill: '#16a878' }} activeDot={{ r: 5 }}/></ComposedChart></ResponsiveContainer></div> : <div className="block-chart-empty"><Blocks size={23}/><strong>No real block history available</strong><span>{blockData?.status?.reason || 'The chart will populate after the Fabric collector records block transactions.'}</span></div>}
        {blockData?.coverageStart && <p className="chart-coverage">Available retained history from {new Date(blockData.coverageStart).toLocaleString()} · empty blocks are included in total height but cannot be assigned to a day without a ledger timestamp.</p>}
      </div>
    </section>

    {/* Floating Tooltip rendered at root of Overview so never clipped */}
    {hoveredBlock && hoverPos && (
      <div
        className={`block-floating-tooltip ${hoverPos.showBelow ? 'arrow-up' : 'arrow-down'}`}
        style={{
          top: hoverPos.top,
          left: hoverPos.left,
          transform: hoverPos.showBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)',
        }}
        onMouseEnter={handleTooltipEnter}
        onMouseLeave={handleHoverEnd}
        role="tooltip"
      >
        <div className="block-tooltip-header">
          <div className="block-tooltip-title">
            <Layers size={16} className="text-blue-500" />
            <span>Block #{hoveredBlock.blockNumber}</span>
            {hoveredBlock.blockNumber === blockData?.blocks?.[0]?.blockNumber && (
              <span className="block-latest-badge">LATEST</span>
            )}
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
            <ShieldCheck size={11} /> Verified
          </span>
        </div>

        <CopyField label="Block Hash" value={hoveredBlock.blockHash} />
        <CopyField label="Public Node Address" value={hoveredBlock.publicAddress} />
        <CopyField label="Previous Block Hash" value={hoveredBlock.previousHash || 'Genesis (Block 0)'} />
        <CopyField label="Data Hash" value={hoveredBlock.dataHash} />

        <div className="block-field">
          <div className="block-field-label"><span>Transactions &amp; Timestamp</span></div>
          <div className="block-field-value text-[10px] flex-col !items-start gap-1">
            <div className="flex items-center justify-between w-full">
              <span>{hoveredBlock.txCount || 0} transaction(s) committed</span>
              <span className="text-slate-400">{hoveredBlock.timestamp ? new Date(hoveredBlock.timestamp).toLocaleString() : '—'}</span>
            </div>
            {hoveredBlock.txIds && hoveredBlock.txIds.length > 0 && (
              <div className="w-full text-slate-500 dark:text-slate-400 font-mono text-[9px] truncate">
                Tx: {hoveredBlock.txIds[0]}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    <div className="overview-footnote"><span className="footnote-dot"/>No patient records or clinical values are displayed on this operational dashboard. Mock events, if enabled, are labelled by the source.</div>
  </section>
}


