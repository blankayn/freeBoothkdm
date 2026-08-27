import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { StripStyle, StripTextItem } from '../../types/photobooth';
import type { StickerLayer } from '../../types/stickers';
import { measureStrip, renderStrip } from '../../lib/export/StripRenderer';
import { geometry, stickerRenderer } from '../../lib/stickers/StickerRenderer';
import { clamp } from '../../lib/utils/math';

export type StripSelection =
  | { kind: 'sticker'; id: string }
  | { kind: 'text'; id: string }
  | null;

interface PhotoStripPreviewProps {
  photos: (HTMLImageElement | null)[];
  style: StripStyle;
  texts: StripTextItem[];
  stickers: StickerLayer[];
  createdAt: number;
  selection: StripSelection;
  onSelect: (selection: StripSelection) => void;
  onStickersChange: (next: StickerLayer[]) => void;
  onTextsChange: (next: StripTextItem[]) => void;
  onManipulate?: () => void;
  interactive?: boolean;
}

interface DragState {
  pointerId: number;
  kind: 'sticker' | 'text';
  id: string;
  handle: 'body' | 'scale' | 'rotate';
  offsetX: number;
  offsetY: number;
  startScale: number;
  startSize: number;
  startRotation: number;
  startDistance: number;
  startAngle: number;
  moved: boolean;
}

/**
 * Live canvas preview of the strip.
 *
 * It calls the same `renderStrip` the exporter uses, at a smaller width. Nothing
 * about the layout is duplicated in CSS, so what is on screen is what lands in
 * the PNG.
 */
