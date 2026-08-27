import type { PhotoboothState } from '../types/photobooth';
import { SHOT_COUNT } from '../types/photobooth';

/**
 * The booth is a small, explicit state machine. Every screen reads from `status`
 * and nothing is allowed to jump the queue — you cannot land in EDITING without
 * four photos on the roll, and you cannot start a countdown before the camera is
 * live. Impossible transitions are dropped and reported rather than applied.
 */
export const TRANSITIONS: Record<PhotoboothState, PhotoboothState[]> = {
  IDLE: ['CAMERA_PERMISSION'],
  CAMERA_PERMISSION: ['READY', 'IDLE'],
  READY: ['COUNTDOWN', 'REVIEW', 'IDLE'],
  COUNTDOWN: ['CAPTURED', 'READY', 'IDLE'],
  CAPTURED: ['READY', 'REVIEW', 'IDLE'],
  REVIEW: ['READY', 'EDITING', 'IDLE'],
  EDITING: ['EXPORTING', 'REVIEW', 'READY', 'IDLE'],
  EXPORTING: ['COMPLETE', 'EDITING'],
  COMPLETE: ['EDITING', 'READY', 'IDLE'],
};

export interface TransitionContext {
  photoCount: number;
  /** Number of frames on the roll that are actually filled (no gaps from a retake). */
  filledCount: number;
}

/**
 * Guards that need to look at more than the current state. Returning a string
 * rejects the transition and explains why, which is far easier to debug than a
 * silent no-op.
 */
function guard(
  from: PhotoboothState,
  to: PhotoboothState,
  ctx: TransitionContext,
): string | null {
  if (to === 'REVIEW' && ctx.filledCount < SHOT_COUNT) {
    return `REVIEW needs ${SHOT_COUNT} photos, roll has ${ctx.filledCount}`;
  }
  if (to === 'EDITING' && from !== 'EXPORTING' && ctx.filledCount < SHOT_COUNT) {
    return `EDITING needs ${SHOT_COUNT} photos, roll has ${ctx.filledCount}`;
  }
  if (to === 'EXPORTING' && ctx.filledCount < SHOT_COUNT) {
    return 'nothing to export yet';
  }
  return null;
}

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

export function canTransition(
  from: PhotoboothState,
  to: PhotoboothState,
  ctx: TransitionContext,
): TransitionResult {
  if (from === to) return { allowed: true };
  if (!TRANSITIONS[from].includes(to)) {
    return { allowed: false, reason: `${from} -> ${to} is not a legal move` };
  }
  const blocked = guard(from, to, ctx);
  if (blocked) return { allowed: false, reason: blocked };
  return { allowed: true };
}

/** Screens that keep the camera stream alive. Everything else can release it. */
export const CAMERA_LIVE_STATES: PhotoboothState[] = [
  'CAMERA_PERMISSION',
  'READY',
  'COUNTDOWN',
  'CAPTURED',
  'REVIEW',
];

export function isCameraLive(state: PhotoboothState): boolean {
  return CAMERA_LIVE_STATES.includes(state);
}
