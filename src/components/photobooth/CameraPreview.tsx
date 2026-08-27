import type { PointerEventHandler, RefObject } from 'react';
import type { CameraError } from '../../types/camera';
import { Button } from '../ui/Primitives';
import { Countdown } from './Countdown';

interface CameraPreviewProps {
  frameRef: RefObject<HTMLDivElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  countdown: number | null;
  flashing: boolean;
  /** Object URL of the shot just taken, shown as a brief freeze frame. */
  freezeUrl: string | null;
  starting: boolean;
  error: CameraError | null;
  onRetry: () => void;
  onExit: () => void;
  pointerHandlers: {
    onPointerDown: PointerEventHandler;
    onPointerMove: PointerEventHandler;
    onPointerUp: PointerEventHandler;
    onPointerCancel: PointerEventHandler;
  };
  celebrating: boolean;
}

export function CameraPreview({
  frameRef,
  canvasRef,
  countdown,
  flashing,
  freezeUrl,
  starting,
  error,
  onRetry,
  onExit,
  pointerHandlers,
  celebrating,
}: CameraPreviewProps) {
  return (
    <div className="booth__stage">
      <div className="booth__frame" ref={frameRef}>
        <canvas
          ref={canvasRef}
          className="booth__canvas"
          // The canvas carries live video; a static description is the honest
          // thing to expose rather than pretending to describe the scene.
          role="img"
          aria-label="Live camera preview with the selected effect"
          {...pointerHandlers}
        />

        {freezeUrl ? (
          <img src={freezeUrl} alt="" className="booth__freeze" aria-hidden />
        ) : null}

        {flashing ? <div className="booth__flash" aria-hidden /> : null}

        <Countdown value={countdown} />

        {celebrating ? <Celebration /> : null}

        {starting && !error ? (
          <div className="booth__overlay">
            <div className="booth__spinner" aria-hidden />
            <p>Waking up the camera…</p>
          </div>
        ) : null}

        {error ? (
          <div className="booth__overlay booth__overlay--error" role="alert">
            <h2>{titleFor(error.kind)}</h2>
            <p>{error.message}</p>
            {error.kind === 'denied' ? (
              <p className="booth__hint">
                Look for the camera icon in your browser&rsquo;s address bar to change the
                permission, then try again.
              </p>
            ) : null}
            <div className="booth__overlay-actions">
              <Button onClick={onRetry}>Try again</Button>
              <Button variant="ghost" onClick={onExit}>
                Back
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function titleFor(kind: CameraError['kind']): string {
  switch (kind) {
    case 'denied':
      return 'Camera blocked';
    case 'not-found':
      return 'No camera found';
    case 'in-use':
      return 'Camera is busy';
    case 'insecure-context':
      return 'Needs a secure connection';
    case 'unsupported':
      return 'Not supported here';
    default:
      return 'Something went wrong';
  }
}

/** The small moment of celebration after the fourth shot. */
function Celebration() {
  const pieces = Array.from({ length: 14 }, (_, i) => i);
  return (
    <div className="celebrate" aria-hidden>
      {pieces.map((i) => (
        <span
          key={i}
          className="celebrate__piece"
          style={{
            left: `${6 + (i * 89) % 88}%`,
            animationDelay: `${(i % 7) * 60}ms`,
            background: ['#FF3B6B', '#FFD166', '#C8FF4D', '#5AD2FF', '#8B5CF6'][i % 5],
          }}
        />
      ))}
      <p className="celebrate__label">That&rsquo;s four!</p>
    </div>
  );
}
