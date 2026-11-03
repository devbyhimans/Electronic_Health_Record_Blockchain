import React from 'react'
import { DataView, eventRows } from '../components/DataView'
import { readDashboardUser } from '../services/api'
export default function Transactions() {
  const admin = readDashboardUser()?.role === 'admin'
  return <DataView title="Transactions" description="Transaction events derived from the authorized event stream." path="/transactions" rows={eventRows} columns={[
    { label: 'Event ID', key: 'eventId' }, { label: 'Type', key: 'eventType' }, { label: 'Status', key: 'status' }, { label: 'Time', key: 'timestamp' },
    ...(admin ? [{ label: 'Patient reference hash', render: row => row.payload?.patientIdHash || '—' }] : []),
  ]}/>
}
