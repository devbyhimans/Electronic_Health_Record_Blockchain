import React from 'react'

export function MetricCard({ title, value, icon: Icon, trend }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
        {Icon && <Icon className="text-slate-400 w-5 h-5" />}
      </div>
      <div className="flex items-end gap-3">
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
        {trend !== undefined && (
          <div className={`text-sm font-medium mb-1 ${trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-600' : 'text-slate-500'}`}>
            {trend > 0 ? '+' : ''}{trend}%
          </div>
        )}
      </div>
    </div>
  )
}
