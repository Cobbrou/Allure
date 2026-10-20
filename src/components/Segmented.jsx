/**
 * Segmented control (single choice). options: [{ id, label }].
 * A radio group for the keyboard too: one tab stop, arrow keys move the choice.
 */
export default function Segmented({ options, value, onChange, label }) {
  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.id === value);
    const next = (i + step + options.length) % options.length;
    onChange(options[next].id);
    e.currentTarget.children[next]?.focus();
  };
  return (
    <div className="segmented" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          tabIndex={o.id === value || (i === 0 && !options.some((x) => x.id === value)) ? 0 : -1}
          className={o.id === value ? 'on' : ''}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
