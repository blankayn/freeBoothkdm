import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark, TrackerStatus } from './HandTracker';
import {
  FACE_INTERVAL_MAX_MS,
  FACE_INTERVAL_MS,
  FACE_MODEL_URL,
  MEDIAPIPE_WASM_PATH,
} from './config';

export interface FaceData {
  landmarks: Landmark[];
}

export interface FaceFrame {
  faces: FaceData[];
  timestamp: number;
}

/**
 * Face landmarks, used only to pin stickers to a head. It is the most expensive
 * thing in the booth, so it is opt-in, throttled harder than hands, and gives up
 * on itself if inference gets slow enough to hurt the preview.
 */
export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private status: TrackerStatus = 'idle';
  private loadPromise: Promise<boolean> | null = null;

  private lastRun = 0;
  private lastTimestamp = -1;
  private interval = FACE_INTERVAL_MS;
  private avgCost = 0;
  private latest: FaceFrame = { faces: [], timestamp: 0 };
  private paused = false;
  private consecutiveErrors = 0;
  private degraded = false;

  get state(): TrackerStatus {
    return this.status;
  }

  get isReady(): boolean {
    return this.status === 'ready' && !!this.landmarker;
  }

  /** True when the tracker throttled itself all the way back to stay smooth. */
  get isDegraded(): boolean {
    return this.degraded;
  }

  get frame(): FaceFrame {
    return this.latest;
  }

  async initialize(): Promise<boolean> {
    if (this.loadPromise) return this.loadPromise;
    if (this.status === 'ready') return true;

    this.status = 'loading';
    this.loadPromise = (async () => {
      try {
        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
        this.landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          // Blendshapes and matrices are pure cost for what we need here.
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        this.status = 'ready';
        return true;
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[face] unavailable:', err);
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
  }

  resume(): void {
    this.paused = false;
    this.lastRun = 0;
  }

  detect(video: HTMLVideoElement, now: number): FaceFrame {
    if (!this.isReady || this.paused) return this.latest;
    if (now - this.lastRun < this.interval) return this.latest;
    if (video.readyState < 2 || video.videoWidth === 0) return this.latest;

    const timestamp = Math.max(this.lastTimestamp + 1, Math.round(now));
    this.lastRun = now;

    const started = performance.now();
    try {
      const result = this.landmarker!.detectForVideo(video, timestamp);
      this.lastTimestamp = timestamp;
      this.consecutiveErrors = 0;
      this.latest = {
        faces: (result.faceLandmarks ?? []).map((landmarks) => ({
          landmarks: landmarks as Landmark[],
        })),
        timestamp: now,
      };
    } catch (err) {
      this.consecutiveErrors++;
      if (this.consecutiveErrors > 6) {
        if (import.meta.env.DEV) console.warn('[face] giving up:', err);
        this.status = 'unavailable';
      }
      return this.latest;
    }

    const cost = performance.now() - started;
    this.avgCost = this.avgCost === 0 ? cost : this.avgCost * 0.8 + cost * 0.2;
    if (this.avgCost > 16) {
      this.interval = Math.min(FACE_INTERVAL_MAX_MS, this.interval * 1.15);
    } else if (this.avgCost < 8 && this.interval > FACE_INTERVAL_MS) {
      this.interval = Math.max(FACE_INTERVAL_MS, this.interval * 0.94);
    }
    this.degraded = this.interval >= FACE_INTERVAL_MAX_MS * 0.95;

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
    this.latest = { faces: [], timestamp: 0 };
    this.lastTimestamp = -1;
  }
}

/**
 * Indices into MediaPipe's 468-point face mesh. Only the handful the booth
 * actually anchors to are named.
 */
export const FACE_LANDMARK = {
  RIGHT_EYE_OUTER: 33,
  LEFT_EYE_OUTER: 263,
  RIGHT_EYE_INNER: 133,
  LEFT_EYE_INNER: 362,
  NOSE_TIP: 1,
  FOREHEAD: 10,
  CHIN: 152,
  MOUTH_CENTER: 13,
  RIGHT_CHEEK: 234,
  LEFT_CHEEK: 454,
} as const;
