import React from 'react'
import { DataView, eventRows } from '../components/DataView'
export default function Security() { return <DataView title="Security events" description="Consent, authorization, emergency access, and security event metadata." path="/security/events" rows={eventRows} columns={[{ label: 'Event', key: 'eventType' }, { label: 'Severity', key: 'severity' }, { label: 'Organization', key: 'org' }, { label: 'Time', key: 'timestamp' }, { label: 'Source', key: 'source' }]} /> }
