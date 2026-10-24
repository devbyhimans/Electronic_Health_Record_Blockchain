import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import Overview from './pages/Overview'
import Network from './pages/Network'
import Transactions from './pages/Transactions'
import Security from './pages/Security'
import IPFS from './pages/IPFS'
import Logs from './pages/Logs'
import Agents from './pages/Agents'
import { AgentDashboard } from './components/AgentDashboard'

function App() {
  return (
    <BrowserRouter
      basename="/dashboard"
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="network" element={<Network />} />
          <Route path="agents" element={<Agents />} />
          <Route path="agents/:agentId" element={<AgentDashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="security" element={<Security />} />
          <Route path="ipfs" element={<IPFS />} />
          <Route path="logs" element={<Logs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
