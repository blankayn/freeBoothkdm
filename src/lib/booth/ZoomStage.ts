/**
 * Composites the camera frame into a frame-aspect canvas at a given zoom, so
 * every renderer downstream keeps seeing a source it can cover-crop 1:1 and
 * needs no notion of zoom at all.
 *
 * The gap this opens matters. A webcam is landscape, the booth frame is 4:5, so
 * the sensor's vertical field of view is already fully spent at 1x — pulling
 * back cannot conjure more scene, it can only draw the subject smaller. The
 * band left above and below is filled with a blurred blow-up of the same frame
 * so it reads as depth rather than as a broken letterbox.
 */
export class ZoomStage {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D | null;
  /** Deliberately tiny: the upscale back to full size is what does the blurring. */
  private backdrop = document.createElement('canvas');
  private backdropCtx: CanvasRenderingContext2D | null;

  constructor() {
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.backdrop.width = 48;
    this.backdrop.height = 60;
    this.backdropCtx = this.backdrop.getContext('2d', { alpha: false });
  }

  /**
   * Returns the canvas to render in place of `source`, or `null` when there is
   * nothing to add and the caller should hand the renderer `source` untouched —
   * which keeps the 1x path free of an extra full-frame blit.
   */
  compose(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    destWidth: number,
    destHeight: number,
    zoom: number,
  ): HTMLCanvasElement | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!(zoom > 0) || zoom >= 1) return null;
    if (sourceWidth <= 0 || sourceHeight <= 0 || destWidth <= 0 || destHeight <= 0) return null;

    const w = Math.max(2, Math.round(destWidth));
    const h = Math.max(2, Math.round(destHeight));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    // Exactly the cover scale the renderers would have used, times the zoom.
    const scale = Math.max(w / sourceWidth, h / sourceHeight) * zoom;
    const dw = sourceWidth * scale;
    const dh = sourceHeight * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    try {
      if (!this.drawBackdrop(ctx, source, sourceWidth, sourceHeight, w, h)) {
        ctx.fillStyle = '#100F14';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(source, dx, dy, dw, dh);
    } catch {
      // Safari throws while the video has no decoded frame. Let the caller fall
      // back to the raw source for this tick rather than show a stale composite.
      return null;
    }

    return this.canvas;
  }

  /**
   * Cover-crops the frame into the thumbnail first so the blur stays colour-aligned
   * with the subject above it — a stretched backdrop reads as a smear.
   */
  private drawBackdrop(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    w: number,
    h: number,
  ): boolean {
    const bctx = this.backdropCtx;
    if (!bctx) return false;

    const bw = this.backdrop.width;
    const bh = this.backdrop.height;
    const cover = Math.max(bw / sourceWidth, bh / sourceHeight);
    const cw = sourceWidth * cover;
    const ch = sourceHeight * cover;
    bctx.drawImage(source, (bw - cw) / 2, (bh - ch) / 2, cw, ch);

    ctx.drawImage(this.backdrop, 0, 0, w, h);
    // Knocked back so the backdrop never competes with the subject.
    ctx.fillStyle = 'rgba(16, 15, 20, 0.55)';
    ctx.fillRect(0, 0, w, h);
    return true;
  }

  destroy(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.backdrop.width = 0;
    this.backdrop.height = 0;
    this.ctx = null;
    this.backdropCtx = null;
  }
}
