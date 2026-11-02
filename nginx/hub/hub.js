const probes = {
  hospital: ['/api/hospital/peer0/health'],
  patient: ['/api/hospital/patient/health'],
  dashboard: ['/dashboard/'],
  ipfs: ['/api/hospital/ipfs/health'],
  lab: ['/lab/health', '/lab/api/health'],
  pharmacy: ['/pharmacy/'],
};

function savedTheme() {
  const cookie = document.cookie.match(/(?:^|; )ehr_appearance=(light|dark)/)?.[1];
  try { return cookie || localStorage.getItem('ehr_appearance') || 'light'; } catch { return cookie || 'light'; }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `ehr_appearance=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try { localStorage.setItem('ehr_appearance', theme); } catch {}
  const toggle = document.getElementById('theme-toggle');
  const next = theme === 'dark' ? 'light' : 'dark';
  toggle.setAttribute('aria-label', `Switch to ${next} mode`);
  toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  toggle.innerHTML = `<span aria-hidden="true">${theme === 'dark' ? '☀' : '☾'}</span><span>${theme === 'dark' ? 'Light' : 'Dark'}</span>`;
}

function setStatus(key, state, text) {
  const node = document.querySelector(`[data-check="${key}"]`);
  if (!node) return;
  node.classList.remove('checking', 'offline', 'neutral');
  if (state !== 'online') node.classList.add(state === 'checking' ? 'checking' : 'offline');
  node.querySelector('span').textContent = text;
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2600);
  try {
    const response = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
    if (!response.ok) return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshStatuses() {
  const button = document.getElementById('refresh');
  button.disabled = true;
  for (const key of Object.keys(probes)) setStatus(key, 'checking', 'Checking');
  const entries = await Promise.all(Object.entries(probes).map(async ([key, urls]) => {
    let online = false;
    for (const url of urls) {
      if (await probe(url)) { online = true; break; }
    }
    setStatus(key, online ? 'online' : 'offline', online ? 'Responding' : 'Unavailable');
    return online;
  }));
  const count = entries.filter(Boolean).length;
  const state = document.getElementById('system-state');
  const dot = document.getElementById('system-dot');
  state.textContent = count === entries.length ? 'All checked services responding' : `${count} of ${entries.length} services responding`;
  dot.classList.toggle('checking', false);
  dot.classList.toggle('offline', count === 0);
  document.getElementById('system-updated').textContent = `Checked at ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())}`;
  button.disabled = false;
}

applyTheme(savedTheme());
document.getElementById('theme-toggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
document.getElementById('refresh').addEventListener('click', refreshStatuses);
refreshStatuses();
