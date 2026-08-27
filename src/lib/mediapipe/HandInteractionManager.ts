import type { StickerLayer } from '../../types/stickers';
import type { CoverCrop } from '../filters/FilterEngine';
import type { ParticleSystem } from '../effects/ParticleSystem';
import type { GestureState } from './GestureManager';
import type { HandFrame } from './HandTracker';
import { HAND_LANDMARK, palmCenter, palmSpan } from './HandTracker';
import { toFrameSpace } from './attachments';
import { clamp } from '../utils/math';

export interface HandInteractionCallbacks {
  /** Fired by a thumbs up. Rate-limited here, not by the caller. */
  onNextFilter?: () => void;
  onCelebrate?: () => void;
  onGrab?: () => void;
}

export interface InteractionInput {
  hands: HandFrame;
  gesture: GestureState;
  crop: CoverCrop;
  mirror: boolean;
  dt: number;
  now: number;
  stickers: StickerLayer[];
  selectedId: string | null;
  enabled: boolean;
}

export interface InteractionOutput {
  /** New sticker array, or null when nothing moved. */
  stickers: StickerLayer[] | null;
  /** Point of interest for the Hand Warp filter, in frame space. */
  warpCenter: { x: number; y: number } | null;
  /** Multiplier on the warp radius, driven by how open the hand is. */
  warpRadius: number;
  grabbedId: string | null;
}

const FILTER_COOLDOWN = 1400;
const CELEBRATE_COOLDOWN = 900;
const GRAB_RADIUS = 0.22;

/**
 * The bridge between "the model saw a hand" and "something fun happened".
 *
 * Everything here is optional: with tracking off, `update()` is never called and
 * the booth behaves like a normal camera. Nothing in the capture path depends on
 * a hand being present.
 */
export class HandInteractionManager {
  private particles: ParticleSystem;
  private callbacks: HandInteractionCallbacks;

  private lastFilterSwitch = 0;
  private lastCelebrate = 0;
  private grabbedId: string | null = null;
  private grabSpan = 0;
  private grabScale = 0;
  private wasPinching = false;
  private lastWarp = { x: 0.5, y: 0.5 };
  private warpRadius = 1;

  constructor(particles: ParticleSystem, callbacks: HandInteractionCallbacks = {}) {
    this.particles = particles;
    this.callbacks = callbacks;
  }

  setCallbacks(callbacks: HandInteractionCallbacks): void {
    this.callbacks = callbacks;
  }

  get isGrabbing(): boolean {
    return this.grabbedId !== null;
  }

  update(input: InteractionInput): InteractionOutput {
    const { hands, gesture, crop, mirror, dt, now, enabled } = input;

    if (!enabled || hands.hands.length === 0 || !gesture.hand) {
      this.releaseGrab();
      return { stickers: null, warpCenter: null, warpRadius: 1, grabbedId: null };
    }

    const lm = gesture.hand.landmarks;
    const span = palmSpan(lm);
    const palm = toFrameSpace(palmCenter(lm), crop, mirror);
    const indexTip = toFrameSpace(lm[HAND_LANDMARK.INDEX_TIP], crop, mirror);
    const thumbTip = toFrameSpace(lm[HAND_LANDMARK.THUMB_TIP], crop, mirror);

    // Hand Warp follows the palm, with the radius opening up as the hand opens.
    this.lastWarp = palm;
    this.warpRadius = clamp(0.55 + gesture.pinchAmount * 0.8, 0.4, 1.8);

    let stickers: StickerLayer[] | null = null;

    switch (gesture.gesture) {
      case 'OPEN_PALM':
        // A steady trickle rather than a burst, so a held palm keeps sparkling.
        this.particles.emit('sparkle', palm.x, palm.y, 34, dt, {
          speed: 0.28,
          size: 0.035,
          life: 0.95,
          gravity: -0.12,
        });
        break;

      case 'THUMBS_UP':
        if (now - this.lastFilterSwitch > FILTER_COOLDOWN) {
          this.lastFilterSwitch = now;
          this.particles.burst('star', thumbTip.x, thumbTip.y, {
            count: 14,
            speed: 0.5,
            size: 0.038,
            colors: ['#FFD166', '#FFFFFF', '#C8FF4D'],
          });
          this.callbacks.onNextFilter?.();
        }
        break;

      case 'PEACE':
        if (now - this.lastCelebrate > CELEBRATE_COOLDOWN) {
          this.lastCelebrate = now;
          this.particles.burst('heart', indexTip.x, indexTip.y, {
            count: 18,
            speed: 0.55,
            size: 0.05,
            life: 1.4,
            gravity: -0.18,
            colors: ['#FF3B6B', '#FF9AD5', '#FFFFFF'],
          });
          this.particles.burst('ring', indexTip.x, indexTip.y, {
            count: 2,
            speed: 0.04,
            size: 0.08,
            life: 0.7,
            gravity: 0,
          });
          this.callbacks.onCelebrate?.();
        }
        break;

      case 'WAVE':
        if (now - this.lastCelebrate > CELEBRATE_COOLDOWN) {
          this.lastCelebrate = now;
          this.particles.burst('confetti', palm.x, palm.y, {
            count: 34,
            speed: 0.9,
            size: 0.036,
            life: 1.6,
            gravity: 0.75,
          });
          this.callbacks.onCelebrate?.();
        }
        break;

      case 'PINCH': {
        const pinch = {
          x: (indexTip.x + thumbTip.x) / 2,
          y: (indexTip.y + thumbTip.y) / 2,
        };
        stickers = this.handlePinch(input, pinch, span);
        break;
      }

      case 'POINT':
        stickers = this.handlePoint(input, indexTip);
        break;

      default:
        this.releaseGrab();
        break;
    }

    if (gesture.gesture !== 'PINCH') this.releaseGrab();

    return {
      stickers,
      warpCenter: this.lastWarp,
      warpRadius: this.warpRadius,
      grabbedId: this.grabbedId,
    };
  }

