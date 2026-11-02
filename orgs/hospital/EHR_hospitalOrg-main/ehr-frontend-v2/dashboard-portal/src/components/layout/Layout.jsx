import React from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Network, Bot, ArrowRightLeft, Shield, Database, ScrollText, LogOut } from 'lucide-react'
import { useDashboardSocket } from '../../hooks/useDashboardSocket'
import { allowedViews } from '../../config/roleViews'

const navItems = [
  { path: '/overview', key: 'overview', label: 'Overview', icon: LayoutDashboard }, { path: '/network', key: 'network', label: 'Network', icon: Network },
  { path: '/agents', key: 'agents', label: 'Agents', icon: Bot }, { path: '/transactions', key: 'transactions', label: 'Transactions', icon: ArrowRightLeft },
  { path: '/security', key: 'security', label: 'Security', icon: Shield }, { path: '/ipfs', key: 'ipfs', label: 'IPFS', icon: Database }, { path: '/logs', key: 'logs', label: 'Logs', icon: ScrollText },
]

export function Layout({ user, onLogout }) {
  const { isConnected, lastBlock, events } = useDashboardSocket();
  return <div className="min-h-screen bg-slate-50 md:flex">
    <aside className="md:w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0">
      <div className="h-16 flex items-center px-6 font-bold text-xl text-white border-b border-slate-800">EHR Dashboard</div>
      <nav className="flex-1 overflow-x-auto md:overflow-y-auto py-3"><ul className="flex md:block gap-1 px-3">
        {navItems.filter(item => allowedViews(user?.role).includes(item.key)).map(item => <li key={item.path} className="shrink-0"><NavLink to={item.path} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><item.icon size={18}/><span className="text-sm">{item.label}</span></NavLink></li>)}
      </ul></nav>
    </aside>
    <div className="flex-1 min-w-0 flex flex-col min-h-screen">
      <header className="min-h-16 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3">
        <div><h2 className="font-medium text-slate-800">EHR Platform Observability</h2><p className="text-xs text-slate-500">{user?.username || user?.userId} · {user?.role}</p></div>
        <div className="flex items-center gap-4 text-sm"><span className="text-slate-600">Last block: {lastBlock ?? 'No data'}</span><span className="text-slate-600" aria-live="polite">Recent stream events: {events.length}</span><span className={isConnected ? 'text-emerald-700' : 'text-slate-500'}>{isConnected ? 'Connected' : 'Not connected'}</span><button onClick={onLogout} className="flex items-center gap-2 text-slate-600 hover:text-slate-900" aria-label="Log out"><LogOut size={16}/>Log out</button></div>
      </header>
      <main className="flex-1 overflow-y-auto p-4 md:p-6"><Outlet/></main>
    </div>
  </div>
}
