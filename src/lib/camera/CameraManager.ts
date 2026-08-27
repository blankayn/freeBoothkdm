import type {
  CameraDeviceInfo,
  CameraError,
  CameraErrorKind,
  CameraFacing,
  CameraStartOptions,
} from '../../types/camera';

/**
 * Owns the MediaStream and the hidden <video> that decodes it. Nothing else in
 * the app is allowed to call getUserMedia, so there is exactly one place that
 * can leak a camera track.
 */
export class CameraManager {
  readonly video: HTMLVideoElement;

  private stream: MediaStream | null = null;
  private facing: CameraFacing = 'user';
  private deviceId: string | null = null;
  private starting: Promise<void> | null = null;
  private devices: CameraDeviceInfo[] = [];
  private deviceChangeBound: (() => void) | null = null;

  constructor() {
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    // Kept out of the layout entirely; the visible pixels come from the canvas.
    video.style.position = 'fixed';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.left = '-10px';
    video.style.top = '-10px';
    this.video = video;
  }

  get isActive(): boolean {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === 'live');
  }

  get currentFacing(): CameraFacing {
    return this.facing;
  }

  /** The device the browser actually gave us, which may not be the one we asked for. */
  get currentDeviceId(): string | null {
    return this.deviceId;
  }

  get frameWidth(): number {
    return this.video.videoWidth;
  }

  get frameHeight(): number {
    return this.video.videoHeight;
  }

  /** Front cameras should behave like a mirror; rear cameras must not be flipped. */
  get shouldMirror(): boolean {
    return this.facing === 'user';
  }

  get availableDevices(): CameraDeviceInfo[] {
    return this.devices;
  }

  static isSupported(): boolean {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  static isSecure(): boolean {
    return window.isSecureContext || location.hostname === 'localhost';
  }

  async start(options: CameraStartOptions): Promise<void> {
    // Concurrent starts (fast double-tap on the switch button) would race two
    // getUserMedia calls and can wedge the device on some Android builds.
    if (this.starting) await this.starting.catch(() => undefined);

    this.starting = this.startInternal(options);
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async startInternal(options: CameraStartOptions): Promise<void> {
    if (!CameraManager.isSecure()) {
      throw this.error('insecure-context', 'Camera access needs HTTPS (or localhost).');
    }
    if (!CameraManager.isSupported()) {
      throw this.error('unsupported', 'This browser does not expose a camera API.');
    }

    this.stopTracks();

    const wanted = options.deviceId
      ? { deviceId: { exact: options.deviceId } }
      : { facingMode: { ideal: options.facing } };

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        ...wanted,
        width: { ideal: options.width ?? 1280 },
        height: { ideal: options.height ?? 1600 },
        frameRate: { ideal: 30, max: 60 },
      },
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // An exact deviceId that has since disappeared, or a device that cannot do
      // the requested size — retry once with the loosest possible ask.
      if (isOverconstrained(err) || options.deviceId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: options.facing } },
          });
        } catch (retryErr) {
          throw this.mapError(retryErr);
        }
      } else {
        throw this.mapError(err);
      }
    }

    this.stream = stream;
    this.facing = resolveFacing(stream, options.facing);
    this.deviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
    this.video.srcObject = stream;

    await this.waitForFrames();
    await this.refreshDevices();
    this.bindDeviceChange();
  }

  /**
   * `loadedmetadata` fires before videoWidth is reliable on some Safari builds,
   * so wait for real dimensions with a bounded retry rather than trusting it.
   */
  private async waitForFrames(): Promise<void> {
    try {
      await this.video.play();
    } catch {
      // Autoplay can reject if the element is not yet in the document. The
      // dimension poll below still resolves once frames start flowing.
    }

    const deadline = performance.now() + 8000;
    while (performance.now() < deadline) {
      if (this.video.videoWidth > 0 && this.video.videoHeight > 0 && this.video.readyState >= 2) {
        return;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    throw this.error('unknown', 'The camera opened but never delivered a frame.');
  }

  async refreshDevices(): Promise<CameraDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      this.devices = all
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
          facing: guessFacing(d.label),
        }));
    } catch {
      this.devices = [];
    }
    return this.devices;
  }

  private bindDeviceChange(): void {
    if (this.deviceChangeBound || !navigator.mediaDevices?.addEventListener) return;
    this.deviceChangeBound = () => {
      void this.refreshDevices();
    };
    navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeBound);
  }

  /** True when there is more than one camera, or the platform is likely mobile. */
  canSwitch(): boolean {
    if (this.devices.length > 1) return true;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  async switchCamera(): Promise<CameraFacing> {
    const target: CameraFacing = this.facing === 'user' ? 'environment' : 'user';

    // Prefer an explicit device when we can identify one; facingMode alone is
    // unreliable on desktops with several USB cameras.
    const match = this.devices.find((d) => d.facing === target);
    await this.start({ facing: target, deviceId: match?.deviceId });
    return this.facing;
  }

  stop(): void {
    this.stopTracks();
    this.video.srcObject = null;
  }

  private stopTracks(): void {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
  }

  destroy(): void {
    this.stop();
    if (this.deviceChangeBound && navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeBound);
      this.deviceChangeBound = null;
    }
    this.video.remove();
  }

  private error(kind: CameraErrorKind, message: string, cause?: unknown): CameraError {
    return { kind, message, cause };
  }

  private mapError(err: unknown): CameraError {
    const name = (err as { name?: string })?.name ?? '';
    switch (name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return this.error(
          'denied',
          'Camera access was blocked. Allow it in your browser settings, then try again.',
          err,
        );
      case 'NotFoundError':
      case 'OverconstrainedError':
        return this.error('not-found', 'No camera was found on this device.', err);
      case 'NotReadableError':
      case 'AbortError':
        return this.error(
          'in-use',
          'The camera is busy. Close other apps or tabs using it and try again.',
          err,
        );
      default:
        return this.error('unknown', 'The camera could not be started.', err);
    }
  }
}

function isOverconstrained(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === 'OverconstrainedError' || name === 'NotFoundError';
}

function resolveFacing(stream: MediaStream, requested: CameraFacing): CameraFacing {
  const settings = stream.getVideoTracks()[0]?.getSettings() as
    | (MediaTrackSettings & { facingMode?: string })
    | undefined;
  const reported = settings?.facingMode;
  if (reported === 'user' || reported === 'environment') return reported;
  // Desktop webcams usually report nothing at all; they are front-facing in spirit.
  return requested;
}

function guessFacing(label: string): CameraFacing | 'unknown' {
  const l = label.toLowerCase();
  if (/back|rear|environment|world/.test(l)) return 'environment';
  if (/front|face|user|facetime|integrated|built-?in/.test(l)) return 'user';
  return 'unknown';
}

export function isCameraError(value: unknown): value is CameraError {
  return !!value && typeof value === 'object' && 'kind' in value && 'message' in value;
}
