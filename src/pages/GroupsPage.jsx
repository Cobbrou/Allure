import { useMemo } from 'react';
import { badges, fmtChallenge, monthChallenges } from '../lib/challenges.js';

const monthName = (y, m) => new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

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
      <header className="topbar"><h1>Groupes</h1></header>
      <main className="detail">
        <h2 className="section-title">Défis de {monthName(d.getFullYear(), d.getMonth())}</h2>
        <p className="muted small-label">Plus que {month.daysLeft} jour{month.daysLeft > 1 ? 's' : ''} · {month.list.filter((c) => c.done).length}/{month.list.length} terminés</p>
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
                <span className="muted small-label">{c.done ? '✓ Terminé' : `${fmtChallenge(c.metric, c.value)} / ${fmtChallenge(c.metric, c.target)}`}</span>
              </div>
            </section>
          ))}
        </div>

        <h2 className="section-title">Trophées</h2>
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
        ) : <p className="muted">Termine un défi pour gagner ton premier trophée.</p>}

        <h2 className="section-title">Clubs</h2>
        <Soon title="Rejoindre un club" text="Retrouve ton club, son fil d'activités et ses classements" />
        <Soon title="Créer un club" text="Rassemble tes partenaires d'entraînement" />
        <h2 className="section-title">Événements</h2>
        <Soon title="Sorties de groupe" text="Organise une sortie ou rejoins celles de tes clubs" />
        <Soon title="Défis entre amis" text="Défie tes amis sur la distance, le dénivelé ou la régularité" />
      </main>
    </>
  );
}

// ponytail: static placeholders until clubs and events ship (roadmap phase 4).
function Soon({ title, text }) {
  return (
    <div className="card link-card">
      <span><b>{title}</b><span className="muted">{text}</span></span>
      <span className="pill">Bientôt</span>
    </div>
  );
}
