import { t } from '../lib/i18n.js';
import { useState } from 'react';
import { cleanPhone } from '../lib/safety.js';

/**
 * Emergency contacts: who gets the alert SMS (with the last position) when a check-in
 * goes unanswered while recording.
 */
export default function EmergencyContacts({ contacts, onSave }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    const p = cleanPhone(phone);
    if (!p) return setError(t('Numéro invalide.'));
    setError(null);
    await onSave([...contacts, { id: crypto.randomUUID(), name: name.trim() || p, phone: p }]);
    setName('');
    setPhone('');
  };

  return (
    <form className="card edit" onSubmit={add}>
      <h3>{t("Contacts d'urgence")}</h3>
      <p className="muted">{t("Si tu restes immobile pendant un enregistrement et ne réponds pas, l'app prépare un SMS avec ta position pour ces contacts.")}</p>
      <p className="muted">{t("Limites : l'alerte ne fonctionne que si Allure reste au premier plan, écran allumé. Téléphone verrouillé ou autre app ouverte, elle peut ne jamais se déclencher. Le SMS n'est pas envoyé tout seul : il faut appuyer sur Envoyer. Ce n'est pas un service d'urgence.")}</p>
      {contacts.length > 0 && (
        <ul className="records">
          {contacts.map((c) => (
            <li key={c.id}>
              <span className="rec-label">🛟 {c.name}</span>
              <span>
                <span className="muted">{c.phone}</span>
                <button type="button" className="ghost small" onClick={() => onSave(contacts.filter((x) => x.id !== c.id))} aria-label={t('Supprimer {name}', { name: c.name })}>✕</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <label>{t('Nom')}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" /></label>
        <label>{t('Téléphone')}<input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={24} autoComplete="off" /></label>
      </div>
      <button type="submit" disabled={!phone.trim()}>{t('Ajouter le contact')}</button>
      {error && <p className="record-status bad" role="alert">{error}</p>}
    </form>
  );
}