export function PhotoStripPreview({
  photos,
  style,
  texts,
  stickers,
  createdAt,
  selection,
  onSelect,
  onStickersChange,
  onTextsChange,
  onManipulate,
  interactive = true,
}: PhotoStripPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);

  // Refs so the pointer handlers always see current data without rebinding.
  const dataRef = useRef({ texts, stickers, style });
  dataRef.current = { texts, stickers, style };

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const cssWidth = wrap.clientWidth;
    if (cssWidth < 8) return;
    const metrics = measureStrip(style, cssWidth);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    const pixelWidth = Math.round(metrics.width * dpr);
    const pixelHeight = Math.round(metrics.height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    canvas.style.width = `${metrics.width}px`;
    canvas.style.height = `${metrics.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    renderStrip(ctx, { photos, style, texts, stickers, date: new Date(createdAt) }, metrics.width);

    if (interactive && selection) {
      drawSelectionOutline(ctx, selection, texts, stickers, metrics.width, metrics.height);
    }
  }, [photos, style, texts, stickers, createdAt, selection, interactive]);

  // Coalesce paints into one per frame — sliders fire far faster than 60 Hz.
  const schedule = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      paint();
    });
  }, [paint]);

  useEffect(() => {
    schedule();
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [schedule]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => schedule());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [schedule]);

  useEffect(() => {
    // Webfonts landing after first paint would otherwise leave stale metrics.
    if (!document.fonts) return;
    document.fonts.ready.then(() => schedule()).catch(() => undefined);
  }, [schedule]);

  useEffect(() => {
    // requestAnimationFrame is suspended while the tab is hidden, so an editor
    // that mounts in a background tab would come back to a blank canvas.
    const onVisible = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [schedule]);

  // --- pointer -------------------------------------------------------------

  const toLocal = (event: ReactPointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    return {
      nx: (event.clientX - rect.left) / rect.width,
      ny: (event.clientY - rect.top) / rect.height,
      width: rect.width,
      height: rect.height,
    };
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (!interactive) return;
    const local = toLocal(event);
    const canvas = canvasRef.current;
    if (!local || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const px = local.nx * local.width;
    const py = local.ny * local.height;

    // Stickers first — they are drawn on top, so they should be grabbed first.
    const stickerHit = stickerRenderer.hitTest(
      dataRef.current.stickers,
      local.nx,
      local.ny,
      local.width,
      local.height,
      selection?.kind === 'sticker' ? selection.id : null,
      1,
    );

    if (stickerHit) {
      event.preventDefault();
      (event.target as Element).setPointerCapture?.(event.pointerId);
      if (stickerHit.handle === 'delete') {
        onStickersChange(dataRef.current.stickers.filter((s) => s.id !== stickerHit.layer.id));
        onSelect(null);
        return;
      }
      onSelect({ kind: 'sticker', id: stickerHit.layer.id });
      const box = geometry(stickerHit.layer, local.width, local.height, performance.now());
      dragRef.current = {
        pointerId: event.pointerId,
        kind: 'sticker',
        id: stickerHit.layer.id,
        handle: stickerHit.handle === 'body' ? 'body' : stickerHit.handle,
        offsetX: stickerHit.layer.x - local.nx,
        offsetY: stickerHit.layer.y - local.ny,
        startScale: stickerHit.layer.scale,
        startSize: 0,
        startRotation: stickerHit.layer.rotation,
        startDistance: Math.max(1, Math.hypot(px - box.cx, py - box.cy)),
        startAngle: Math.atan2(py - box.cy, px - box.cx),
        moved: false,
      };
      return;
    }

    const textHit = hitTestTexts(ctx, dataRef.current.texts, px, py, local.width, local.height);
    if (textHit) {
      event.preventDefault();
      (event.target as Element).setPointerCapture?.(event.pointerId);
      onSelect({ kind: 'text', id: textHit.id });
      dragRef.current = {
        pointerId: event.pointerId,
        kind: 'text',
        id: textHit.id,
        handle: 'body',
        offsetX: textHit.x - local.nx,
        offsetY: textHit.y - local.ny,
        startScale: 0,
        startSize: textHit.size,
        startRotation: textHit.rotation,
        startDistance: 1,
        startAngle: 0,
        moved: false,
      };
      return;
    }

    onSelect(null);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const local = toLocal(event);
    if (!local) return;
    event.preventDefault();

    if (!state.moved) {
      state.moved = true;
      onManipulate?.();
    }

    if (state.kind === 'text') {
      onTextsChange(
        dataRef.current.texts.map((t) =>
          t.id === state.id
            ? {
                ...t,
                x: clamp(local.nx + state.offsetX, 0.02, 0.98),
                y: clamp(local.ny + state.offsetY, 0.01, 0.99),
              }
            : t,
        ),
      );
      return;
    }

    const layer = dataRef.current.stickers.find((s) => s.id === state.id);
    if (!layer) return;
    const px = local.nx * local.width;
    const py = local.ny * local.height;
    const cx = layer.x * local.width;
    const cy = layer.y * local.height;

    let patch: Partial<StickerLayer>;
    if (state.handle === 'scale') {
      const distance = Math.max(1, Math.hypot(px - cx, py - cy));
      patch = { scale: clamp((state.startScale * distance) / state.startDistance, 0.03, 1.5) };
    } else if (state.handle === 'rotate') {
      patch = {
        rotation: state.startRotation + (Math.atan2(py - cy, px - cx) - state.startAngle),
      };
    } else {
      patch = {
        x: clamp(local.nx + state.offsetX, -0.05, 1.05),
        y: clamp(local.ny + state.offsetY, -0.02, 1.02),
      };
    }

    onStickersChange(
      dataRef.current.stickers.map((s) => (s.id === state.id ? { ...s, ...patch } : s)),
    );
  };

  const endDrag = (event: ReactPointerEvent) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  };

  return (
    <div className="strip-preview" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`strip-preview__canvas ${interactive ? 'is-interactive' : ''}`}
        role="img"
        aria-label="Your photo strip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  );
}

/**
 * Marching-ants box around whatever is selected. Module-level and fully
 * parameterised so the paint callback has no hidden dependency on it.
 */
function drawSelectionOutline(
  ctx: CanvasRenderingContext2D,
  selection: StripSelection,
  texts: StripTextItem[],
  stickers: StickerLayer[],
  width: number,
  height: number,
): void {
  const now = performance.now();
  if (selection?.kind === 'sticker') {
    const layer = stickers.find((s) => s.id === selection.id);
    if (!layer) return;
    const box = geometry(layer, width, height, now);
    outline(ctx, box.cx, box.cy, box.w, box.h, layer.rotation);
  } else if (selection?.kind === 'text') {
    const item = texts.find((t) => t.id === selection.id);
    if (!item) return;
    const box = measureTextItem(ctx, item, width, height);
    outline(ctx, box.cx, box.cy, box.w, box.h, item.rotation);
  }
}

function outline(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rotation: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.strokeStyle = '#FF3B6B';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
  ctx.setLineDash([]);
  ctx.restore();
}

interface TextBox {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

export function measureTextItem(
  ctx: CanvasRenderingContext2D,
  item: StripTextItem,
  width: number,
  height: number,
): TextBox {
  const size = item.size * width;
  ctx.save();
  ctx.font = `700 ${size}px ${item.fontFamily}`;
  const lines = item.text.split('\n');
  let widest = 0;
  for (const line of lines) {
    const chars = Array.from(line);
    let w = 0;
    for (const ch of chars) w += ctx.measureText(ch).width + item.letterSpacing * size;
    w -= item.letterSpacing * size;
    widest = Math.max(widest, w);
  }
  ctx.restore();

  const lineHeight = size * 1.15;
  const boxH = lines.length * lineHeight;
  const cx = item.x * width;
  const cy = item.y * height;

  // Text is drawn from an alignment origin; shift the box to match.
  const offset = item.align === 'center' ? 0 : item.align === 'left' ? widest / 2 : -widest / 2;

  return {
    id: item.id,
    cx: cx + offset,
    cy,
    w: Math.max(12, widest),
    h: Math.max(12, boxH),
    x: item.x,
    y: item.y,
    size: item.size,
    rotation: item.rotation,
  };
}

function hitTestTexts(
  ctx: CanvasRenderingContext2D,
  texts: StripTextItem[],
  px: number,
  py: number,
  width: number,
  height: number,
): TextBox | null {
  for (let i = texts.length - 1; i >= 0; i--) {
    const box = measureTextItem(ctx, texts[i], width, height);
    const dx = px - box.cx;
    const dy = py - box.cy;
    const c = Math.cos(-box.rotation);
    const s = Math.sin(-box.rotation);
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    // A little padding so small text is still grabbable on a touchscreen.
    if (Math.abs(lx) <= box.w / 2 + 10 && Math.abs(ly) <= box.h / 2 + 10) return box;
  }
  return null;
}
