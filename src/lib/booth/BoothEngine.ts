import type { FilterId } from '../../types/filters';
import type { StickerLayer } from '../../types/stickers';
import type { StripStyle } from '../../types/photobooth';
import { CAMERA_ZOOM, FRAME_HEIGHT, FRAME_WIDTH, SHOT_COUNT } from '../../types/photobooth';
import { CameraManager } from '../camera/CameraManager';
import { FilterEngine, zoomCrop } from '../filters/FilterEngine';
import type { CoverCrop } from '../filters/FilterEngine';
import { CanvasFilterRenderer } from '../filters/CanvasFilterRenderer';
import type { FrameRenderer } from '../filters/FrameRenderer';
import { ZoomStage } from './ZoomStage';
import { layoutStripPreview } from './StripPreview';
import type { StripPreviewLayout } from './StripPreview';
import { ParticleSystem } from '../effects/ParticleSystem';
import { HandTracker } from '../mediapipe/HandTracker';
import type { HandFrame } from '../mediapipe/HandTracker';
import { FaceTracker } from '../mediapipe/FaceTracker';
import type { FaceFrame } from '../mediapipe/FaceTracker';
import { GestureManager } from '../mediapipe/GestureManager';
import type { GestureState } from '../mediapipe/GestureManager';
import { HandInteractionManager } from '../mediapipe/HandInteractionManager';
import { resolveAnchor } from '../mediapipe/attachments';
import { stickerRenderer } from '../stickers/StickerRenderer';
import { damp } from '../utils/math';

/**
 * One camera-shaped input to the render loop. `local` is the booth's own
 * CameraManager; `remote` is the partner's WebRTC stream, decoded by a hidden
 * <video> owned by CoupleConnection.
 */
export interface BoothSource {
  video: HTMLVideoElement;
  isLocal: boolean;
}

export interface BoothConfig {
  filter: FilterId;
  intensity: number;
  stickers: StickerLayer[];
  selectedStickerId: string | null;
  mirrorFrontCamera: boolean;
  handTracking: boolean;
  faceTracking: boolean;
  showChrome: boolean;
  cameraZoom: number;
  /** WYSIWYG: render the cam display as the chosen strip layout. */
  stripStyle: StripStyle | null;
  /** How many roll slots are already filled — the live cell follows this. */
  filledCount: number;
  /** Partner's video; null in solo mode, which renders exactly as before. */
  remoteVideo: HTMLVideoElement | null;
  /** Frozen shots for cells behind the live one (object URLs → <img> not needed here; bitmaps). */
  frozenCells: (CanvasImageSource | null)[];
}

export interface BoothCallbacks {
  onStickersChanged?: (next: StickerLayer[]) => void;
  onNextFilter?: () => void;
  onCelebrate?: () => void;
  onFps?: (fps: number) => void;
  onGesture?: (state: GestureState) => void;
  onTrackingStateChanged?: (active: boolean) => void;
}

export interface CaptureResult {
  blob: Blob;
  width: number;
  height: number;
}

const EMPTY_HANDS: HandFrame = { hands: [], timestamp: 0 };
const EMPTY_FACES: FaceFrame = { faces: [], timestamp: 0 };

/**
 * The single owner of the frame loop.
 *
 * Everything visible in the booth is produced here, in one pass, in this order:
 *
 *   camera -> WebGL filter -> effect layer -> sticker layer -> canvas
 *
 * `capture()` runs that exact same pass at full resolution into an offscreen
 * canvas. There is no second, "export" code path that could drift from what the
 * preview shows.
 */
export class BoothEngine {
  readonly camera = new CameraManager();
  readonly particles = new ParticleSystem();
  readonly gestures = new GestureManager();
  readonly hands = new HandTracker();
  readonly faces = new FaceTracker();

  private renderer: FrameRenderer | null = null;
  private readonly zoomStage = new ZoomStage();
  private interactions: HandInteractionManager;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private captureCtx: CanvasRenderingContext2D | null = null;

  private rafId = 0;
  private running = false;
  private visible = true;
  private lastTime = 0;
  private startTime = 0;

