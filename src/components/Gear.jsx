import { useState } from 'react';
import { GEAR_KINDS, gearUsage, toggleDefault } from '../lib/gear.js';
import ConfirmButton from './ConfirmButton.jsx';
import Segmented from './Segmented.jsx';

const KIND_OPTIONS = Object.entries(GEAR_KINDS).map(([id, k]) => ({ id, label: `${k.icon} ${k.label}` }));
const km = (m) => `${Math.round(m / 1000).toLocaleString('fr-FR')} km`;

/** Shoes and bikes with their mileage; shoes show wear against their replacement distance. */
export default function Gear({ gears, activities, onSave }) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null); // id whose actions are shown
  const active = gears.filter((g) => !g.retired);
  const retired = gears.filter((g) => g.retired);
  const patch = (id, p) => onSave(gears.map((g) => (g.id === id ? { ...g, ...p } : g)));

  const row = (g) => {
    const u = gearUsage(g, activities);
    const ratio = g.alert ? u.distance / g.alert : null;
    return (
      <li key={g.id} className={g.retired ? 'retired' : ''}>
        <button type="button" className="gear-row" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>
          <span className="sport-icon" aria-hidden="true">{GEAR_KINDS[g.kind].icon}</span>
          <span className="gear-name">
            <b>{g.name}</b>
            <span className="muted">
              {u.count} activité{u.count > 1 ? 's' : ''}{g.isDefault && !g.retired && ' · par défaut'}{g.retired && ' · retiré'}
            </span>
          </span>
          <span className="gear-km">
            <b>{km(u.distance)}</b>
            {ratio >= 1 && !g.retired ? <span className="gear-alert">À remplacer</span>
              : ratio != null && !g.retired && <span className="muted small-label">sur {km(g.alert)}</span>}
          </span>
        </button>
        {ratio != null && !g.retired && (
          <div className="gear-wear" title={`${km(u.distance)} / ${km(g.alert)}`}>
            <span className={ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : ''} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
          </div>
        )}
        {open === g.id && (
          <div className="row gear-actions">
            {!g.retired && (
              <button type="button" className="ghost small" onClick={() => onSave(toggleDefault(gears, g.id))}>
                {g.isDefault ? 'Retirer le défaut' : 'Par défaut'}
              </button>
            )}
            <button type="button" className="ghost small" onClick={() => patch(g.id, { retired: !g.retired, isDefault: false })}>
              {g.retired ? 'Réactiver' : 'Retirer'}
            </button>
            <ConfirmButton className="danger small" onConfirm={() => onSave(gears.filter((x) => x.id !== g.id))}>Supprimer</ConfirmButton>
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="card">
      <h3>Matériel</h3>
      {gears.length === 0 && !adding && <p className="muted">Ajoute tes chaussures et tes vélos pour suivre leur kilométrage.</p>}
      <ul className="gear">{active.map(row)}</ul>
      {retired.length > 0 && (
        <details className="gear-retired">
          <summary className="muted">Matériel retiré ({retired.length})</summary>
          <ul className="gear">{retired.map(row)}</ul>
        </details>
      )}
      {adding
        ? <GearForm gears={gears} onCancel={() => setAdding(false)} onAdd={async (g) => {
            const list = [...gears, { ...g, isDefault: false }];
            await onSave(g.isDefault ? toggleDefault(list, g.id) : list);
            setAdding(false);
          }} />
        : <div className="row"><button type="button" className="ghost" onClick={() => setAdding(true)}>+ Ajouter du matériel</button></div>}
    </section>
  );
}

function GearForm({ gears, onAdd, onCancel }) {
  const [kind, setKind] = useState('shoes');
  const [name, setName] = useState('');
  const [initial, setInitial] = useState('');
  const [alert, setAlert] = useState(String(GEAR_KINDS.shoes.alert / 1000));
  const hasDefault = gears.some((g) => g.kind === kind && g.isDefault && !g.retired);
  const [isDefault, setIsDefault] = useState(true);
  const pickKind = (k) => { setKind(k); setAlert(GEAR_KINDS[k].alert ? String(GEAR_KINDS[k].alert / 1000) : ''); };
  const submit = (e) => {
    e.preventDefault();
    const m = (v) => (Number(v) > 0 ? Math.round(Number(v) * 1000) : null);
    onAdd({ id: crypto.randomUUID(), name: name.trim() || GEAR_KINDS[kind].label, kind, initial: m(initial) ?? 0, alert: m(alert), isDefault, retired: false });
  };
  return (
    <form className="edit goal-form" onSubmit={submit}>
      <Segmented label="Type" options={KIND_OPTIONS} value={kind} onChange={pickKind} />
      <label>Nom
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={kind === 'shoes' ? 'Pegasus 41' : 'Vélo de route'} />
      </label>
      <div className="row">
        <label>Déjà parcouru (km)
          <input type="number" inputMode="decimal" min="0" step="any" placeholder="0" value={initial} onChange={(e) => setInitial(e.target.value)} />
        </label>
        <label>Alerte à (km)
          <input type="number" inputMode="decimal" min="0" step="any" placeholder="aucune" value={alert} onChange={(e) => setAlert(e.target.value)} />
        </label>
      </div>
      <label className="switch">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Par défaut pour les nouvelles activités{hasDefault && isDefault && ' (remplace l\'actuel)'}
      </label>
      <div className="edit-actions">
        <button type="button" className="ghost" onClick={onCancel}>Annuler</button>
        <button type="submit">Ajouter</button>
      </div>
    </form>
  );
}
