import type { StickerHandle, StickerHitResult, StickerLayer } from '../../types/stickers';
import { TAU } from '../utils/math';

export interface DrawOptions {
  /** Draw the selection box and handles. Off for captures. */
  showChrome?: boolean;
  selectedId?: string | null;
  /** Frame px per CSS px, so handles stay a constant on-screen size. */
  uiScale?: number;
  now?: number;
  accent?: string;
}

const BOUNCE_MS = 460;
const HANDLE_RADIUS_CSS = 15;

/**
 * Draws sticker layers into any 2D context, in normalised frame space.
 *
 * The renderer is intentionally stateless: preview and export call the exact same
 * function with different target sizes, which is the guarantee that the strip you
 * download matches the one you were looking at.
 */
export class StickerRenderer {
  draw(
    ctx: CanvasRenderingContext2D,
    layers: StickerLayer[],
    width: number,
    height: number,
    options: DrawOptions = {},
  ): void {
    if (layers.length === 0) return;
    const now = options.now ?? performance.now();
    const ordered = layers.slice().sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of ordered) {
      if (!layer.image) continue;
      const box = geometry(layer, width, height, now);

      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.translate(box.cx, box.cy);
      ctx.rotate(layer.rotation);
      try {
        ctx.drawImage(layer.image, -box.w / 2, -box.h / 2, box.w, box.h);
      } catch {
        // A half-decoded image can throw once; it will be fine next frame.
      }
      ctx.restore();
    }

    if (options.showChrome && options.selectedId) {
      const selected = ordered.find((l) => l.id === options.selectedId);
      if (selected) {
        this.drawChrome(ctx, selected, width, height, now, options.uiScale ?? 1, options.accent ?? '#FF3B6B');
      }
    }
  }

  private drawChrome(
    ctx: CanvasRenderingContext2D,
    layer: StickerLayer,
    width: number,
    height: number,
    now: number,
    uiScale: number,
    accent: string,
  ): void {
    const box = geometry(layer, width, height, now);
    const r = HANDLE_RADIUS_CSS * uiScale;

    ctx.save();
    ctx.translate(box.cx, box.cy);
    ctx.rotate(layer.rotation);

    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, 2 * uiScale);
    ctx.setLineDash([8 * uiScale, 6 * uiScale]);
    ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
    ctx.setLineDash([]);

    const handles: [number, number, string][] = [
      [box.w / 2, box.h / 2, 'scale'],
      [box.w / 2, -box.h / 2, 'rotate'],
      [-box.w / 2, -box.h / 2, 'delete'],
    ];

    for (const [hx, hy, kind] of handles) {
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, TAU);
      ctx.fillStyle = kind === 'delete' ? '#FFFFFF' : accent;
      ctx.fill();
      ctx.lineWidth = Math.max(1, 2 * uiScale);
      ctx.strokeStyle = kind === 'delete' ? accent : '#FFFFFF';
      ctx.stroke();

      ctx.save();
      ctx.translate(hx, hy);
      ctx.strokeStyle = kind === 'delete' ? accent : '#FFFFFF';
      ctx.lineWidth = Math.max(1.5, 2.2 * uiScale);
      ctx.lineCap = 'round';
      const g = r * 0.42;
      ctx.beginPath();
      if (kind === 'delete') {
        ctx.moveTo(-g, -g);
        ctx.lineTo(g, g);
        ctx.moveTo(g, -g);
        ctx.lineTo(-g, g);
      } else if (kind === 'scale') {
        ctx.moveTo(-g, g);
        ctx.lineTo(g, g);
        ctx.lineTo(g, -g);
      } else {
        ctx.arc(0, 0, g, 0.4, TAU - 0.9);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Topmost sticker under a point, in normalised frame coordinates. Handles win
   * over bodies so a small sticker's controls stay reachable.
   */
  hitTest(
    layers: StickerLayer[],
    nx: number,
    ny: number,
    width: number,
    height: number,
    selectedId: string | null,
    uiScale = 1,
  ): StickerHitResult | null {
    const now = performance.now();
    const px = nx * width;
    const py = ny * height;
    const ordered = layers.slice().sort((a, b) => b.zIndex - a.zIndex);

    // Handles belong to the selected layer only, and are checked first.
    const selected = ordered.find((l) => l.id === selectedId);
    if (selected && !selected.locked) {
      const box = geometry(selected, width, height, now);
      const local = toLocal(px, py, box.cx, box.cy, selected.rotation);
      const r = HANDLE_RADIUS_CSS * uiScale * 1.35;
      const corners: [number, number, StickerHandle][] = [
        [box.w / 2, box.h / 2, 'scale'],
        [box.w / 2, -box.h / 2, 'rotate'],
        [-box.w / 2, -box.h / 2, 'delete'],
      ];
      for (const [hx, hy, handle] of corners) {
        if (Math.hypot(local.x - hx, local.y - hy) <= r) {
          return { layer: selected, localX: local.x / box.w, localY: local.y / box.h, handle };
        }
      }
    }

    for (const layer of ordered) {
      if (layer.locked) continue;
      const box = geometry(layer, width, height, now);
      const local = toLocal(px, py, box.cx, box.cy, layer.rotation);
      if (Math.abs(local.x) <= box.w / 2 && Math.abs(local.y) <= box.h / 2) {
        return { layer, localX: local.x / box.w, localY: local.y / box.h, handle: 'body' };
      }
    }
    return null;
  }
}

export interface StickerBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Pixel geometry of a layer, including the add-bounce. */
export function geometry(
  layer: StickerLayer,
  width: number,
  height: number,
  now: number,
): StickerBox {
  const age = now - layer.bornAt;
  let bounce = 1;
  if (age < BOUNCE_MS) {
    const t = age / BOUNCE_MS;
    // Damped overshoot — lands at exactly 1 so there is no snap at the end.
    bounce = 1 + Math.sin(t * Math.PI * 1.6) * 0.22 * (1 - t);
  }
  const w = layer.scale * width * bounce;
  return { cx: layer.x * width, cy: layer.y * height, w, h: w / layer.aspect };
}

function toLocal(px: number, py: number, cx: number, cy: number, rotation: number) {
  const dx = px - cx;
  const dy = py - cy;
  const c = Math.cos(-rotation);
  const s = Math.sin(-rotation);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

export const stickerRenderer = new StickerRenderer();

/** Normalise z-order to 0..n-1 so numbers never drift apart. */
export function reindex(layers: StickerLayer[]): StickerLayer[] {
  return layers
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((l, i) => (l.zIndex === i ? l : { ...l, zIndex: i }));
}

export function bringForward(layers: StickerLayer[], id: string): StickerLayer[] {
  const sorted = reindex(layers);
  const i = sorted.findIndex((l) => l.id === id);
  if (i === -1 || i === sorted.length - 1) return layers;
  const swapped = sorted.slice();
  [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
  return reindex(swapped.map((l, idx) => ({ ...l, zIndex: idx })));
}

export function sendBackward(layers: StickerLayer[], id: string): StickerLayer[] {
  const sorted = reindex(layers);
  const i = sorted.findIndex((l) => l.id === id);
  if (i <= 0) return layers;
  const swapped = sorted.slice();
  [swapped[i], swapped[i - 1]] = [swapped[i - 1], swapped[i]];
  return reindex(swapped.map((l, idx) => ({ ...l, zIndex: idx })));
}

export function topZ(layers: StickerLayer[]): number {
  return layers.reduce((max, l) => Math.max(max, l.zIndex), -1) + 1;
}
