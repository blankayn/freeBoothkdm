/**
 * Preferences only. Photos and camera frames never touch storage — the booth is
 * client-side by default and nothing leaves the tab unless the user exports it.
 */
const KEY = 'make-a-moment:settings:v1';

export interface StoredSettings {
  soundEnabled?: boolean;
  hapticsEnabled?: boolean;
  handTracking?: boolean;
  faceTracking?: boolean;
  mirrorFrontCamera?: boolean;
  countdownSeconds?: number;
  cameraZoom?: number;
}

function safeStorage(): Storage | null {
  // Private mode, disabled site data, and sandboxed contexts all throw on access.
  try {
    const s = window.localStorage;
    const probe = '__mam__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadSettings(): StoredSettings {
  const store = safeStorage();
  if (!store) return {};
  try {
    const raw = store.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const p = parsed as Record<string, unknown>;
    const out: StoredSettings = {};
    if (typeof p.soundEnabled === 'boolean') out.soundEnabled = p.soundEnabled;
    if (typeof p.hapticsEnabled === 'boolean') out.hapticsEnabled = p.hapticsEnabled;
    if (typeof p.handTracking === 'boolean') out.handTracking = p.handTracking;
    if (typeof p.faceTracking === 'boolean') out.faceTracking = p.faceTracking;
    if (typeof p.mirrorFrontCamera === 'boolean') out.mirrorFrontCamera = p.mirrorFrontCamera;
    if (typeof p.countdownSeconds === 'number') {
      out.countdownSeconds = Math.min(10, Math.max(0, Math.round(p.countdownSeconds)));
    }
    if (typeof p.cameraZoom === 'number' && isFinite(p.cameraZoom)) {
      out.cameraZoom = Math.min(1, Math.max(0.4, p.cameraZoom));
    }
    return out;
  } catch {
    return {};
  }
}

export function saveSettings(settings: StoredSettings): void {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Quota or a browser that rejects writes — preferences simply do not persist.
  }
}
