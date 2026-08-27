interface CountdownProps {
  /** 3, 2, 1 … then 0 for the SNAP beat. Null hides the overlay. */
  value: number | null;
}

/**
 * The countdown is deliberately typographic rather than a spinner — it reads at
 * arm's length, which is where people actually are when they use a booth.
 */
export function Countdown({ value }: CountdownProps) {
  if (value === null) return null;
  const isSnap = value === 0;
  const label = isSnap ? 'Snap!' : String(value);

  return (
    <div className="countdown" role="timer" aria-live="assertive" aria-atomic="true" aria-label={isSnap ? 'Snap' : `Countdown ${value}`}>
      <span
        key={value}
        className={`countdown__value ${isSnap ? 'countdown__value--snap' : ''}`}
        aria-hidden="true"
      >
        {isSnap ? 'SNAP!' : value}
      </span>
      {!isSnap ? <span key={`ring-${value}`} className="countdown__ring" aria-hidden="true" /> : null}
      <span className="sr-only">{label}</span>
    </div>
  );
}
