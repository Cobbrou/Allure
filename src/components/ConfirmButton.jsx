import { t } from '../lib/i18n.js';
import { useEffect, useState } from 'react';

/** Destructive action needing a second tap within 4 s (no blocking browser dialog). */
export default function ConfirmButton({ onConfirm, children, confirmLabel = t('Confirmer ?'), className = 'danger' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button type="button" className={`${className} ${armed ? 'armed' : ''}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirmLabel : children}
    </button>
  );
}
