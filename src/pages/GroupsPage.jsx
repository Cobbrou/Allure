import { locale, t, tn } from '../lib/i18n.js';
import { useMemo } from 'react';
import { badges, fmtChallenge, monthChallenges } from '../lib/challenges.js';

const monthName = (y, m) => new Date(y, m, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });

/**
 * Groups tab: this month's challenges and the trophy case (local, from your activities),
 * then clubs and events, which need accounts and a backend (roadmap phase 4).
 */
export default function GroupsPage({ activities }) {
  const now = Date.now();
  const month = useMemo(() => monthChallenges(activities ?? [], now), [activities]); // eslint-disable-line react-hooks/exhaustive-deps -- now: once per render of the list
  const won = useMemo(() => badges(activities ?? [], now), [activities]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = new Date(now);

  return (
    <>
      <header className="topbar"><h1>{t('Groupes')}</h1></header>
      <main className="detail">
        <h2 className="section-title">{t('Défis de {month}', { month: monthName(d.getFullYear(), d.getMonth()) })}</h2>
        <p className="muted small-label">{tn(month.daysLeft, 'Plus que {n} jour', 'Plus que {n} jours')} · {t('{done}/{total} terminés', { done: month.list.filter((c) => c.done).length, total: month.list.length })}</p>
        <div className="challenges">
          {month.list.map((c) => (
            <section key={c.id} className={`card challenge ${c.done ? 'done' : ''}`}>
              <span className="badge-icon" aria-hidden="true">{c.icon}</span>
              <div>
                <b>{c.title}</b>
                <span className="muted">{c.text}</span>
                <div className="progress" role="progressbar" aria-label={c.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.ratio * 100)}>
                  <div style={{ width: `${c.ratio * 100}%` }} />
                </div>
                <span className="muted small-label">{c.done ? t('✓ Terminé') : `${fmtChallenge(c.metric, c.value)} / ${fmtChallenge(c.metric, c.target)}`}</span>
              </div>
            </section>
          ))}
        </div>

        <h2 className="section-title">{t('Trophées')}</h2>
        {won.length ? (
          <ul className="trophies">
            {won.map((b) => (
              <li key={`${b.id}-${b.year}-${b.month}`}>
                <span className="badge-icon" aria-hidden="true">{b.icon}</span>
                <b>{b.title}</b>
                <span className="muted">{monthName(b.year, b.month)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{t('Termine un défi pour gagner ton premier trophée.')}</p>}

        <h2 className="section-title">{t('Clubs')}</h2>
        <Soon title={t('Rejoindre un club')} text={t("Retrouve ton club, son fil d'activités et ses classements")} />
        <Soon title={t('Créer un club')} text={t("Rassemble tes partenaires d'entraînement")} />
        <h2 className="section-title">{t('Événements')}</h2>
        <Soon title={t('Sorties de groupe')} text={t('Organise une sortie ou rejoins celles de tes clubs')} />
        <Soon title={t('Défis entre amis')} text={t('Défie tes amis sur la distance, le dénivelé ou la régularité')} />
      </main>
    </>
  );
}

// ponytail: static placeholders until clubs and events ship (roadmap phase 4).
function Soon({ title, text }) {
  return (
    <div className="card link-card">
      <span><b>{title}</b><span className="muted">{text}</span></span>
      <span className="pill">{t('Bientôt')}</span>
    </div>
  );
}
