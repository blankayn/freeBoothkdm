import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', full, icon, children, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`btn btn--${variant} btn--${size} ${full ? 'btn--full' : ''} ${className}`}
      {...rest}
    >
      {icon ? <span className="btn__icon">{icon}</span> : null}
      {children ? <span className="btn__label">{children}</span> : null}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: 'light' | 'dark';
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tone = 'dark', active, children, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      className={`icon-btn icon-btn--${tone} ${active ? 'is-active' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  /** Shown at the right of the label row. */
  display?: string;
  tone?: 'light' | 'dark';
  id?: string;
}

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  display,
  tone = 'dark',
  id,
}: SliderProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className={`slider slider--${tone}`}>
      <div className="slider__head">
        <label htmlFor={inputId}>{label}</label>
        {display ? <span className="slider__value">{display}</span> : null}
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${percent}%` }}
      />
    </div>
  );
}

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  tone?: 'light' | 'dark';
}

export function Toggle({ label, hint, checked, onChange, disabled, tone = 'dark' }: ToggleProps) {
  const id = useId();
  return (
    <div className={`toggle toggle--${tone} ${disabled ? 'is-disabled' : ''}`}>
      <div className="toggle__text">
        <label htmlFor={id}>{label}</label>
        {hint ? <p>{hint}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className="toggle__switch"
        onClick={() => onChange(!checked)}
      >
        <span className="toggle__thumb" />
      </button>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  tone?: 'light' | 'dark';
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  tone = 'light',
}: SegmentedProps<T>) {
  return (
    <div className={`segmented segmented--${tone}`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? 'is-selected' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  tone?: 'light' | 'dark';
  /** Extra actions rendered in the sheet header. */
  actions?: ReactNode;
}

/**
 * Bottom sheet with a focus trap and Escape-to-close. The overlay is inert to
 * pointer events on its content area so a stray tap does not dismiss mid-drag.
 */
export function Sheet({ open, title, onClose, children, tone = 'dark', actions }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>('[data-autofocus], button, [href], input, select, textarea')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={`sheet-root sheet-root--${tone}`}>
      <div className="sheet-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet__grabber" aria-hidden />
        <header className="sheet__head">
          <h2>{title}</h2>
          <div className="sheet__actions">
            {actions}
            <IconButton label="Close" tone={tone} onClick={onClose}>
              <CloseGlyph />
            </IconButton>
          </div>
        </header>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}

function CloseGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Announces transient messages to screen readers without stealing focus. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}

export function useEventListener<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  enabled = true,
): void {
  const saved = useRef(handler);
  saved.current = handler;

  const listener = useCallback((event: WindowEventMap[K]) => saved.current(event), []);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener(type, listener as EventListener);
    return () => window.removeEventListener(type, listener as EventListener);
  }, [type, listener, enabled]);
}
