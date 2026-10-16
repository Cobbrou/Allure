const TABS = [
  { id: '', label: 'Activités', icon: <path d="M4 6h16M4 12h16M4 18h10" /> },
  { id: 'record', label: 'Enregistrer', icon: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" /></> },
  { id: 'profile', label: 'Profil', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></> },
];

export default function TabBar({ active }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <a key={t.id} href={`#/${t.id}`} className={active === t.id ? 'active' : ''} aria-current={active === t.id ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{t.icon}</svg>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
