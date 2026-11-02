import React from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Network, Bot, ArrowRightLeft, Shield, Database, ScrollText, LogOut, Activity } from 'lucide-react'
import { useDashboardSocket } from '../../hooks/useDashboardSocket'
import { allowedViews } from '../../config/roleViews'
import ThemeToggle from '../ThemeToggle'

const navItems = [
  { path: '/overview', key: 'overview', label: 'Overview', icon: LayoutDashboard }, { path: '/network', key: 'network', label: 'Network', icon: Network },
  { path: '/agents', key: 'agents', label: 'Agents', icon: Bot }, { path: '/transactions', key: 'transactions', label: 'Transactions', icon: ArrowRightLeft },
  { path: '/security', key: 'security', label: 'Security', icon: Shield }, { path: '/ipfs', key: 'ipfs', label: 'IPFS', icon: Database }, { path: '/logs', key: 'logs', label: 'Logs', icon: ScrollText },
]

export function Layout({ user, onLogout }) {
  const { isConnected, lastBlock, events } = useDashboardSocket()
  return <div className="dashboard-shell min-h-screen bg-slate-50">
    <header className="dashboard-topbar sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-xl md:px-8">
      <div className="dashboard-topbar-inner mx-auto flex max-w-[1600px] flex-wrap items-center gap-4">
        <div className="flex min-w-[205px] items-center gap-3">
          <span className="dashboard-brand-mark"><Activity size={19}/></span>
          <div><div className="font-bold tracking-tight text-slate-900">Care<span className="text-blue-600">Ops</span></div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">EHR observability</div></div>
        </div>
        <nav className="dashboard-nav flex flex-1 items-center gap-1 overflow-x-auto" aria-label="Dashboard navigation">
          {navItems.filter(item => allowedViews(user?.role).includes(item.key)).map(item => <NavLink key={item.path} to={item.path} className={({ isActive }) => `dashboard-nav-link ${isActive ? 'is-active' : ''}`}><item.icon size={16}/><span>{item.label}</span></NavLink>)}
        </nav>
        <div className="dashboard-user flex items-center gap-3">
          <div className="hidden text-right sm:block"><div className="max-w-36 truncate text-xs font-semibold text-slate-800">{user?.username || user?.userId}</div><div className="text-[10px] capitalize text-slate-500">{user?.role}</div></div>
          <span className={`dashboard-live-dot ${isConnected ? 'is-live' : ''}`} title={isConnected ? 'Live stream connected' : 'Stream not connected'} />
          <ThemeToggle />
          <button onClick={onLogout} className="dashboard-logout" aria-label="Log out"><LogOut size={16}/><span className="hidden sm:inline">Log out</span></button>
        </div>
      </div>
      <div className="dashboard-statusline mx-auto mt-2 flex max-w-[1600px] flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500"><span>{isConnected ? 'Live event stream' : 'Stream not connected'}</span><span>Latest block <b className="font-semibold text-slate-700">{lastBlock ?? 'Unavailable'}</b></span><span>{events.length} recent stream events</span></div>
    </header>
    <main className="mx-auto w-full max-w-[1600px] p-4 md:p-8"><Outlet/></main>
  </div>
}
