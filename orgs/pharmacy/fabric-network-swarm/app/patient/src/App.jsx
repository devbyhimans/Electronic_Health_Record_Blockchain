import { useEffect, useState } from 'react'
import { Activity, ArrowUpRight, CalendarDays, FileHeart, LockKeyhole, ShieldCheck, Stethoscope } from 'lucide-react'
import ThemeToggle from './ThemeToggle.jsx'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/pharmacy'

export default function App() {
  const [service, setService] = useState('checking')
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE_URL}/health`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Pharmacy service unavailable')
        return response.json()
      })
      .then(() => setService('available'))
      .catch(error => { if (error.name !== 'AbortError') setService('unavailable') })
    return () => controller.abort()
  }, [])

  const reachable = service === 'available'
  return <div className="patient-app">
    <header className="patient-header">
      <a className="brand" href="#home" aria-label="CarePoint patient home"><span className="brand-symbol"><Activity size={20}/></span><span>CarePoint<small>PHARMACY PATIENT PORTAL</small></span></a>
      <div className="header-actions"><span className={`service-pill ${reachable ? 'is-up' : ''}`}><i/>{service === 'checking' ? 'Checking service' : reachable ? 'Service reachable' : 'Service unavailable'}</span><ThemeToggle/></div>
    </header>

    <main id="home" className="patient-main">
      <section className="welcome-card">
        <div className="welcome-copy"><p className="eyebrow">YOUR CARE, WITH CLARITY</p><h1>Your pharmacy care,<br/><span>all in one place.</span></h1><p>When secure patient sign-in is available, you’ll be able to review pharmacy records and care activity here.</p><div className="access-notice"><LockKeyhole size={17}/><span>Patient record access is not enabled on this deployment yet.</span></div></div>
        <div className="welcome-art" aria-hidden="true"><div className="art-orbit orbit-a"/><div className="art-orbit orbit-b"/><div className="art-center"><FileHeart size={44}/></div><span className="art-dot dot-a"/><span className="art-dot dot-b"/></div>
      </section>

      <section className="content-heading"><div><p className="eyebrow">PATIENT SERVICES</p><h2>What you’ll find here</h2></div><span className="not-live">Not connected</span></section>
      <div className="service-grid">
        <article className="service-card"><span className="service-icon blue"><FileHeart size={20}/></span><h3>My pharmacy records</h3><p>Review pharmacy information linked to your account after secure sign-in is provided.</p><span className="card-status">Unavailable</span></article>
        <article className="service-card"><span className="service-icon mint"><CalendarDays size={20}/></span><h3>Medication activity</h3><p>View verified dispensing activity from connected pharmacy services.</p><span className="card-status">Unavailable</span></article>
        <article className="service-card"><span className="service-icon violet"><ShieldCheck size={20}/></span><h3>Access and privacy</h3><p>Manage permissions only when patient identity and consent services are connected.</p><span className="card-status">Unavailable</span></article>
      </div>

      <section className="connection-card"><div className="connection-icon"><Stethoscope size={20}/></div><div><h2>{reachable ? 'Pharmacy service is reachable' : service === 'checking' ? 'Checking pharmacy service' : 'Pharmacy service is unavailable'}</h2><p>{reachable ? 'The service responds, but this does not enable patient sign-in or record access.' : 'Patient records remain hidden until the pharmacy service and secure patient access are available.'}</p></div><ArrowUpRight size={18} className="connection-arrow"/></section>
      <footer>Privacy first · Patient information will only appear after authenticated access is implemented.</footer>
    </main>
  </div>
}
