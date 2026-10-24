import React from 'react'

export function DataTable({ columns, data, loading, emptyMessage = 'No data available' }) {
  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading data...</div>
  }
  
  if (!data || data.length === 0) {
    return <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">{emptyMessage}</div>
  }

  return (
    <div className="overflow-x-auto w-full bg-white rounded-lg border border-slate-200 shadow-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((col, i) => (
              <th key={i} className="py-3 px-4 text-sm font-medium text-slate-600 whitespace-nowrap">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors last:border-0">
              {columns.map((col, j) => (
                <td key={j} className="py-3 px-4 text-sm text-slate-800">
                  {col.cell ? col.cell(row) : row[col.accessorKey]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