  private frameCount = 0;
  private fpsWindowStart = 0;

  private config: BoothConfig = {
    filter: 'original',
    intensity: 0,
    stickers: [],
    selectedStickerId: null,
    mirrorFrontCamera: true,
    handTracking: false,
    faceTracking: false,
    showChrome: true,
    cameraZoom: CAMERA_ZOOM,
    stripStyle: null,
    filledCount: 0,
    remoteVideo: null,
    frozenCells: [],
  };
  private callbacks: BoothCallbacks = {};

  /** Smoothed warp target, so the Hand Warp filter glides instead of snapping. */
  private warpX = 0.5;
  private warpY = 0.5;
  private warpRadius = 1;

  private displayLayers: StickerLayer[] = [];
  private onVisibilityChange: (() => void) | null = null;

  /**
   * Cached from the last resize. Reading layout inside the frame loop would force
   * a synchronous reflow every single frame.
   */
  private previewCssWidth = 1;

  constructor() {
    this.interactions = new HandInteractionManager(this.particles, {
      onNextFilter: () => this.callbacks.onNextFilter?.(),
      onCelebrate: () => this.callbacks.onCelebrate?.(),
    });
  }

  get rendererKind(): 'webgl' | 'canvas2d' | 'none' {
    return this.renderer?.kind ?? 'none';
  }

  get video(): HTMLVideoElement {
    return this.camera.video;
  }

  setCallbacks(callbacks: BoothCallbacks): void {
    this.callbacks = callbacks;
  }

  setConfig(config: Partial<BoothConfig>): void {
    Object.assign(this.config, config);
  }

  /** Builds the renderer, preferring WebGL and falling back without complaint. */
  initRenderer(): 'webgl' | 'canvas2d' {
    if (this.renderer) return this.renderer.kind;

    if (FilterEngine.isAvailable()) {
      const engine = new FilterEngine();
      if (engine.initialize({ width: 720, height: 900 })) {
        this.renderer = engine;
        return 'webgl';
      }
      engine.destroy();
    }
    const fallback = new CanvasFilterRenderer();
    fallback.resize(720, 900);
    this.renderer = fallback;
    return 'canvas2d';
  }

  attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
  }

  /** Size the visible canvas to its box, capped so mid-range phones keep up. */
  resizePreview(cssWidth: number, cssHeight: number, dpr: number): void {
    if (!this.canvas) return;
    this.previewCssWidth = Math.max(1, cssWidth);
    const scale = Math.min(dpr, 2);
    const maxWidth = 900;
    let width = Math.round(Math.min(cssWidth * scale, maxWidth));
    let height = Math.round(width * (cssHeight / cssWidth));
    if (width < 2 || height < 2) {
      width = 2;
      height = 2;
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.renderer?.resize(width, height);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.startTime = this.lastTime;
    this.fpsWindowStart = this.lastTime;
    this.frameCount = 0;

    if (!this.onVisibilityChange) {
      this.onVisibilityChange = () => {
        this.visible = !document.hidden;
        // Tracking is the expensive part; stop it outright when hidden.
        if (document.hidden) {
          this.hands.pause();
          this.faces.pause();
        } else {
          this.hands.resume();
          this.faces.resume();
          this.lastTime = performance.now();
        }
      };
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    const tick = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);
      this.frame(now);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /** Called by an IntersectionObserver so an off-screen booth costs nothing. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      this.lastTime = performance.now();
      this.hands.resume();
      this.faces.resume();
    } else {
      this.hands.pause();
      this.faces.pause();
    }
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (!this.visible || !this.ctx || !this.canvas || !this.renderer) return;
    const video = this.camera.video;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    const crop = zoomCrop(
      video.videoWidth / video.videoHeight,
      this.canvas.width / this.canvas.height,
      this.config.cameraZoom,
    );
    const mirror = this.camera.shouldMirror && this.config.mirrorFrontCamera;

    const { hands, faces, gesture } = this.runTracking(video, now);
    this.runInteractions(hands, gesture, crop, mirror, dt, now);

    if (this.config.stripStyle) {
      this.renderStripPreviewFrame(video, hands, faces, crop, mirror, now, dt);
    } else {
      this.renderFrame(video, crop, mirror, now, dt, hands, faces);
    }
    this.trackFps(now);
  }

  /**
   * The WYSIWYG couple path: the cam display *is* the strip. Local and remote
   * sources each get their own strip, side by side (stacked on portrait), with
   * the live feed in the next unfilled cell and frozen shots behind it.
   */
  private renderStripPreviewFrame(
    video: HTMLVideoElement,
    hands: HandFrame,
    faces: FaceFrame,
    crop: CoverCrop,
    mirror: boolean,
    now: number,
    dt: number,
  ): void {
    const ctx = this.ctx!;
    const canvas = this.canvas!;
    const style = this.config.stripStyle!;
    const remote = this.config.remoteVideo;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#100F14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Two panes side-by-side on landscape, stacked on portrait. Each pane is a
    // complete strip preview for one source; solo (no remote) renders one.
    const portrait = canvas.height > canvas.width;
    const paneCount = remote ? 2 : 1;
    const gap = canvas.width * 0.025;
    const paneW = portrait ? canvas.width : (canvas.width - gap * (paneCount - 1)) / paneCount;
    const paneH = portrait ? (canvas.height - gap * (paneCount - 1)) / paneCount : canvas.height;

    const localPane: StripPreviewLayout = layoutStripPreview({
      canvasWidth: paneW,
      canvasHeight: paneH,
      style,
      slots: SHOT_COUNT,
      filledCount: this.config.filledCount,
      padding: 0.02,
    });
    this.drawStripPane(ctx, localPane, paneX(portrait, 0, paneW, gap), 0, video, mirror, now);

    if (remote && remote.readyState >= 2 && remote.videoWidth > 0) {
      const remotePane: StripPreviewLayout = layoutStripPreview({
        canvasWidth: paneW,
        canvasHeight: paneH,
        style,
        slots: SHOT_COUNT,
        filledCount: this.config.filledCount,
        padding: 0.02,
      });
      this.drawStripPane(
        ctx,
        remotePane,
        portrait ? 0 : paneX(portrait, 1, paneW, gap),
        portrait ? paneH + gap : 0,
        remote,
        false, // the partner's feed is already the right way round for them
        now,
      );
    } else if (remote) {
      // Partner pane reserved but not decoding yet — hold its space with a
      // subtle placeholder so the layout does not jump when they arrive.
      const x = portrait ? 0 : paneX(portrait, 1, paneW, gap);
      const y = portrait ? paneH + gap : 0;
      ctx.fillStyle = 'rgba(251, 247, 242, 0.04)';
      ctx.fillRect(x + paneW * 0.02, y + paneH * 0.02, paneW * 0.96, paneH * 0.96);
    }

    this.particles.update(dt);
    this.particles.draw(ctx, canvas.width, canvas.height);

    const layers = this.resolveLayers(hands, faces, crop, mirror);
    stickerRenderer.draw(ctx, layers, canvas.width, canvas.height, {
      showChrome: this.config.showChrome,
      selectedId: this.config.selectedStickerId,
      uiScale: canvas.width / this.previewCssWidth,
      now,
    });
  }

  /** One source's strip: background, frozen cells, live cell, footer. */
  private drawStripPane(
    ctx: CanvasRenderingContext2D,
    layout: StripPreviewLayout,
    originX: number,
    originY: number,
    video: HTMLVideoElement,
    mirror: boolean,
    now: number,
  ): void {
    const renderer = this.renderer!;
    const time = (now - this.startTime) / 1000;

    ctx.fillStyle = '#1B1A21';
    ctx.fillRect(originX, originY, layout.width, layout.height);

    for (const cell of layout.cells) {
      const x = originX + cell.x;
      const y = originY + cell.y;
      if (!cell.isLive) {
        const frozen = this.config.frozenCells[cell.slot];
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cell.w, cell.h);
        ctx.clip();
        if (frozen) {
          drawCoverCrop(ctx, frozen, x, y, cell.w, cell.h);
        } else {
          ctx.fillStyle = 'rgba(16, 15, 20, 0.35)';
          ctx.fillRect(x, y, cell.w, cell.h);
        }
        ctx.restore();
        continue;
      }

      // The live cell runs the exact same filter pass, then lands clipped in
      // its rect — so the preview and the eventual capture agree.
      renderer.setFilter(this.config.filter);
      renderer.setIntensity(this.config.intensity);
      renderer.setMirror(mirror);
      renderer.setCenter(0.5, 0.5);
      renderer.setRadiusScale(1);

      const cellAspect = cell.w / cell.h;
      const crop = zoomCrop(
        video.videoWidth / video.videoHeight,
        cellAspect,
        this.config.cameraZoom,
      );
      const source = this.zoomStage.compose(
        video,
        video.videoWidth,
        video.videoHeight,
        cell.w,
        cell.h,
        this.config.cameraZoom,
      );
      const drew = source
        ? renderer.render(source, time, source.width, source.height)
        : renderer.render(video, time, video.videoWidth, video.videoHeight);
      if (drew) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cell.w, cell.h);
        ctx.clip();
        ctx.drawImage(renderer.canvas, x, y, cell.w, cell.h);
        ctx.restore();
      } else {
        ctx.fillStyle = '#100F14';
        ctx.fillRect(x, y, cell.w, cell.h);
      }
      void crop;
    }

    // Footer band: the strip chrome, drawn faint — the real footer is baked
    // by StripRenderer at export; this is just the live hint of it.
    ctx.fillStyle = 'rgba(251, 247, 242, 0.06)';
    ctx.fillRect(originX, originY + layout.height - layout.footer, layout.width, layout.footer);
  }

  private runTracking(video: HTMLVideoElement, now: number) {
    let hands = EMPTY_HANDS;
    let faces = EMPTY_FACES;
    let gesture = this.gestures.current;

    if (this.config.handTracking && this.hands.isReady) {
      hands = this.hands.detect(video, now);
      gesture = this.gestures.update(hands.hands, now);
      this.callbacks.onGesture?.(gesture);
    } else if (gesture.gesture !== 'NONE') {
      this.gestures.reset();
      gesture = this.gestures.current;
      this.callbacks.onGesture?.(gesture);
    }

    if (this.config.faceTracking && this.faces.isReady) {
      faces = this.faces.detect(video, now);
    }
    return { hands, faces, gesture };
  }

  private runInteractions(
    hands: HandFrame,
    gesture: GestureState,
    crop: CoverCrop,
    mirror: boolean,
    dt: number,
    now: number,
  ): void {
    if (!this.config.handTracking) return;

    const result = this.interactions.update({
      hands,
      gesture,
      crop,
      mirror,
      dt,
      now,
      stickers: this.config.stickers,
      selectedId: this.config.selectedStickerId,
      enabled: true,
    });

    if (result.stickers) {
      this.config.stickers = result.stickers;
      this.callbacks.onStickersChanged?.(result.stickers);
    }
    if (result.warpCenter) {
      // Half-life smoothing keeps the warp from jittering with the landmark.
      this.warpX = damp(this.warpX, result.warpCenter.x, 0.06, dt);
      this.warpY = damp(this.warpY, result.warpCenter.y, 0.06, dt);
      this.warpRadius = damp(this.warpRadius, result.warpRadius, 0.12, dt);
    }
  }

  private renderFrame(
    video: HTMLVideoElement,
    crop: CoverCrop,
    mirror: boolean,
    now: number,
    dt: number,
    hands: HandFrame,
    faces: FaceFrame,
  ): void {
    const ctx = this.ctx!;
    const canvas = this.canvas!;
    this.particles.update(dt);
    this.drawPass(ctx, canvas.width, canvas.height, video, crop, mirror, now, hands, faces, {
      showChrome: this.config.showChrome,
      uiScale: canvas.width / this.previewCssWidth,
    });
  }

  /**
   * One complete composite. Shared by the live preview and by `capture()`, which
   * is what guarantees the exported photo matches the screen.
   */
  private drawPass(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    video: HTMLVideoElement,
    crop: CoverCrop,
    mirror: boolean,
    now: number,
    hands: HandFrame,
    faces: FaceFrame,
    options: { showChrome: boolean; uiScale: number },
  ): boolean {
    const renderer = this.renderer!;
    const time = (now - this.startTime) / 1000;

    renderer.setFilter(this.config.filter);
    renderer.setIntensity(this.config.intensity);
    renderer.setMirror(mirror);
    if (this.config.filter === 'handwarp') {
      renderer.setCenter(this.warpX, this.warpY);
      renderer.setRadiusScale(this.warpRadius);
    } else {
      renderer.setCenter(0.5, 0.5);
      renderer.setRadiusScale(1);
    }

    // Pull the subject back before the filter stack sees it, so the preview and
    // the exported frame zoom identically and no renderer needs to know about it.
    const zoomed = this.zoomStage.compose(
      video,
      video.videoWidth,
      video.videoHeight,
      width,
      height,
      CAMERA_ZOOM,
    );
    const drew = zoomed
      ? renderer.render(zoomed, time, zoomed.width, zoomed.height)
      : renderer.render(video, time, video.videoWidth, video.videoHeight);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (drew) {
      ctx.drawImage(renderer.canvas, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#100F14';
      ctx.fillRect(0, 0, width, height);
    }

    this.particles.draw(ctx, width, height);

    const layers = this.resolveLayers(hands, faces, crop, mirror);
    stickerRenderer.draw(ctx, layers, width, height, {
      showChrome: options.showChrome,
      selectedId: this.config.selectedStickerId,
      uiScale: options.uiScale,
      now,
    });
    return drew;
  }

  /**
   * Applies live tracking to any sticker that is pinned to a body part. Free
   * stickers pass through untouched, so this costs nothing when nothing is
   * attached.
   */
  private resolveLayers(
    hands: HandFrame,
    faces: FaceFrame,
    crop: CoverCrop,
    mirror: boolean,
  ): StickerLayer[] {
    const source = this.config.stickers;
    if (source.length === 0) return source;

    let needsWork = false;
    for (const layer of source) {
      if (layer.attachment !== 'none') {
        needsWork = true;
        break;
      }
    }
    if (!needsWork) return source;

    this.displayLayers.length = 0;
    for (const layer of source) {
      if (layer.attachment === 'none') {
        this.displayLayers.push(layer);
        continue;
      }
      const anchor = resolveAnchor(
        layer.attachment,
        layer.attachmentPoint,
        hands,
        faces,
        crop,
        mirror,
        layer.attachmentIndex ?? 0,
      );
      if (!anchor) {
        // Nothing to attach to right now — leave the sticker where it was rather
        // than teleporting it to a corner.
        this.displayLayers.push(layer);
        continue;
      }
      this.displayLayers.push({
        ...layer,
        x: anchor.x,
        y: anchor.y,
        rotation: anchor.rotation,
        scale: anchor.width,
      });
    }
    return this.displayLayers;
  }

  private trackFps(now: number): void {
    this.frameCount++;
    const elapsed = now - this.fpsWindowStart;
    if (elapsed >= 500) {
      const fps = (this.frameCount * 1000) / elapsed;
      this.frameCount = 0;
      this.fpsWindowStart = now;
      this.callbacks.onFps?.(Math.round(fps));
    }
  }

  /** Renders one frame at full export resolution and encodes it as a PNG. */
  async capture(): Promise<CaptureResult> {
    const renderer = this.renderer;
    const video = this.camera.video;
    if (!renderer || video.readyState < 2 || video.videoWidth === 0) {
      throw new Error('The camera is not ready yet.');
    }

    if (!this.captureCanvas) {
      this.captureCanvas = document.createElement('canvas');
      this.captureCanvas.width = FRAME_WIDTH;
      this.captureCanvas.height = FRAME_HEIGHT;
      this.captureCtx = this.captureCanvas.getContext('2d', { alpha: false });
    }
    const ctx = this.captureCtx;
    if (!ctx) throw new Error('Canvas is unavailable.');

    // Briefly retarget the renderer at export resolution, then put it back so the
    // preview keeps its cheaper size. Guard against the 2px placeholder size that
    // exists before the first ResizeObserver fires.
    const rawPreviewWidth = this.canvas?.width ?? 720;
    const rawPreviewHeight = this.canvas?.height ?? 900;
    const previewWidth = rawPreviewWidth < 10 ? 720 : rawPreviewWidth;
    const previewHeight = rawPreviewHeight < 10 ? 900 : rawPreviewHeight;

    const mirror = this.camera.shouldMirror && this.config.mirrorFrontCamera;
    const crop = zoomCrop(
      video.videoWidth / video.videoHeight,
      FRAME_WIDTH / FRAME_HEIGHT,
      this.config.cameraZoom,
    );
    const now = performance.now();

    renderer.resize(FRAME_WIDTH, FRAME_HEIGHT);
    let drew = false;
    try {
      drew = this.drawPass(
        ctx,
        FRAME_WIDTH,
        FRAME_HEIGHT,
        video,
        crop,
        mirror,
        now,
        this.config.handTracking ? this.hands.frame : EMPTY_HANDS,
        this.config.faceTracking ? this.faces.frame : EMPTY_FACES,
        { showChrome: false, uiScale: 1 },
      );
    } finally {
      renderer.resize(previewWidth, previewHeight);
    }
    if (!drew) throw new Error('That frame could not be captured. Try again.');

    const blob = await new Promise<Blob | null>((resolve) =>
      this.captureCanvas!.toBlob(resolve, 'image/png'),
    );
    if (!blob) throw new Error('That photo could not be encoded.');
    return { blob, width: FRAME_WIDTH, height: FRAME_HEIGHT };
  }

  async enableHandTracking(): Promise<boolean> {
    const ok = await this.hands.initialize();
    this.callbacks.onTrackingStateChanged?.(ok);
    return ok;
  }

  async enableFaceTracking(): Promise<boolean> {
    return this.faces.initialize();
  }

  destroy(): void {
    this.stop();
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
    this.renderer?.destroy();
    this.zoomStage.destroy();
    this.renderer = null;
    this.hands.destroy();
    this.faces.destroy();
    this.camera.destroy();
    this.particles.clear();
    this.ctx = null;
    this.canvas = null;
    if (this.captureCanvas) {
      this.captureCanvas.width = 0;
      this.captureCanvas.height = 0;
    }
    this.captureCanvas = null;
    this.captureCtx = null;
  }
}

