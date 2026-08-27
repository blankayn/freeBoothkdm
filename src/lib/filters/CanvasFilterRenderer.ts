import type { FilterId, RendererKind } from '../../types/filters';
import type { FrameRenderer } from './FrameRenderer';
import { clamp01, lerp } from '../utils/math';

/**
 * The no-WebGL path. Rather than degrading to "filters do nothing", the radial
 * effects are approximated by drawing the frame as a stack of concentric annuli,
 * each scaled by the same factor the shader would have applied at that radius.
 * With enough rings it reads as a genuine warp; with few it reads as a stylised
 * one. Either way the booth stays usable on hardware with no GPU path.
 */
export class CanvasFilterRenderer implements FrameRenderer {
  readonly kind: RendererKind = 'canvas2d';
  readonly canvas: HTMLCanvasElement;

  private ctx: CanvasRenderingContext2D | null;
  private scratch: HTMLCanvasElement;
  private scratchCtx: CanvasRenderingContext2D | null;
  /** Reused downscale target for the pixel filter — never reallocated per frame. */
  private small: HTMLCanvasElement;
  private smallCtx: CanvasRenderingContext2D | null;

  private filter: FilterId = 'original';
  private intensity = 0;
  private centerX = 0.5;
  private centerY = 0.5;
  private radiusScale = 1;
  private mirror = false;
  private disposed = false;

