(() => {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  const cookie = document.cookie.match(/(?:^|; )ehr_appearance=(light|dark)/)?.[1];
  let theme = cookie || 'light';
  try { theme = cookie || localStorage.getItem('ehr_appearance') || 'light'; } catch {}
  const apply = (value) => {
    theme = value;
    document.documentElement.dataset.theme = theme;
    document.cookie = `ehr_appearance=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    try { localStorage.setItem('ehr_appearance', theme); } catch {}
    toggle.textContent = theme === 'dark' ? '☀ Light mode' : '☾ Dark mode';
    toggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  };
  apply(theme);
  toggle.addEventListener('click', () => apply(theme === 'dark' ? 'light' : 'dark'));
})();
