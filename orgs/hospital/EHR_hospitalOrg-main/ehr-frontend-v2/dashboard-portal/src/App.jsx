import React, { useEffect, useState } from 'react'
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
import { hasDashboardAuth, loginDashboard, logoutDashboard, readDashboardUser } from './services/api'
import { allowedViews } from './config/roleViews'

function Login({ onLogin }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); try { onLogin(await loginDashboard(username, password)) } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <main className="min-h-screen grid place-items-center bg-slate-100 p-4"><form onSubmit={submit} className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-5"><div><h1 className="text-2xl font-bold">Dashboard sign in</h1><p className="text-slate-500 mt-1">Use your hospital account. Access is determined by your assigned role.</p></div>{error && <div role="alert" className="p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>}<label className="block text-sm font-medium">Username<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} className="mt-1 block w-full border rounded-lg px-3 py-2" required /></label><label className="block text-sm font-medium">Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 block w-full border rounded-lg px-3 py-2" required /></label><button disabled={busy} className="w-full rounded-lg bg-blue-600 text-white py-2 font-medium disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button></form></main>
}

function AccessDenied({ onLogout }) { return <main className="min-h-screen grid place-items-center p-6"><section className="max-w-lg bg-white border rounded-xl p-8"><h1 className="text-2xl font-bold">Dashboard access unavailable</h1><p className="mt-3 text-slate-600">This account’s role is not enabled for dashboard views on this deployment.</p><button onClick={onLogout} className="mt-5 rounded-lg bg-slate-900 text-white px-4 py-2">Sign out</button></section></main> }

function App() {
  const [user, setUser] = useState(() => hasDashboardAuth() ? readDashboardUser() : null)
  useEffect(() => { const unauthorized = () => { logoutDashboard(); setUser(null) }; window.addEventListener('dashboard:unauthorized', unauthorized); return () => window.removeEventListener('dashboard:unauthorized', unauthorized) }, [])
  const views = allowedViews(user?.role)
  const home = views.includes('overview') ? '/overview' : views.includes('agents') ? '/agents' : '/denied'
  const basename = window.location.pathname.startsWith('/dashboard') ? '/dashboard' : undefined
  return <BrowserRouter basename={basename} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login onLogin={setUser} />} />
    <Route path="/denied" element={user && !views.length ? <AccessDenied onLogout={() => { logoutDashboard(); setUser(null) }} /> : <Navigate to={home} replace />} />
    <Route path="/" element={user ? <Layout user={user} onLogout={() => { logoutDashboard(); setUser(null) }} /> : <Navigate to="/login" replace />}>
      <Route index element={<Navigate to={home} replace />} />
      <Route path="overview" element={views.includes('overview') ? <Overview /> : <Navigate to={home} replace />} />
      <Route path="network" element={views.includes('network') ? <Network /> : <Navigate to={home} replace />} />
      <Route path="agents" element={views.includes('agents') ? <Agents /> : <Navigate to={home} replace />} />
      <Route path="agents/:agentId" element={views.includes('agents') ? <AgentDashboard /> : <Navigate to={home} replace />} />
      <Route path="transactions" element={views.includes('transactions') ? <Transactions /> : <Navigate to={home} replace />} />
      <Route path="security" element={views.includes('security') ? <Security /> : <Navigate to={home} replace />} />
      <Route path="ipfs" element={views.includes('ipfs') ? <IPFS /> : <Navigate to={home} replace />} />
      <Route path="logs" element={views.includes('logs') ? <Logs /> : <Navigate to={home} replace />} />
    </Route><Route path="*" element={<Navigate to={user ? home : '/login'} replace />} />
  </Routes></BrowserRouter>
}
export default App