  /** Ring count is the whole cost knob for the radial effects. */
  private rings = 26;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2;
    this.canvas.height = 2;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.scratch = document.createElement('canvas');
    this.scratchCtx = this.scratch.getContext('2d', { alpha: false });
    this.small = document.createElement('canvas');
    this.small.width = 2;
    this.small.height = 2;
    this.smallCtx = this.small.getContext('2d', { alpha: false });
  }

  get isReady(): boolean {
    return !!this.ctx && !this.disposed;
  }

  resize(width: number, height: number): void {
    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    // Big canvases get fewer rings so the fallback stays interactive.
    this.rings = w * h > 900_000 ? 16 : 26;
  }

  setFilter(id: FilterId): void {
    this.filter = id;
  }
  setIntensity(value: number): void {
    this.intensity = Math.min(1, Math.max(0, value));
  }
  setCenter(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
  }
  setRadiusScale(scale: number): void {
    this.radiusScale = Math.min(3, Math.max(0.2, scale));
  }
  setMirror(mirror: boolean): void {
    this.mirror = mirror;
  }

  render(
    source: CanvasImageSource,
    timeSeconds: number,
    sourceWidth: number,
    sourceHeight: number,
  ): boolean {
    const ctx = this.ctx;
    if (!ctx || this.disposed || sourceWidth <= 0 || sourceHeight <= 0) return false;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // Stage 1: cover-crop (and mirror) the camera frame into a scratch canvas so
    // every effect below works in clean frame space.
    const flat = this.stage(source, sourceWidth, sourceHeight, w, h);
    if (!flat) return false;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;

    switch (this.filter) {
      case 'original':
        ctx.drawImage(flat, 0, 0);
        break;
      case 'mirror':
        this.drawMirror(ctx, flat, w, h);
        break;
      case 'pixel':
        this.drawPixel(ctx, flat, w, h);
        break;
      case 'wave':
        this.drawWave(ctx, flat, w, h, timeSeconds);
        break;
      case 'rgbshift':
        this.drawRgbShift(ctx, flat, w, timeSeconds);
        break;
      case 'spherize':
        this.drawRadial(ctx, flat, w, h, 0.62, (r) => (2 * Math.asin(clamp01(r))) / Math.PI);
        break;
      case 'bulge':
        this.drawRadial(ctx, flat, w, h, 0.5, (r) => Math.pow(r, 1 + this.intensity * 2.2));
        break;
      case 'pinch':
        this.drawRadial(ctx, flat, w, h, 0.55, (r) => Math.pow(r, 1 / (1 + this.intensity * 1.8)));
        break;
      case 'handwarp':
        this.drawRadial(ctx, flat, w, h, 0.42, (r) => Math.pow(r, 1 + this.intensity * 1.4));
        break;
      case 'fisheye':
        this.drawFisheye(ctx, flat, w, h);
        break;
      default:
        ctx.drawImage(flat, 0, 0);
    }
    return true;
  }

  /** Cover-crop + optional mirror into the scratch canvas. */
  private stage(
    source: CanvasImageSource,
    sw: number,
    sh: number,
    w: number,
    h: number,
  ): HTMLCanvasElement | null {
    const sctx = this.scratchCtx;
    if (!sctx) return null;
    if (this.scratch.width !== w || this.scratch.height !== h) {
      this.scratch.width = w;
      this.scratch.height = h;
    }

    const srcAspect = sw / sh;
    const dstAspect = w / h;
    let cw = sw;
    let ch = sh;
    if (srcAspect > dstAspect) cw = sh * dstAspect;
    else ch = sw / dstAspect;
    const cx = (sw - cw) / 2;
    const cy = (sh - ch) / 2;

    sctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.mirror) sctx.setTransform(-1, 0, 0, 1, w, 0);
    try {
      sctx.drawImage(source, cx, cy, cw, ch, 0, 0, w, h);
    } catch {
      return null;
    }
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    return this.scratch;
  }

  /**
   * `map` takes a normalised destination radius (0..1 of the effect disc) and
   * returns the normalised source radius — exactly the shader's remap.
   */
  private drawRadial(
    ctx: CanvasRenderingContext2D,
    flat: HTMLCanvasElement,
    w: number,
    h: number,
    baseRadius: number,
    map: (r: number) => number,
  ): void {
    ctx.drawImage(flat, 0, 0);
    if (this.intensity <= 0.001) return;

    const cx = this.centerX * w;
    const cy = this.centerY * h;
    const radius = baseRadius * this.radiusScale * h;
    const rings = this.rings;

    for (let i = rings; i >= 1; i--) {
      const rOuter = (i / rings) * radius;
      const rInner = ((i - 1) / rings) * radius;
      const rMid = (rOuter + rInner) / 2;
      const rn = rMid / radius;
      if (rn <= 0) continue;

      const mapped = map(rn);
      const f = 1 + (mapped / rn - 1) * this.intensity;
      // scale = 1 / f moves source radius r*f onto destination radius r.
      const scale = 1 / Math.max(0.05, f);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      if (rInner > 0) {
        ctx.arc(cx, cy, rInner, 0, Math.PI * 2, true);
      }
      ctx.clip('evenodd');
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      ctx.drawImage(flat, 0, 0);
      ctx.restore();
    }
  }

  private drawFisheye(
    ctx: CanvasRenderingContext2D,
    flat: HTMLCanvasElement,
    w: number,
    h: number,
  ): void {
    const k = this.intensity * 1.3;
    const maxR = Math.hypot(w, h) / 2;
    const cx = w / 2;
    const cy = h / 2;
    const rings = this.rings;

    for (let i = rings; i >= 1; i--) {
      const rOuter = (i / rings) * maxR;
      const rInner = ((i - 1) / rings) * maxR;
      const rn = (rOuter + rInner) / 2 / maxR;
      const f = (1 + k * rn * rn) / (1 + k);
      const scale = 1 / Math.max(0.05, f);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      if (rInner > 0) ctx.arc(cx, cy, rInner, 0, Math.PI * 2, true);
      ctx.clip('evenodd');
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      ctx.drawImage(flat, 0, 0);
      ctx.restore();
    }
  }

  private drawMirror(
    ctx: CanvasRenderingContext2D,
    flat: HTMLCanvasElement,
    w: number,
    h: number,
  ): void {
    ctx.drawImage(flat, 0, 0);
    const half = Math.ceil(w / 2);
    ctx.save();
    ctx.globalAlpha = this.intensity;
    // Left half, flipped onto the right.
    ctx.setTransform(-1, 0, 0, 1, w, 0);
    ctx.drawImage(flat, 0, 0, half, h, 0, 0, half, h);
    ctx.restore();
  }

  private drawPixel(
    ctx: CanvasRenderingContext2D,
    flat: HTMLCanvasElement,
    w: number,
    h: number,
  ): void {
    const small = this.small;
    const smallCtx = this.smallCtx;
    if (!smallCtx) {
      ctx.drawImage(flat, 0, 0);
      return;
    }
    const blocks = Math.round(lerp(240, 16, this.intensity));
    const tw = Math.max(2, blocks);
    const th = Math.max(2, Math.round((blocks * h) / w));
    if (small.width !== tw || small.height !== th) {
      small.width = tw;
      small.height = th;
    }
    smallCtx.imageSmoothingEnabled = true;
    smallCtx.drawImage(flat, 0, 0, w, h, 0, 0, tw, th);

    // Hard-edged upscale is what actually sells the pixel look.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, tw, th, 0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
  }

  private drawWave(
    ctx: CanvasRenderingContext2D,
    flat: HTMLCanvasElement,
    w: number,
    h: number,
    time: number,
  ): void {
    const strips = 44;
    const amp = this.intensity * 0.035 * w;
    const stripHeight = h / strips;
    for (let i = 0; i < strips; i++) {
      const y = i * stripHeight;
      const dx = Math.sin((y / h) * 14 + time * 2.2) * amp;
      ctx.drawImage(
        flat,
        0,
        y,
        w,
        stripHeight + 1,
        dx,
        y,
        w,
        stripHeight + 1,
      );
    }
  }

  private drawRgbShift(
    ctx: CanvasRenderingContext2D,
    flat: HTMLCanvasElement,
    w: number,
    time: number,
  ): void {
    const wobble = 0.65 + 0.35 * Math.sin(time * 3.1);
    const off = this.intensity * 0.018 * wobble * w;
    ctx.drawImage(flat, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.45 * this.intensity;
    ctx.drawImage(flat, off, 0);
    ctx.drawImage(flat, -off, 0);
    ctx.restore();
  }

  destroy(): void {
    this.disposed = true;
    this.ctx = null;
    this.scratchCtx = null;
    this.smallCtx = null;
    // Zeroing the backing stores releases the memory straight away.
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.scratch.width = 0;
    this.scratch.height = 0;
    this.small.width = 0;
    this.small.height = 0;
  }
}
