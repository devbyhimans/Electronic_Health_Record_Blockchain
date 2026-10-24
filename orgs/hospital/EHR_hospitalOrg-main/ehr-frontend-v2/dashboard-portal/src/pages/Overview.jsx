import React from 'react'
import { Activity, Users, ShieldCheck, Database, ArrowUpRight, ArrowDownRight, Server, Box } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { StatusBadge } from '../components/StatusBadge'
import { agentConfig } from '../config/agentConfig'

const mockChartData = Array.from({ length: 7 }).map((_, i) => ({
  name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
  txs: Math.floor(Math.random() * 5000) + 2000,
}))

export default function Overview() {
  const stats = [
    { label: 'Network Health', value: '99.99%', icon: Activity, trend: '+0.01%', positive: true },
    { label: 'Active Peers', value: Object.keys(agentConfig).length, icon: Server, trend: 'Stable', positive: true },
    { label: 'Total Transactions', value: '1.2M', icon: Box, trend: '+12%', positive: true },
    { label: 'Security Incidents', value: '0', icon: ShieldCheck, trend: '-2', positive: true },
  ]

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Overview</h1>
          <p className="text-slate-500 mt-1">High-level metrics and system observability.</p>
        </div>
        <div className="flex gap-3">
           <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium text-sm">Export Report</button>
           <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm">System Check</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                <stat.icon size={22} />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${stat.positive ? 'text-emerald-600' : 'text-red-600'}`}>
                {stat.positive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                {stat.trend}
              </div>
            </div>
            <h3 className="text-slate-500 text-sm font-medium">{stat.label}</h3>
            <div className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
             <h2 className="text-lg font-semibold text-slate-800">Transaction Volume</h2>
             <select className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
             </select>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData}>
                <defs>
                  <linearGradient id="colorTxs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Area type="monotone" dataKey="txs" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTxs)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">System Health</h2>
          <div className="space-y-6">
             {['Core API', 'Blockchain Network', 'IPFS Storage', 'AI Agent Gateway'].map((service, i) => (
                <div key={i} className="flex items-center justify-between group">
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse group-hover:scale-125 transition-transform" />
                      <span className="font-medium text-slate-700 group-hover:text-slate-900 transition-colors">{service}</span>
                   </div>
                   <StatusBadge status="ONLINE" />
                </div>
             ))}
             <div className="pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                   <span className="text-sm font-medium text-slate-500">Storage Capacity</span>
                   <span className="text-sm font-medium text-slate-700">68%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                   <div className="bg-blue-500 h-2 rounded-full transition-all duration-1000 ease-out" style={{width: '68%'}}></div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
