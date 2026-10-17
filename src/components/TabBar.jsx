const TABS = [
  { id: '', label: 'Accueil', icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /> },
  { id: 'maps', label: 'Cartes', icon: <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /> },
  { id: 'record', label: 'Enregistrer', icon: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" /></> },
  { id: 'groups', label: 'Groupes', icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2.4.6 4 2.3 4 5.5" /></> },
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
