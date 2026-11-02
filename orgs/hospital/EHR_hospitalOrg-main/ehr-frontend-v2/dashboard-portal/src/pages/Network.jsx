import React from 'react'
import { DataView } from '../components/DataView'
export default function Network() {
  return <DataView
    title="Network topology"
    description="Peer status and block height require Fabric observations. Application health checks are listed separately."
    path="/network"
    rows={data => [
      ...(data?.peers || []).map(row => ({ ...row, rowKind: 'Peer' })),
      ...(data?.orderers || []).map(row => ({ ...row, rowKind: 'Orderer' })),
      ...(data?.services || []).map(row => ({ ...row, rowKind: `${row.kind} service`, blockHeight: null })),
    ]}
    columns={[
      { label: 'Name', key: 'id' },
      { label: 'Type', key: 'rowKind' },
      { label: 'Organization', render: row => row.org || row.mspId || '—' },
      { label: 'Status', render: row => row.status?.state || 'Not connected' },
      { label: 'Block height', render: row => row.blockHeight ?? '—' },
      { label: 'Details', render: row => row.status?.reason || (row.rowKind?.endsWith('service') ? 'HTTP health check only; Fabric peer status is separate.' : row.heightStatus?.reason || '—') },
      { label: 'Last checked', render: row => row.lastCheckedAt || row.status?.since || '—' },
    ]}
  />
}