/** Pane origin for the duo layout; index 0 = local, 1 = partner. */
function paneX(portrait: boolean, index: number, paneW: number, gap: number): number {
  if (portrait) return 0;
  return index * (paneW + gap);
}

/** `object-fit: cover` into a target rect, for frozen cells. */
function drawCoverCrop(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  let sw = 0;
  let sh = 0;
  let fullW = 0;
  let fullH = 0;
  if (image instanceof HTMLVideoElement) {
    fullW = sw = image.videoWidth;
    fullH = sh = image.videoHeight;
  } else if (image instanceof HTMLImageElement) {
    fullW = sw = image.naturalWidth;
    fullH = sh = image.naturalHeight;
  } else if (image instanceof HTMLCanvasElement) {
    fullW = sw = image.width;
    fullH = sh = image.height;
  } else if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    fullW = sw = image.width;
    fullH = sh = image.height;
  }
  if (!sw || !sh) return;
  const srcAspect = sw / sh;
  const dstAspect = w / h;
  if (srcAspect > dstAspect) sw = sh * dstAspect;
  else sh = sw / dstAspect;
  try {
    ctx.drawImage(image, (fullW - sw) / 2, (fullH - sh) / 2, sw, sh, x, y, w, h);
  } catch {
    /* not decoded yet; the next frame retries */
  }
}
