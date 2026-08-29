import type { CSSProperties, PointerEventHandler, ReactNode, RefObject } from 'react';
import { FRAME_ASPECT } from '../../types/photobooth';
import type { CameraError } from '../../types/camera';
import type { PartnerStatus } from '../../types/booth';
import { Button } from '../ui/Primitives';
import { Countdown } from './Countdown';
import { GestureHud } from '../couple/GestureHud';
import type { GestureHudState } from '../couple/GestureHud';

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
  /** Aspect of the strip cell these shots land in, for the crop guide. */
  cellAspect: number;
  /** The live strip, rendered beside the frame on roomy viewports. */
  rail?: ReactNode;
  /** Couple mode: hold-to-fire gesture HUD state. */
  gestureHud?: GestureHudState | null;
  /** Couple mode: room code + partner connection badge. */
  partnerBadge?: { room: string; status: PartnerStatus };
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
  cellAspect,
  rail,
  gestureHud,
  partnerBadge,
}: CameraPreviewProps) {
  const guide = cropGuide(cellAspect);
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

        {partnerBadge ? (
          <div className="partner-badge" aria-live="polite">
            <span className="partner-badge__room">{partnerBadge.room}</span>
            <span className={`partner-badge__status partner-badge__status--${partnerBadge.status}`}>
              {partnerBadge.status === 'live'
                ? 'Partner live'
                : partnerBadge.status === 'connecting'
                  ? 'Connecting…'
                  : partnerBadge.status === 'gone'
                    ? 'Partner gone'
                    : 'Waiting…'}
            </span>
          </div>
        ) : null}

        {gestureHud ? <GestureHud state={gestureHud} mirrored /> : null}

        {guide && !error && !starting ? (
          <div
            className={`booth__guide booth__guide--${guide.axis}`}
            style={{ '--guide-band': `${Math.round(guide.band * 1000) / 10}%` } as CSSProperties}
            aria-hidden
          >
            <span className="booth__guide-band" />
            <span className="booth__guide-band" />
          </div>
        ) : null}

        {freezeUrl ? <img src={freezeUrl} alt="" className="booth__freeze" aria-hidden /> : null}

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

      {rail ? <div className="booth__rail">{rail}</div> : null}
    </div>
  );
}

/**
 * Where the strip cell will trim this 4:5 frame.
 *
 * Square cells keep the middle 80% of the height, so shooting without a guide
 * means composing against edges that will not survive the export. Returns null
 * when the cell matches the frame and nothing is lost.
 */
function cropGuide(cellAspect: number): { axis: 'y' | 'x'; band: number } | null {
  if (!isFinite(cellAspect) || cellAspect <= 0) return null;
  if (Math.abs(cellAspect - FRAME_ASPECT) < 0.001) return null;
  if (cellAspect > FRAME_ASPECT) {
    return { axis: 'y', band: (1 - FRAME_ASPECT / cellAspect) / 2 };
  }
  return { axis: 'x', band: (1 - cellAspect / FRAME_ASPECT) / 2 };
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
            left: `${6 + ((i * 89) % 88)}%`,
            animationDelay: `${(i % 7) * 60}ms`,
            background: ['#FF3B6B', '#FFD166', '#C8FF4D', '#5AD2FF', '#8B5CF6'][i % 5],
          }}
        />
      ))}
      <p className="celebrate__label">That&rsquo;s four!</p>
    </div>
  );
}
