import type { HandData, Landmark } from './HandTracker';
import { HAND_LANDMARK, dist2d, palmSpan } from './HandTracker';

export type GestureId =
  | 'NONE'
  | 'OPEN_PALM'
  | 'THUMBS_UP'
  | 'PEACE'
  | 'PINCH'
  | 'POINT'
  | 'WAVE';

export interface GestureState {
  gesture: GestureId;
  /** How long the current gesture has been held, in ms. */
  heldFor: number;
  /** 0..1 confidence-ish score, mostly used to fade effects in. */
  strength: number;
  /** Pinch aperture as a fraction of palm span; meaningful during PINCH. */
  pinchAmount: number;
  hand: HandData | null;
  handIndex: number;
}

export interface GestureEvent {
  gesture: GestureId;
  handIndex: number;
  at: number;
}

const IDLE: GestureState = {
  gesture: 'NONE',
  heldFor: 0,
  strength: 0,
  pinchAmount: 1,
  hand: null,
  handIndex: -1,
};

/** A gesture must survive this many consecutive classifications to count. */
const STABILITY_FRAMES = 2;

interface WaveSample {
  x: number;
  t: number;
}

/**
 * Turns raw landmarks into a small, stable vocabulary of gestures.
 *
 * Two things make this usable rather than twitchy: every threshold is expressed
 * relative to the hand's own palm span (so it works at any distance from the
 * camera), and a gesture must hold for a couple of classifications before it is
 * reported.
 */
export class GestureManager {
  private state: GestureState = { ...IDLE };
  private candidate: GestureId = 'NONE';
  private candidateCount = 0;
  private since = 0;
  private waveHistory: WaveSample[] = [];
  private waveLatchedUntil = 0;
  private listeners = new Set<(e: GestureEvent) => void>();

  get current(): GestureState {
    return this.state;
  }

