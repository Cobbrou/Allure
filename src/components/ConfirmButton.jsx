import { useEffect, useState } from 'react';

/** Destructive action needing a second tap within 4 s (no blocking browser dialog). */
export default function ConfirmButton({ onConfirm, children, confirmLabel = 'Confirmer ?', className = 'danger' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`${className} ${armed ? 'armed' : ''}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirmLabel : children}
    </button>
  );
}
