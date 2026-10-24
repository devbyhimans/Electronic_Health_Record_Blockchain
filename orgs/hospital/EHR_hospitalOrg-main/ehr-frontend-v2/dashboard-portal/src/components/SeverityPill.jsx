import React from 'react'

export function SeverityPill({ severity }) {
  const styles = {
    INFO: 'bg-blue-100 text-blue-700',
    WARNING: 'bg-amber-100 text-amber-700',
    CRITICAL: 'bg-red-100 text-red-700',
  }
  const cls = styles[severity] || 'bg-slate-100 text-slate-700'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase ${cls}`}>
      {severity}
    </span>
  )
}
