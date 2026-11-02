import { useEffect, useState } from 'react'

function currentTheme() {
  const cookie = document.cookie.match(/(?:^|; )ehr_appearance=(light|dark)/)?.[1]
  try { return cookie || localStorage.getItem('ehr_appearance') || 'light' } catch { return cookie || 'light' }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.cookie = `ehr_appearance=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`
    try { localStorage.setItem('ehr_appearance', theme) } catch {}
  }, [theme])
  const next = theme === 'dark' ? 'light' : 'dark'
  return <button className="theme-toggle" type="button" aria-label={`Switch to ${next} mode`} aria-pressed={theme === 'dark'} onClick={() => setTheme(next)}><span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span><span>{theme === 'dark' ? 'Dark' : 'Light'}</span></button>
}
