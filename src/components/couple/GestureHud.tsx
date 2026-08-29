import { useEffect, useRef, useState } from 'react';
import { GESTURE_LABELS, type GestureId } from '../../lib/mediapipe/GestureManager';

/**
 * Hold-to-fire gesture HUD.
 *
 * A gesture alone is too easy to fire mid-pose — you will thumbs-up at the
 * camera without meaning to. So a candidate command must survive a radial
 * fill (~800ms) before it triggers, and the fill itself is the feedback.
 */

export const HOLD_TO_FIRE_MS = 800;

const COUPLE_ACTIONS: Partial<Record<GestureId, string>> = {
  THUMBS_UP: 'Starts the shared countdown',
  WAVE: 'Cancels the countdown',
  OPEN_PALM: 'Switches the strip layout',
};

export interface GestureHudState {
  gesture: GestureId;
  /** 0..1 progress of the hold. */
  progress: number;
  x: number;
  y: number;
}

export function GestureHud({
  state,
  mirrored,
}: {
  state: GestureHudState | null;
  mirrored: boolean;
}) {
  if (!state || state.gesture === 'NONE' || !COUPLE_ACTIONS[state.gesture]) return null;
  const label = GESTURE_LABELS[state.gesture];
  const action = COUPLE_ACTIONS[state.gesture];
  const isFiring = state.progress >= 1;

  return (
    <div
      className={`gesture-hud ${isFiring ? 'gesture-hud--fired' : ''}`}
      style={{
        left: `${(mirrored ? 1 - state.x : state.x) * 100}%`,
        top: `${state.y * 100}%`,
      }}
      aria-live="polite"
    >
      <span className="gesture-hud__ring" aria-hidden>
        <span
          className="gesture-hud__fill"
          style={{ transform: `scale(${Math.max(0.02, state.progress)})` }}
        />
      </span>
      <span className="gesture-hud__text">
        <strong>{label}</strong>
        <em>{action}</em>
      </span>
    </div>
  );
}

/**
 * Watches the engine's gesture stream and turns held gestures into fire
 * events. One instance per booth; returns HUD state for rendering.
 */
export function useGestureHold(
  gesture: GestureId,
  active: boolean,
  onFire: (gesture: GestureId) => void,
): GestureHudState | null {
  const [hud, setHud] = useState<GestureHudState | null>(null);
  const startRef = useRef(0);
  const gestureRef = useRef<GestureId>('NONE');
  const firedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      setHud(null);
      return;
    }
    if (!COUPLE_ACTIONS[gesture]) {
      startRef.current = 0;
      firedRef.current = false;
      setHud(null);
      return;
    }

    if (gesture !== gestureRef.current) {
      gestureRef.current = gesture;
      startRef.current = performance.now();
      firedRef.current = false;
    }

    let raf = 0;
    const tick = () => {
      const held = performance.now() - startRef.current;
      const progress = Math.min(1, held / HOLD_TO_FIRE_MS);
      if (progress >= 1 && !firedRef.current) {
        firedRef.current = true;
        onFire(gesture);
      }
      setHud((prev) =>
        prev?.gesture === gesture && prev.progress === progress
          ? prev
          : { gesture, progress, x: prev?.x ?? 0.5, y: prev?.y ?? 0.4 },
      );
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gesture, active, onFire]);

  return hud;
}
