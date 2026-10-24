import React from 'react'

export function StatusBadge({ status }) {
  const styles = {
    ONLINE: 'bg-emerald-100 text-emerald-700',
    OFFLINE: 'bg-red-100 text-red-700',
    DEGRADED: 'bg-amber-100 text-amber-700',
  }
  const cls = styles[status] || 'bg-gray-100 text-gray-500'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}
