import { useEffect, useState } from 'react';
import { haptic } from '../lib/haptics.js';
import { t } from '../lib/i18n.js';
import { speak } from '../lib/location.js';
import { alertText, checkIn, smsUrl } from '../lib/safety.js';

/**
 * Safety check-in: after a long stillness, ask whether all is well, with an alarm; with no
 * answer, open the alert SMS (last position) to the emergency contacts. Moving again or
 * answering "Je vais bien" closes it. Mounted by App, so it watches from every tab.
 */
export default function CheckIn({ rec, contacts }) {
  const [okAt, setOkAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const check = checkIn(rec, now, okAt);
  const url = check && smsUrl(contacts, alertText(rec, now));
  useEffect(() => {
    if (!check) return;
    haptic('alarm');
    if (check.stage === 'ask') speak(t("Tout va bien ? Touche l'écran pour confirmer."));
    else {
      speak(t("Alerte. Envoie le message à tes contacts d'urgence."));
      window.location.href = url; // opens the SMS app where allowed without a tap; the button stays as a fallback
    }
  }, [check?.stage]); // eslint-disable-line react-hooks/exhaustive-deps -- fire once per stage
  if (!check) return null;
  const min = Math.floor((now - rec.lastMove) / 60000);
  return (
    <div className="checkin" role="alertdialog" aria-labelledby="checkin-title" aria-describedby="checkin-text">
      <h2 id="checkin-title">{t(check.stage === 'ask' ? 'Tout va bien ?' : 'Alerte prête')}</h2>
      <p id="checkin-text">
        {check.stage === 'ask'
          ? <>{t("Tu ne bouges plus depuis {min} min. Sans réponse, tes contacts d'urgence seront alertés dans", { min })} <b>{check.left} s</b>.</>
          : t('Envoie le SMS avec ta position à {names}.', { names: contacts.map((c) => c.name).join(', ') })}
      </p>
      <button type="button" className="checkin-ok" onClick={() => { haptic('tap'); setOkAt(Date.now()); }}>{t('Je vais bien')}</button>
      <a className={`button ${check.stage === 'ask' ? 'ghost' : 'danger armed'}`} href={url}>{t(check.stage === 'ask' ? 'Alerter maintenant' : "Envoyer l'alerte SMS")}</a>
    </div>
  );
}