  private handlePinch(
    input: InteractionInput,
    pinch: { x: number; y: number },
    span: number,
  ): StickerLayer[] | null {
    const { stickers, selectedId } = input;
    if (stickers.length === 0) return null;

    if (!this.wasPinching) {
      this.wasPinching = true;
      // Grab whatever is nearest the pinch, preferring the current selection so a
      // deliberate choice is not stolen by a sticker that happens to be closer.
      const target =
        nearest(stickers, pinch.x, pinch.y, selectedId) ?? null;
      if (target) {
        this.grabbedId = target.id;
        this.grabSpan = span;
        this.grabScale = target.scale;
        this.callbacks.onGrab?.();
      }
    }

    if (!this.grabbedId) return null;

    const ratio = this.grabSpan > 0 ? span / this.grabSpan : 1;
    const nextScale = clamp(this.grabScale * ratio, 0.05, 1.4);

    let changed = false;
    const next = stickers.map((layer) => {
      if (layer.id !== this.grabbedId) return layer;
      changed = true;
      return {
        ...layer,
        // A grabbed sticker stops following a face — the hand is in charge now.
        attachment: 'none' as const,
        attachmentPoint: undefined,
        x: clamp(pinch.x, 0, 1),
        y: clamp(pinch.y, 0, 1),
        scale: nextScale,
      };
    });
    return changed ? next : null;
  }

  private handlePoint(
    input: InteractionInput,
    tip: { x: number; y: number },
  ): StickerLayer[] | null {
    const { stickers, selectedId, dt } = input;
    if (stickers.length === 0) return null;

    const targetId = selectedId ?? topmost(stickers)?.id;
    if (!targetId) return null;

    // Follow with a spring rather than snapping, so jitter in the landmark does
    // not turn into a vibrating sticker.
    const follow = Math.min(1, dt * 12);
    let changed = false;
    const next = stickers.map((layer) => {
      if (layer.id !== targetId) return layer;
      const nx = layer.x + (tip.x - layer.x) * follow;
      const ny = layer.y + (tip.y - layer.y) * follow;
      if (Math.abs(nx - layer.x) < 0.0004 && Math.abs(ny - layer.y) < 0.0004) return layer;
      changed = true;
      return {
        ...layer,
        attachment: 'none' as const,
        attachmentPoint: undefined,
        x: clamp(nx, 0, 1),
        y: clamp(ny, 0, 1),
      };
    });
    return changed ? next : null;
  }

  private releaseGrab(): void {
    this.wasPinching = false;
    this.grabbedId = null;
  }

  reset(): void {
    this.releaseGrab();
    this.lastFilterSwitch = 0;
    this.lastCelebrate = 0;
  }
}

function nearest(
  layers: StickerLayer[],
  x: number,
  y: number,
  preferId: string | null,
): StickerLayer | undefined {
  let best: StickerLayer | undefined;
  let bestDistance = GRAB_RADIUS;
  for (const layer of layers) {
    if (layer.locked) continue;
    const d = Math.hypot(layer.x - x, layer.y - y);
    // Small bias toward the selected sticker.
    const weighted = layer.id === preferId ? d * 0.7 : d;
    if (weighted < bestDistance) {
      bestDistance = weighted;
      best = layer;
    }
  }
  return best;
}

function topmost(layers: StickerLayer[]): StickerLayer | undefined {
  return layers.reduce<StickerLayer | undefined>(
    (top, l) => (!top || l.zIndex > top.zIndex ? l : top),
    undefined,
  );
}
