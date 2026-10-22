import { t } from '../lib/i18n.js';

const TABS = [
  { id: '', get label() { return t('Entraînement'); }, icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinejoin="round" /> },
  { id: 'maps', get label() { return t('Cartes'); }, icon: <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /> },
  { id: 'record', get label() { return t('Enregistrer|onglet'); }, icon: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" /></> },
  { id: 'groups', get label() { return t('Défis'); }, icon: <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6" strokeLinejoin="round" /> },
  { id: 'profile', get label() { return t('Profil'); }, icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></> },
];

/** recording: 'live' | 'paused' | null, shown as a dot on the Record tab (a recording recovered after a crash is paused). */
export default function TabBar({ active, recording }) {
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <a key={tab.id} href={`#/${tab.id}`} className={active === tab.id ? 'active' : ''} aria-current={active === tab.id ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{tab.icon}</svg>
          {tab.label}
          {tab.id === 'record' && recording && (
            <span className={`tab-badge ${recording}`} role="img" aria-label={t(recording === 'live' ? 'Enregistrement en cours' : 'Enregistrement en pause')} />
          )}
        </a>
      ))}
    </nav>
  );
}
