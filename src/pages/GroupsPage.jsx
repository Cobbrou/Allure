import { t, tn } from '../lib/i18n.js';
import { fmtMonth } from '../lib/format.js';
import { useMemo } from 'react';
import FriendChallenges from '../components/FriendChallenges.jsx';
import { badges, fmtChallenge, monthChallenges } from '../lib/challenges.js';

const monthName = (y, m) => fmtMonth(new Date(y, m, 1));

/**
 * Groups tab: this month's challenges and the trophy case (local, from your activities),
 * then challenges with friends, shared by link. `incoming`: a challenge code to join.
 */
export default function GroupsPage({ activities, name, incoming }) {
  const now = Date.now();
  const month = useMemo(() => monthChallenges(activities ?? [], now), [activities]); // eslint-disable-line react-hooks/exhaustive-deps -- now: once per render of the list
  const won = useMemo(() => badges(activities ?? [], now), [activities]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = new Date(now);

  return (
    <>
      <header className="topbar"><h1>{t('Défis')}</h1></header>
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

        <h2 className="section-title">{t('Défis entre amis')}</h2>
        <FriendChallenges activities={activities ?? []} name={name} incoming={incoming} />
      </main>
    </>
  );
}
