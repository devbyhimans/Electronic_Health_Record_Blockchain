import React from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Network, Bot, ArrowRightLeft, Shield, Database, ScrollText } from 'lucide-react'
import { useDashboardSocket } from '../../hooks/useDashboardSocket'

const navItems = [
  { path: '/overview', label: 'Overview', icon: LayoutDashboard },
  { path: '/network', label: 'Network', icon: Network },
  { path: '/agents', label: 'Agents', icon: Bot },
  { path: '/transactions', label: 'Transactions', icon: ArrowRightLeft },
  { path: '/security', label: 'Security', icon: Shield },
  { path: '/ipfs', label: 'IPFS', icon: Database },
  { path: '/logs', label: 'Logs', icon: ScrollText },
]

export function Layout() {
  const { isConnected, lastBlock, emergencyAlert } = useDashboardSocket();
  
  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div className="h-16 flex items-center px-6 font-display font-bold text-xl text-white border-b border-slate-800">
          EHR Dashboard
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <item.icon size={20} />
                  <span className="font-medium text-sm">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10">
          <div className="flex items-center">
             <h2 className="text-lg font-medium text-slate-800">EHR Platform Observability</h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-sm font-medium text-slate-600">Last Block:</span>
              <span className="text-sm font-mono text-slate-900 font-bold">#{lastBlock || '---'}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`relative flex h-3 w-3`}>
                {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
              </div>
              <span className={`text-sm font-medium ${isConnected ? 'text-emerald-700' : 'text-red-700'}`}>
                {isConnected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </header>

        {emergencyAlert && (
          <div className="bg-red-600 text-white px-6 py-3 flex items-center justify-center font-medium animate-pulse shadow-md z-20">
            EMERGENCY ACCESS INVOKED - PLEASE REVIEW AUDIT LOGS
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
