import type { HandLandmarker } from '@mediapipe/tasks-vision';
import {
  HAND_INTERVAL_MAX_MS,
  HAND_INTERVAL_MS,
  HAND_MODEL_URL,
  MEDIAPIPE_WASM_PATH,
} from './config';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandData {
  landmarks: Landmark[];
  handedness: 'Left' | 'Right';
  score: number;
}

export interface HandFrame {
  hands: HandData[];
  timestamp: number;
}

export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/**
 * Hand landmark detection, deliberately decoupled from the render loop's cadence.
 *
 * `detect()` is safe to call every frame: it runs inference only when the adaptive
 * interval has elapsed and otherwise hands back the last result. The interval
 * grows on its own when inference turns out to be slow, so a weak phone drops
 * tracking frequency instead of dropping the camera to 12 fps.
 */
export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private status: TrackerStatus = 'idle';
  private loadPromise: Promise<boolean> | null = null;

  private lastRun = 0;
  private lastTimestamp = -1;
  private interval = HAND_INTERVAL_MS;
  private avgCost = 0;
  private latest: HandFrame = { hands: [], timestamp: 0 };
  private paused = false;
  private consecutiveErrors = 0;

  get state(): TrackerStatus {
    return this.status;
  }

  get isReady(): boolean {
    return this.status === 'ready' && !!this.landmarker;
  }

  get currentInterval(): number {
    return this.interval;
  }

  get frame(): HandFrame {
    return this.latest;
  }

  async initialize(): Promise<boolean> {
    if (this.loadPromise) return this.loadPromise;
    if (this.status === 'ready') return true;

    this.status = 'loading';
    this.loadPromise = (async () => {
      try {
        // Imported lazily so the ~4 MB vision bundle is only fetched when the
        // user actually turns tracking on.
        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
        this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        this.status = 'ready';
        return true;
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[hands] unavailable:', err);
        this.status = 'unavailable';
        this.landmarker = null;
        return false;
      } finally {
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  pause(): void {
    this.paused = true;
    this.latest = { hands: [], timestamp: this.latest.timestamp };
  }

  resume(): void {
    this.paused = false;
    this.lastRun = 0;
  }

  /**
   * Returns the freshest hand data. `now` and `videoTime` are passed in so the
   * caller's single clock drives everything.
   */
  detect(video: HTMLVideoElement, now: number): HandFrame {
    if (!this.isReady || this.paused) return this.latest;
    if (now - this.lastRun < this.interval) return this.latest;
    if (video.readyState < 2 || video.videoWidth === 0) return this.latest;

    // MediaPipe rejects non-increasing timestamps outright.
    const timestamp = Math.max(this.lastTimestamp + 1, Math.round(now));
    this.lastRun = now;

    const started = performance.now();
    try {
      const result = this.landmarker!.detectForVideo(video, timestamp);
      this.lastTimestamp = timestamp;
      this.consecutiveErrors = 0;

      const hands: HandData[] = [];
      const sets = result.landmarks ?? [];
      for (let i = 0; i < sets.length; i++) {
        const category = result.handedness?.[i]?.[0];
        hands.push({
          landmarks: sets[i] as Landmark[],
          handedness: category?.categoryName === 'Left' ? 'Left' : 'Right',
          score: category?.score ?? 1,
        });
      }
      this.latest = { hands, timestamp: now };
    } catch (err) {
      this.consecutiveErrors++;
      if (this.consecutiveErrors > 8) {
        if (import.meta.env.DEV) console.warn('[hands] giving up after repeated errors:', err);
        this.status = 'unavailable';
      }
      return this.latest;
    }

    // Exponential moving average of inference cost, then back off if we are
    // eating more than about a third of a 60 fps frame budget.
    const cost = performance.now() - started;
    this.avgCost = this.avgCost === 0 ? cost : this.avgCost * 0.8 + cost * 0.2;
    if (this.avgCost > 12) {
      this.interval = Math.min(HAND_INTERVAL_MAX_MS, this.interval * 1.12);
    } else if (this.avgCost < 6 && this.interval > HAND_INTERVAL_MS) {
      this.interval = Math.max(HAND_INTERVAL_MS, this.interval * 0.94);
    }

    return this.latest;
  }

  destroy(): void {
    try {
      this.landmarker?.close();
    } catch {
      /* already torn down */
    }
    this.landmarker = null;
    this.status = 'idle';
    this.latest = { hands: [], timestamp: 0 };
    this.lastTimestamp = -1;
  }
}

// --- landmark helpers --------------------------------------------------------

export const HAND_LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_TIP: 20,
} as const;

export function dist2d(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Wrist-to-middle-knuckle span, the natural unit for scale-free thresholds. */
export function palmSpan(landmarks: Landmark[]): number {
  return dist2d(landmarks[HAND_LANDMARK.WRIST], landmarks[HAND_LANDMARK.MIDDLE_MCP]) || 0.0001;
}

export function palmCenter(landmarks: Landmark[]): { x: number; y: number } {
  const ids = [
    HAND_LANDMARK.WRIST,
    HAND_LANDMARK.INDEX_MCP,
    HAND_LANDMARK.MIDDLE_MCP,
    HAND_LANDMARK.RING_MCP,
    HAND_LANDMARK.PINKY_MCP,
  ];
  let x = 0;
  let y = 0;
  for (const i of ids) {
    x += landmarks[i].x;
    y += landmarks[i].y;
  }
  return { x: x / ids.length, y: y / ids.length };
}
