import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CapturedPhoto, StripStyle } from '../../types/photobooth';
import { measureStrip, renderStrip } from '../../lib/export/StripRenderer';
import { useDecodedPhotos } from '../editor/useDecodedPhotos';

interface BoothStripProps {
  photos: (CapturedPhoto | null)[];
  style: StripStyle;
  /** The slot the next shot fills — ringed so you can see where you are. */
  activeIndex: number;
  onSelect?: (index: number) => void;
}

/**
 * The strip, live, next to the camera — filling in shot by shot.
 *
 * It draws with the same `renderStrip` the exporter uses, so this is not a
 * mock-up of the strip; it is the strip, at rail width. Empty slots come free:
 * the renderer already draws numbered placeholders for null photos.
 */
export function BoothStrip({ photos, style, activeIndex, onSelect }: BoothStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const { images } = useDecodedPhotos(photos);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const cssWidth = wrap.clientWidth;
    if (cssWidth < 8) return;
    const m = measureStrip(style, cssWidth);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    const pixelWidth = Math.round(m.width * dpr);
    const pixelHeight = Math.round(m.height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    canvas.style.width = `${m.width}px`;
    canvas.style.height = `${m.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    renderStrip(ctx, { photos: images, style, texts: [], stickers: [], date: new Date() }, m.width);

    // Ring the slot the next shot lands in. Drawn on top of the finished strip
    // rather than baked into it, so nothing here can leak into an export.
    if (activeIndex >= 0 && activeIndex < m.cols * m.rows) {
      const col = activeIndex % m.cols;
      const row = Math.floor(activeIndex / m.cols);
      const x = m.pad + col * (m.cellW + m.pad);
      const y = m.pad + row * (m.cardH + m.pad);
      ctx.save();
      ctx.strokeStyle = style.accent;
      ctx.lineWidth = Math.max(2, m.width * 0.012);
      ctx.setLineDash([m.width * 0.05, m.width * 0.035]);
      ctx.strokeRect(x, y, m.cellW, m.cardH);
      ctx.restore();
    }
  }, [images, style, activeIndex]);

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
    // rAF is suspended while the tab is hidden; repaint on the way back.
    const onVisible = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [schedule]);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (!onSelect) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    const m = measureStrip(style, rect.width);
    const scale = rect.width / m.width;
    const px = (event.clientX - rect.left) / scale;
    const py = (event.clientY - rect.top) / scale;

    for (let i = 0; i < m.cols * m.rows; i++) {
      const col = i % m.cols;
      const row = Math.floor(i / m.cols);
      const x = m.pad + col * (m.cellW + m.pad);
      const y = m.pad + row * (m.cardH + m.pad);
      if (px >= x && px <= x + m.cellW && py >= y && py <= y + m.cardH) {
        if (photos[i]) onSelect(i);
        return;
      }
    }
  };

  const filled = photos.filter(Boolean).length;

  return (
    <div className="booth-strip" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`booth-strip__canvas ${onSelect ? 'is-tappable' : ''}`}
        role="img"
        aria-label={`Your strip, ${filled} of ${photos.length} shots taken`}
        onPointerDown={onPointerDown}
      />
    </div>
  );
}
