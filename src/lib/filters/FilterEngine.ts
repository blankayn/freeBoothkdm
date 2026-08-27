import type { FilterId, RendererKind } from '../../types/filters';
import type { FrameRenderer } from './FrameRenderer';
import { FILTER_RADIUS, FRAGMENT_SHADERS, VERTEX_SHADER } from './shaders';

interface ProgramBundle {
  program: WebGLProgram;
  attribPos: number;
  uniforms: {
    texture: WebGLUniformLocation | null;
    intensity: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    center: WebGLUniformLocation | null;
    aspect: WebGLUniformLocation | null;
    radius: WebGLUniformLocation | null;
    mirror: WebGLUniformLocation | null;
    srcOffset: WebGLUniformLocation | null;
    srcScale: WebGLUniformLocation | null;
  };
}

export interface FilterEngineInit {
  width: number;
  height: number;
}

/**
 * Renders a video frame through a fragment shader into its own canvas.
 *
 * The engine deliberately owns nothing but pixels: no DOM layout, no state about
 * the booth, no knowledge of stickers. The compositor draws `engine.canvas` and
 * layers everything else on top, which is what keeps the exported photo identical
 * to the live preview — both go through this same call.
 */
export class FilterEngine implements FrameRenderer {
  readonly kind: RendererKind = 'webgl';
  readonly canvas: HTMLCanvasElement;

  private gl: WebGLRenderingContext | null = null;
  private programs = new Map<FilterId, ProgramBundle>();
  private quad: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;

  /** Dimensions currently allocated in the texture, so uploads can reuse it. */
  private texWidth = 0;
  private texHeight = 0;

  private filter: FilterId = 'original';
  private intensity = 0;
  private centerX = 0.5;
  private centerY = 0.5;
  private radiusScale = 1;
  private mirror = false;

