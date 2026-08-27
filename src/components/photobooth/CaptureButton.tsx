interface CaptureButtonProps {
  onCapture: () => void;
  onCancel: () => void;
  busy: boolean;
  counting: boolean;
  disabled: boolean;
  shotNumber: number;
  totalShots: number;
}

export function CaptureButton({
  onCapture,
  onCancel,
  busy,
  counting,
  disabled,
  shotNumber,
  totalShots,
}: CaptureButtonProps) {
  const label = counting
    ? 'Cancel the countdown'
    : `Take shot ${shotNumber} of ${totalShots}`;

  return (
    <button
      type="button"
      className={`capture ${counting ? 'is-counting' : ''} ${busy ? 'is-busy' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={counting ? onCancel : onCapture}
    >
      <span className="capture__ring" aria-hidden />
      <span className="capture__core" aria-hidden>
        {counting ? <span className="capture__stop" /> : null}
      </span>
    </button>
  );
}
