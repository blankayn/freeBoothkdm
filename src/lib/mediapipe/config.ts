/**
 * MediaPipe asset locations.
 *
 * These are model *downloads* — weights and a WASM runtime. Inference runs
 * entirely in the tab: no camera frame is ever uploaded, and nothing here talks
 * to a server after the files are cached. Point these at your own origin to make
 * the booth fully self-hosted and offline-capable.
 */
export const MEDIAPIPE_WASM_PATH =
  import.meta.env.VITE_MEDIAPIPE_WASM ??
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

export const HAND_MODEL_URL =
  import.meta.env.VITE_HAND_MODEL ??
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const FACE_MODEL_URL =
  import.meta.env.VITE_FACE_MODEL ??
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Detection cadence targets, in milliseconds between inferences. */
export const HAND_INTERVAL_MS = 45;
export const HAND_INTERVAL_MAX_MS = 160;
export const FACE_INTERVAL_MS = 70;
export const FACE_INTERVAL_MAX_MS = 220;

/**
 * A rough "is this machine going to cope" check. Face tracking is the expensive
 * one, so it stays off by default on anything that looks low-powered.
 */
export function looksLowPowered(): boolean {
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (cores <= 4 && mobile) return true;
  if (memory <= 2) return true;
  return false;
}