  private lost = false;
  private disposed = false;
  private onLost: ((e: Event) => void) | null = null;
  private onRestored: (() => void) | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2;
    this.canvas.height = 2;
  }

  static isAvailable(): boolean {
    try {
      const probe = document.createElement('canvas');
      const ctx = probe.getContext('webgl') || probe.getContext('experimental-webgl');
      return !!ctx;
    } catch {
      return false;
    }
  }

  get isReady(): boolean {
    return !!this.gl && !this.lost && !this.disposed;
  }

  get contextLost(): boolean {
    return this.lost;
  }

  initialize(init: FilterEngineInit): boolean {
    if (this.disposed) return false;

    const attrs: WebGLContextAttributes = {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    };

    const gl =
      (this.canvas.getContext('webgl', attrs) as WebGLRenderingContext | null) ??
      (this.canvas.getContext('experimental-webgl', attrs) as WebGLRenderingContext | null);

    if (!gl) return false;
    this.gl = gl;
    this.lost = false;

    this.onLost = (event: Event) => {
      // Without preventDefault the context never comes back.
      event.preventDefault();
      this.lost = true;
      this.programs.clear();
      this.texture = null;
      this.quad = null;
      this.texWidth = 0;
      this.texHeight = 0;
    };
    this.onRestored = () => {
      this.lost = false;
      this.setupGlObjects();
    };
    this.canvas.addEventListener('webglcontextlost', this.onLost as EventListener);
    this.canvas.addEventListener('webglcontextrestored', this.onRestored);

    this.resize(init.width, init.height);
    this.setupGlObjects();
    return true;
  }

  private setupGlObjects(): void {
    const gl = this.gl;
    if (!gl) return;

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // CLAMP_TO_EDGE + LINEAR is what lets distortions sample past the rim without
    // wrapping artefacts, and it works with non-power-of-two video frames.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // Warm the shader actually in use so the first frame is not a hitch.
    this.getProgram(this.filter);
  }

  resize(width: number, height: number): void {
    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl?.viewport(0, 0, w, h);
  }

  setFilter(id: FilterId): void {
    if (this.filter === id) return;
    this.filter = id;
    // Compile on selection rather than on the next frame, so switching filters
    // never drops a frame mid-countdown.
    if (this.isReady) this.getProgram(id);
  }

  getFilter(): FilterId {
    return this.filter;
  }

  setIntensity(value: number): void {
    this.intensity = Math.min(1, Math.max(0, value));
  }

  /** Point of interest in frame space (0..1, y down). Drives the radial filters. */
  setCenter(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
  }

  /** Multiplier on the filter's base radius — used to react to pinch distance. */
  setRadiusScale(scale: number): void {
    this.radiusScale = Math.min(3, Math.max(0.2, scale));
  }

  setMirror(mirror: boolean): void {
    this.mirror = mirror;
  }

  /**
   * Draw one frame. `source` is normally the <video>, but any TexImageSource works,
   * which is what lets the review screen re-run a filter over a still.
   */
  render(
    source: CanvasImageSource,
    timeSeconds: number,
    sourceWidth: number,
    sourceHeight: number,
  ): boolean {
    const gl = this.gl;
    if (!gl || this.lost || this.disposed) return false;
    if (sourceWidth <= 0 || sourceHeight <= 0) return false;

    const bundle = this.getProgram(this.filter);
    if (!bundle) return false;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try {
      if (sourceWidth !== this.texWidth || sourceHeight !== this.texHeight) {
        // Allocation only happens when the camera resolution genuinely changes.
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source as TexImageSource,
        );
        this.texWidth = sourceWidth;
        this.texHeight = sourceHeight;
      } else {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source as TexImageSource,
        );
      }
    } catch {
      // Safari throws if the video has no decoded frame yet. Skip this tick.
      return false;
    }

    const width = this.canvas.width;
    const height = this.canvas.height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(bundle.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(bundle.attribPos);
    gl.vertexAttribPointer(bundle.attribPos, 2, gl.FLOAT, false, 0, 0);

    const frameAspect = width / height;
    const crop = coverCrop(sourceWidth / sourceHeight, frameAspect);
    const baseRadius = FILTER_RADIUS[this.filter] ?? 0.5;

    const u = bundle.uniforms;
    gl.uniform1i(u.texture, 0);
    gl.uniform1f(u.intensity, this.intensity);
    gl.uniform1f(u.time, timeSeconds);
    gl.uniform2f(u.center, this.centerX, this.centerY);
    gl.uniform1f(u.aspect, frameAspect);
    gl.uniform1f(u.radius, baseRadius * this.radiusScale);
    gl.uniform1f(u.mirror, this.mirror ? 1 : 0);
    gl.uniform2f(u.srcOffset, crop.offsetX, crop.offsetY);
    gl.uniform2f(u.srcScale, crop.scaleX, crop.scaleY);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return true;
  }

  private getProgram(id: FilterId): ProgramBundle | null {
    const cached = this.programs.get(id);
    if (cached) return cached;

    const gl = this.gl;
    if (!gl || this.lost) return null;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADERS[id]);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    // Shader objects are reference-counted by the program; drop our handles now.
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (import.meta.env.DEV) {
        console.error(`[filters] link failed for "${id}":`, gl.getProgramInfoLog(program));
      }
      gl.deleteProgram(program);
      return null;
    }

    const bundle: ProgramBundle = {
      program,
      attribPos: gl.getAttribLocation(program, 'a_pos'),
      uniforms: {
        texture: gl.getUniformLocation(program, 'u_texture'),
        intensity: gl.getUniformLocation(program, 'u_intensity'),
        time: gl.getUniformLocation(program, 'u_time'),
        center: gl.getUniformLocation(program, 'u_center'),
        aspect: gl.getUniformLocation(program, 'u_aspect'),
        radius: gl.getUniformLocation(program, 'u_radius'),
        mirror: gl.getUniformLocation(program, 'u_mirror'),
        srcOffset: gl.getUniformLocation(program, 'u_srcOffset'),
        srcScale: gl.getUniformLocation(program, 'u_srcScale'),
      },
    };
    this.programs.set(id, bundle);
    return bundle;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;

    const gl = this.gl;
    if (gl) {
      for (const bundle of this.programs.values()) gl.deleteProgram(bundle.program);
      if (this.quad) gl.deleteBuffer(this.quad);
      if (this.texture) gl.deleteTexture(this.texture);
      // Ask the driver to release the context immediately rather than waiting on GC;
      // browsers cap the number of live contexts per page.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.programs.clear();
    this.quad = null;
    this.texture = null;
    this.gl = null;

    if (this.onLost)
      this.canvas.removeEventListener('webglcontextlost', this.onLost as EventListener);
    if (this.onRestored) this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.onLost = null;
    this.onRestored = null;
  }
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (import.meta.env.DEV)
      console.error('[filters] compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export interface CoverCrop {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Centre-crop the source so it fills the frame without distortion — the texture
 * equivalent of `object-fit: cover`.
 */
export function coverCrop(sourceAspect: number, frameAspect: number): CoverCrop {
  if (!isFinite(sourceAspect) || sourceAspect <= 0) {
    return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
  }
  if (sourceAspect > frameAspect) {
    const scaleX = frameAspect / sourceAspect;
    return { offsetX: (1 - scaleX) / 2, offsetY: 0, scaleX, scaleY: 1 };
  }
  const scaleY = sourceAspect / frameAspect;
  return { offsetX: 0, offsetY: (1 - scaleY) / 2, scaleX: 1, scaleY };
}

/**
 * `coverCrop` with a zoom multiplier, in the same normalised source space.
 *
 * `zoom < 1` widens the sampled region so the subject sits smaller in the frame.
 * The region can then reach past the source edges — offsets go negative, scales
 * go above 1 — which is deliberate: it is what lets a caller compositing the
 * frame (`ZoomStage`) letterbox the overflow, and it keeps this crop usable as
 * the landmark mapping for attached stickers, which must follow the subject into
 * the padded area rather than clamp at the rim.
 */
export function zoomCrop(sourceAspect: number, frameAspect: number, zoom: number): CoverCrop {
  const base = coverCrop(sourceAspect, frameAspect);
  if (!isFinite(zoom) || zoom <= 0 || zoom === 1) return base;
  const scaleX = base.scaleX / zoom;
  const scaleY = base.scaleY / zoom;
  return { offsetX: (1 - scaleX) / 2, offsetY: (1 - scaleY) / 2, scaleX, scaleY };
}
