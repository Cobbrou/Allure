import { useEffect, useRef } from 'react';

const CLOSE_AT = 80; // px dragged down on the handle to close

/**
 * Modal sheet sliding up from the bottom (native <dialog>: focus trap, Escape, backdrop).
 * Closes on a backdrop tap or a downward drag of its top bar.
 */
export default function BottomSheet({ open, onClose, title, children }) {
  const ref = useRef();
  const drag = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) {
      d.showModal();
      d.querySelector('.sheet-top').focus(); // not the first input: no keyboard popping up on phones
    }
    else if (!open && d.open) d.close();
  }, [open]);

  const body = () => ref.current.firstChild;
  const touch = {
    onTouchStart: (e) => { drag.current = { y: e.touches[0].clientY, dy: 0 }; body().style.transition = 'none'; },
    onTouchMove: (e) => {
      if (!drag.current) return;
      drag.current.dy = Math.max(0, e.touches[0].clientY - drag.current.y);
      body().style.transform = `translateY(${drag.current.dy}px)`;
    },
    onTouchEnd: () => {
      const close = drag.current?.dy > CLOSE_AT;
      drag.current = null;
      body().style.transition = '';
      body().style.transform = '';
      if (close) onClose();
    },
  };

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="sheet-body">
        <div className="sheet-top" tabIndex={-1} {...touch}>
          <span className="sheet-handle" aria-hidden="true" />
          {title && <h2>{title}</h2>}
        </div>
        {open && children}
      </div>
    </dialog>
  );
}
