import React from 'react'
import { Link } from 'react-router-dom'
import { DataView, eventRows, valueText } from '../components/DataView'

export default function Agents() {
  return <DataView title="Agents and peers" description="Only the agents and peers authorized for your account are listed." path="/agents" rows={eventRows} columns={[
    { label: 'Name', render: row => <Link className="text-blue-700 hover:underline" to={`/agents/${encodeURIComponent(row.id)}`}>{row.name || row.id}</Link> },
    { label: 'Type', key: 'kind' }, { label: 'Organization', key: 'org' }, { label: 'Status', render: row => valueText(row.status) }, { label: 'Health data', render: row => row.status?.reason || 'Reported by producer only' },
  ]}/>
}
