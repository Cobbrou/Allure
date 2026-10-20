import { t } from '../lib/i18n.js';
import { useEffect, useState } from 'react';

/**
 * Destructive action needing a second tap within 4 s (no blocking browser dialog).
 * label: accessible name when `children` is only an icon (the armed text speaks for itself).
 */
export default function ConfirmButton({ onConfirm, children, confirmLabel = t('Confirmer ?'), className = 'danger', label }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button type="button" className={`${className} ${armed ? 'armed' : ''}`} aria-label={armed ? undefined : label} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirmLabel : children}
    </button>
  );
}
