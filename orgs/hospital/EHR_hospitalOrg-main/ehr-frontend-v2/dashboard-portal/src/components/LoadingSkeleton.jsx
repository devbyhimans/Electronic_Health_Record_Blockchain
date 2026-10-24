import React from 'react'

export function LoadingSkeleton({ className = '' }) {
  return (
    <div className={`animate-pulse bg-slate-200 rounded-md ${className}`}></div>
  )
}
