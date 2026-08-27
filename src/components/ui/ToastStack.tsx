import { useEffect } from 'react';
import { usePhotobooth } from '../../state/photoboothStore';
import { IconClose } from './Icons';

const LIFETIME: Record<string, number> = {
  info: 4200,
  success: 3200,
  warn: 6000,
  error: 7000,
};

export function ToastStack() {
  const toasts = usePhotobooth((s) => s.toasts);
  const dismiss = usePhotobooth((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismiss(toast.id), LIFETIME[toast.tone] ?? 4200),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.tone}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
            <IconClose size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
