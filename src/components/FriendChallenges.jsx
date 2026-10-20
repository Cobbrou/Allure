import { t, tn } from '../lib/i18n.js';
import { fmtDay } from '../lib/format.js';
import { useEffect, useState } from 'react';
import ConfirmButton from './ConfirmButton.jsx';
import { getSetting, setSetting } from '../lib/db.js';
import { decode, encode, receive, standings } from '../lib/friendChallenges.js';
import { fmtGoalValue, METRICS } from '../lib/goals.js';
import { appLink, shareText } from '../lib/share.js';
import { SPORTS } from '../lib/sports.js';

const DAY = 86400000;
const fmtValue = (metric, v) => (METRICS[metric].unit ? `${fmtGoalValue(metric, v)} ${METRICS[metric].unit}` : tn(v, '{n} activité', '{n} activités'));
// <input type="date"> value <-> local midnight.
const toInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fromInput = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

/**
 * Challenges with friends, no account: create one, share its link, and every friend who
 * opens it (or pastes its code) adds their result and shares it back. `incoming`: the code
 * of a challenge link the app was opened on.
 */
export default function FriendChallenges({ activities, name, incoming }) {
  const [list, setList] = useState(null);
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [msg, setMsg] = useState('');
  const me = name || t('Moi');
  const save = async (l) => { await setSetting('friendChallenges', l); setList(l); };

  useEffect(() => { getSetting('friendChallenges').then((l) => setList(l ?? []), () => setList([])); }, []);
  const join = async (text) => {
    const ch = decode(text);
    if (!ch) return setMsg(t('Lien ou code de défi invalide.'));
    await save(receive(list, ch, crypto.randomUUID()));
    setMsg(t('Défi « {title} » à jour.', { title: ch.title }));
    setMode(null);
    return true;
  };
  useEffect(() => {
    if (list && incoming) join(incoming).finally(() => location.replace('#/groups'));
  }, [list && incoming]); // eslint-disable-line react-hooks/exhaustive-deps -- once the list is loaded

  const share = async (ch) => {
    const code = encode(ch, activities, me);
    const link = appLink(`/challenge/${code}`);
    const text = link
      ? t('Rejoins mon défi « {title} » sur Allure : {link}', { title: ch.title, link })
      : t('Rejoins mon défi « {title} » sur Allure. Colle ce code dans Groupes > Rejoindre un défi : {code}', { title: ch.title, code });
    try {
      setMsg((await shareText(text)) === 'copied' ? t('Lien copié : envoie-le à tes amis.') : '');
    } catch (e) {
      setMsg(e.message);
    }
  };

  if (!list) return null;
  const now = Date.now();
  return (
    <>
      {list.map((ch) => (
        <section key={ch.id} className="card friend-challenge">
          <b>{ch.title}</b>
          <span className="muted">
            {[METRICS[ch.metric].label, ch.sport ? SPORTS[ch.sport].label : t('Tous sports'), `${fmtDay(ch.from)} → ${fmtDay(ch.to - DAY)}`].join(' · ')}
            {' · '}{now >= ch.to ? t('Terminé') : now < ch.from ? t('Commence bientôt') : tn(Math.ceil((ch.to - now) / DAY), 'Plus que {n} jour', 'Plus que {n} jours')}
          </span>
          <ol>
            {standings(ch, activities, me).map((e) => (
              <li key={e.id} className={e.me ? 'me' : ''}>
                <span>{e.name}</span>
                <span>{fmtValue(ch.metric, e.value)}</span>
              </li>
            ))}
          </ol>
          <div className="edit-actions">
            <button type="button" onClick={() => share(ch)}>{t('Partager')}</button>
            <ConfirmButton className="ghost" onConfirm={() => save(list.filter((c) => c !== ch))} confirmLabel={t('Quitter le défi ?')}>{t('Quitter')}</ConfirmButton>
          </div>
        </section>
      ))}
      {!list.length && !mode && <p className="muted">{t('Défie tes amis sur la distance, le temps ou le dénivelé : partage le lien, chacun ajoute son résultat.')}</p>}
      {msg && <p className="muted" role="status">{msg}</p>}
      {mode === 'create' && <CreateForm onCancel={() => setMode(null)} onCreate={async (ch) => { await save([...list, ch]); setMode(null); share(ch); }} />}
      {mode === 'join' && <JoinForm onCancel={() => setMode(null)} onJoin={join} />}
      {!mode && (
        <div className="row">
          <button type="button" className="ghost" onClick={() => { setMsg(''); setMode('create'); }}>{t('+ Créer un défi')}</button>
          <button type="button" className="ghost" onClick={() => { setMsg(''); setMode('join'); }}>{t('Rejoindre un défi')}</button>
        </div>
      )}
    </>
  );
}

function CreateForm({ onCreate, onCancel }) {
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState('distance');
  const [sport, setSport] = useState('');
  const [from, setFrom] = useState(() => toInput(Date.now()));
  const [to, setTo] = useState(() => toInput(Date.now() + 29 * DAY));
  const submit = (e) => {
    e.preventDefault();
    const start = fromInput(from), end = fromInput(to) + DAY;
    if (!(end > start)) return;
    onCreate({ id: crypto.randomUUID(), title: title.trim() || METRICS[metric].label, metric, sport, from: start, to: end, entries: [], me: crypto.randomUUID() });
  };
  return (
    <form className="card edit goal-form" onSubmit={submit}>
      <label>{t('Nom du défi')}
        <input value={title} maxLength={60} placeholder={t('Défi du mois')} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="row">
        <label>{t('Mesure')}
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            {Object.entries(METRICS).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
          </select>
        </label>
        <label>{t('Sport')}
          <select value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">{t('Tous sports')}</option>
            {Object.entries(SPORTS).map(([id, s]) => <option key={id} value={id}>{s.icon} {s.label}</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        <label>{t('Début')}<input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>{t('Fin')}<input type="date" required min={from} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="edit-actions">
        <button type="button" className="ghost" onClick={onCancel}>{t('Annuler')}</button>
        <button type="submit">{t('Créer et partager')}</button>
      </div>
    </form>
  );
}

function JoinForm({ onJoin, onCancel }) {
  const [text, setText] = useState('');
  return (
    <form className="card edit goal-form" onSubmit={(e) => { e.preventDefault(); onJoin(text); }}>
      <label>{t('Lien ou code reçu')}
        <textarea rows={3} required value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="edit-actions">
        <button type="button" className="ghost" onClick={onCancel}>{t('Annuler')}</button>
        <button type="submit">{t('Rejoindre')}</button>
      </div>
    </form>
  );
}