  onGesture(listener: (e: GestureEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(hands: HandData[], now: number): GestureState {
    if (hands.length === 0) {
      this.waveHistory.length = 0;
      this.settle('NONE', now, null, -1, 0, 1);
      return this.state;
    }

    // The most confident hand drives gestures; a second hand is still available
    // to interaction code through the raw frame.
    let bestIndex = 0;
    for (let i = 1; i < hands.length; i++) {
      if (hands[i].score > hands[bestIndex].score) bestIndex = i;
    }
    const hand = hands[bestIndex];
    const lm = hand.landmarks;
    if (!lm || lm.length < 21) {
      this.settle('NONE', now, null, -1, 0, 1);
      return this.state;
    }

    const span = palmSpan(lm);
    const fingers = extendedFingers(lm, span);
    const pinchAmount = dist2d(lm[HAND_LANDMARK.THUMB_TIP], lm[HAND_LANDMARK.INDEX_TIP]) / span;

    const waving = this.trackWave(lm[HAND_LANDMARK.WRIST], now, fingers);
    const gesture = classify(lm, fingers, pinchAmount, waving, span);
    const strength =
      gesture === 'PINCH'
        ? Math.min(1, Math.max(0, 1 - pinchAmount / 0.45))
        : gesture === 'NONE'
          ? 0
          : 1;

    this.settle(gesture, now, hand, bestIndex, strength, pinchAmount);
    return this.state;
  }

  private settle(
    gesture: GestureId,
    now: number,
    hand: HandData | null,
    handIndex: number,
    strength: number,
    pinchAmount: number,
  ): void {
    if (gesture === this.candidate) {
      this.candidateCount++;
    } else {
      this.candidate = gesture;
      this.candidateCount = 1;
    }

    const confirmed = this.candidateCount >= STABILITY_FRAMES ? this.candidate : this.state.gesture;

    if (confirmed !== this.state.gesture) {
      this.since = now;
      const event: GestureEvent = { gesture: confirmed, handIndex, at: now };
      for (const listener of this.listeners) listener(event);
    }

    this.state = {
      gesture: confirmed,
      heldFor: now - this.since,
      strength,
      pinchAmount,
      hand,
      handIndex,
    };
  }

  /**
   * A wave is horizontal reversals of the wrist while the hand is open. Tracking
   * a short window of positions is enough and costs nothing.
   */
  private trackWave(wrist: Landmark, now: number, fingers: FingerState): boolean {
    if (now < this.waveLatchedUntil) return true;
    if (fingers.count < 3) {
      this.waveHistory.length = 0;
      return false;
    }

    this.waveHistory.push({ x: wrist.x, t: now });
    while (this.waveHistory.length > 0 && now - this.waveHistory[0].t > 1100) {
      this.waveHistory.shift();
    }
    if (this.waveHistory.length < 6) return false;

    let reversals = 0;
    let travel = 0;
    let lastDirection = 0;
    for (let i = 1; i < this.waveHistory.length; i++) {
      const dx = this.waveHistory[i].x - this.waveHistory[i - 1].x;
      if (Math.abs(dx) < 0.006) continue;
      travel += Math.abs(dx);
      const direction = Math.sign(dx);
      if (lastDirection !== 0 && direction !== lastDirection) reversals++;
      lastDirection = direction;
    }

    if (reversals >= 2 && travel > 0.14) {
      // Latch briefly so the burst fires once rather than every frame of the wave.
      this.waveLatchedUntil = now + 700;
      this.waveHistory.length = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.state = { ...IDLE };
    this.candidate = 'NONE';
    this.candidateCount = 0;
    this.waveHistory.length = 0;
    this.waveLatchedUntil = 0;
  }
}

export interface FingerState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  count: number;
}

/**
 * Extension measured as "is the tip further from the wrist than the middle joint".
 * That works whatever way the hand is rotated, unlike comparing raw y values.
 */
export function extendedFingers(lm: Landmark[], span: number): FingerState {
  const wrist = lm[HAND_LANDMARK.WRIST];
  const isExtended = (tip: number, pip: number) =>
    dist2d(lm[tip], wrist) > dist2d(lm[pip], wrist) * 1.08;

  const index = isExtended(HAND_LANDMARK.INDEX_TIP, HAND_LANDMARK.INDEX_PIP);
  const middle = isExtended(HAND_LANDMARK.MIDDLE_TIP, HAND_LANDMARK.MIDDLE_PIP);
  const ring = isExtended(HAND_LANDMARK.RING_TIP, HAND_LANDMARK.RING_PIP);
  const pinky = isExtended(HAND_LANDMARK.PINKY_TIP, HAND_LANDMARK.PINKY_PIP);

  // The thumb folds sideways, so distance from the index knuckle is the tell.
  const thumb =
    dist2d(lm[HAND_LANDMARK.THUMB_TIP], lm[HAND_LANDMARK.INDEX_MCP]) > span * 0.62;

  const count = [thumb, index, middle, ring, pinky].filter(Boolean).length;
  return { thumb, index, middle, ring, pinky, count };
}

function classify(
  lm: Landmark[],
  fingers: FingerState,
  pinchAmount: number,
  waving: boolean,
  span: number,
): GestureId {
  // Pinch outranks everything — it is the only gesture that manipulates objects,
  // and a half-closed hand would otherwise read as something else.
  if (pinchAmount < 0.34 && !fingers.middle && !fingers.ring) return 'PINCH';

  if (waving) return 'WAVE';

  if (fingers.count === 5) return 'OPEN_PALM';

  if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) return 'PEACE';

  if (fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky && !fingers.thumb) {
    return 'POINT';
  }

  if (fingers.thumb && !fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
    // Only a thumb pointing up the frame counts, so a sideways fist is ignored.
    const thumbTip = lm[HAND_LANDMARK.THUMB_TIP];
    const wrist = lm[HAND_LANDMARK.WRIST];
    if (wrist.y - thumbTip.y > span * 0.55) return 'THUMBS_UP';
  }

  return 'NONE';
}

export const GESTURE_LABELS: Record<GestureId, string> = {
  NONE: 'No gesture',
  OPEN_PALM: 'Open palm',
  THUMBS_UP: 'Thumbs up',
  PEACE: 'Peace',
  PINCH: 'Pinch',
  POINT: 'Point',
  WAVE: 'Wave',
};

export const GESTURE_HINTS: { gesture: GestureId; icon: string; does: string }[] = [
  { gesture: 'OPEN_PALM', icon: '🖐', does: 'Sparkles from your palm' },
  { gesture: 'THUMBS_UP', icon: '👍', does: 'Next filter' },
  { gesture: 'PEACE', icon: '✌️', does: 'Hearts everywhere' },
  { gesture: 'PINCH', icon: '🤏', does: 'Grab and resize a sticker' },
  { gesture: 'POINT', icon: '☝️', does: 'Steer a sticker' },
  { gesture: 'WAVE', icon: '👋', does: 'Confetti burst' },
];
