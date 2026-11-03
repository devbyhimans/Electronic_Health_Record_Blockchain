import React from 'react'
import { DataView, eventRows } from '../components/DataView'
export default function Logs() { return <DataView title="Event log" description="Sanitized operational event metadata from connected producers." path="/logs/events" rows={eventRows} columns={[{ label: 'Time', key: 'timestamp' }, { label: 'Type', key: 'eventType' }, { label: 'Severity', key: 'severity' }, { label: 'Source', key: 'source' }, { label: 'Status', key: 'status' }]} /> }
