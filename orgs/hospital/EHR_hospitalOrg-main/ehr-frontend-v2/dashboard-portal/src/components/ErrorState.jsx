import React from 'react'
import { AlertCircle } from 'lucide-react'

export function ErrorState({ title = 'Error', message }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-red-600 bg-red-50 rounded-lg border border-red-100">
      <AlertCircle className="w-10 h-10 mb-3 text-red-500" />
      <h3 className="font-medium text-lg">{title}</h3>
      {message && <p className="mt-1 text-red-500/80 text-sm">{message}</p>}
    </div>
  )
}
