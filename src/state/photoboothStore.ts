import { create } from 'zustand';
import type { CameraError, CameraFacing } from '../types/camera';
import type { FilterId } from '../types/filters';
import type { StickerLayer } from '../types/stickers';
import type {
  CapturedPhoto,
  PhotoboothState,
  StripLayoutId,
  StripSizeId,
  StripStyle,
  StripTextItem,
} from '../types/photobooth';
import { SHOT_COUNT } from '../types/photobooth';
import { canTransition } from './machine';
import { FILTER_BY_ID, nextFilter } from '../lib/filters/filterCatalog';
import { DEFAULT_STRIP_STYLE, DEFAULT_STRIP_SIZE } from '../lib/export/stripLayouts';
import { loadSettings, saveSettings } from '../lib/storage/settingsStore';

export interface Toast {
  id: string;
  message: string;
  tone: 'info' | 'warn' | 'error' | 'success';
}

export interface BoothSettings {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  handTracking: boolean;
  faceTracking: boolean;
  /** Mirror the front camera so the preview behaves like a real mirror. */
  mirrorFrontCamera: boolean;
  countdownSeconds: number;
  /** 0.45 = phone-like wide (small face), 1 = tight cover. Matches CAMERA_ZOOM */
  cameraZoom: number;
}

export interface CameraSlice {
  facing: CameraFacing;
  deviceId: string | null;
  error: CameraError | null;
  ready: boolean;
}

export interface PhotoboothStore {
  status: PhotoboothState;
  /** Set when a transition is rejected, so the UI can explain itself. */
  lastRejection: string | null;

  photos: (CapturedPhoto | null)[];
  /** Which slot the next capture fills. */
  activeShot: number;
  /** Non-null while re-shooting one specific frame from the review sheet. */
  retakeTarget: number | null;

  filter: FilterId;
  intensities: Record<FilterId, number>;

  liveStickers: StickerLayer[];
  selectedStickerId: string | null;

  stripStyle: StripStyle;
  stripSize: StripSizeId;
  stripTexts: StripTextItem[];
  stripStickers: StickerLayer[];
  selectedStripItemId: string | null;

  camera: CameraSlice;
  settings: BoothSettings;
  toasts: Toast[];

  /** Live diagnostics, updated from the render loop at ~2 Hz. */
  fps: number;
  trackingActive: boolean;

  transition: (to: PhotoboothState) => boolean;
  reset: (hard?: boolean) => void;

  setFilter: (id: FilterId) => void;
  cycleFilter: (step?: number) => void;
  setIntensity: (value: number, id?: FilterId) => void;

  addPhoto: (photo: Omit<CapturedPhoto, 'index' | 'id'>, slot?: number) => void;
  clearPhoto: (index: number) => void;
  beginRetake: (index: number | 'all') => void;

  setLiveStickers: (next: StickerLayer[]) => void;
  selectSticker: (id: string | null) => void;

  setStripStyle: (patch: Partial<StripStyle>) => void;
  setStripLayout: (id: StripLayoutId) => void;
  setStripSize: (id: StripSizeId) => void;
  setStripTexts: (next: StripTextItem[]) => void;
  setStripStickers: (next: StickerLayer[]) => void;
  selectStripItem: (id: string | null) => void;

  setCamera: (patch: Partial<CameraSlice>) => void;
  updateSettings: (patch: Partial<BoothSettings>) => void;

  pushToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
  setFps: (fps: number) => void;
  setTrackingActive: (active: boolean) => void;
}

const emptyRoll = (): (CapturedPhoto | null)[] => new Array(SHOT_COUNT).fill(null);

const defaultIntensities = (): Record<FilterId, number> => {
  const out = {} as Record<FilterId, number>;
  for (const id of Object.keys(FILTER_BY_ID) as FilterId[]) {
    out[id] = FILTER_BY_ID[id].defaultIntensity;
  }
  return out;
};

let uid = 0;
const nextId = (prefix: string) => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    // fall through
  }
  return prefix + '_' + Date.now().toString(36) + '_' + (uid++).toString(36);
};

export const DEFAULT_SETTINGS: BoothSettings = {
  soundEnabled: true,
  hapticsEnabled: true,
  handTracking: false,
  faceTracking: false,
  mirrorFrontCamera: true,
  countdownSeconds: 3,
  cameraZoom: 0.5,
};

export const usePhotobooth = create<PhotoboothStore>((set, get) => ({
  status: 'IDLE',
  lastRejection: null,

  photos: emptyRoll(),
  activeShot: 0,
  retakeTarget: null,

  filter: 'original',
  intensities: defaultIntensities(),

  liveStickers: [],
  selectedStickerId: null,

  stripStyle: { ...DEFAULT_STRIP_STYLE },
  stripSize: DEFAULT_STRIP_SIZE,
  stripTexts: [],
  stripStickers: [],
  selectedStripItemId: null,

  camera: { facing: 'user', deviceId: null, error: null, ready: false },
  settings: { ...DEFAULT_SETTINGS, ...loadSettings() },
  toasts: [],

  fps: 0,
  trackingActive: false,

  transition: (to) => {
    const { status, photos } = get();
    const filledCount = photos.filter(Boolean).length;
    const result = canTransition(status, to, { photoCount: photos.length, filledCount });
    if (!result.allowed) {
      if (import.meta.env.DEV) console.warn('[booth] blocked transition:', result.reason);
      set({ lastRejection: result.reason ?? null });
      return false;
    }
    set({ status: to, lastRejection: null });
    return true;
  },

  reset: (hard = false) => {
    const { photos } = get();
    for (const p of photos) if (p) URL.revokeObjectURL(p.url);
    set({
      status: 'IDLE',
      photos: emptyRoll(),
      activeShot: 0,
      retakeTarget: null,
      selectedStickerId: null,
      selectedStripItemId: null,
      stripTexts: [],
      stripStickers: [],
      lastRejection: null,
      ...(hard
        ? {
            liveStickers: [],
            filter: 'original' as FilterId,
            intensities: defaultIntensities(),
            stripStyle: { ...DEFAULT_STRIP_STYLE },
            stripSize: DEFAULT_STRIP_SIZE,
          }
        : {}),
    });
  },

  setFilter: (id) => set({ filter: id }),

  cycleFilter: (step = 1) => set((s) => ({ filter: nextFilter(s.filter, step) })),

  setIntensity: (value, id) =>
    set((s) => {
      const target = id ?? s.filter;
      const clamped = Math.min(1, Math.max(0, value));
      if (s.intensities[target] === clamped) return s;
      return { intensities: { ...s.intensities, [target]: clamped } };
    }),

  addPhoto: (photo, slot) =>
    set((s) => {
      const index = slot ?? s.retakeTarget ?? s.activeShot;
      const photos = s.photos.slice();
      const previous = photos[index];
      if (previous) URL.revokeObjectURL(previous.url);
      photos[index] = { ...photo, index, id: nextId('shot') };

      // After a targeted retake, hand control back to the first gap in the roll
      // rather than blindly advancing.
      const firstEmpty = photos.findIndex((p) => p === null);
      return {
        photos,
        retakeTarget: null,
        activeShot: firstEmpty === -1 ? Math.min(index + 1, SHOT_COUNT - 1) : firstEmpty,
      };
    }),

  clearPhoto: (index) =>
    set((s) => {
      const photos = s.photos.slice();
      const previous = photos[index];
      if (previous) URL.revokeObjectURL(previous.url);
      photos[index] = null;
      return { photos, activeShot: index };
    }),

  beginRetake: (index) => {
    if (index === 'all') {
      const { photos } = get();
      for (const p of photos) if (p) URL.revokeObjectURL(p.url);
      set({ photos: emptyRoll(), activeShot: 0, retakeTarget: null });
      return;
    }
    set((s) => {
      const photos = s.photos.slice();
      const previous = photos[index];
      if (previous) URL.revokeObjectURL(previous.url);
      photos[index] = null;
      return { photos, retakeTarget: index, activeShot: index };
    });
  },

  setLiveStickers: (next) => set({ liveStickers: next }),
  selectSticker: (id) => set({ selectedStickerId: id }),

  setStripStyle: (patch) => set((s) => ({ stripStyle: { ...s.stripStyle, ...patch } })),

  setStripLayout: (id) =>
    set((s) => ({
      stripStyle: {
        ...s.stripStyle,
        layout: id,
        gutter: id === 'minimal' ? 0.018 : id === 'polaroid' ? 0.05 : 0.045,
        photoRadius: id === 'polaroid' ? 0.008 : s.stripStyle.photoRadius,
        showLogo: id === 'minimal' ? false : s.stripStyle.showLogo,
      },
    })),

  setStripSize: (id) => set({ stripSize: id }),

  setStripTexts: (next) => set({ stripTexts: next }),
  setStripStickers: (next) => set({ stripStickers: next }),
  selectStripItem: (id) => set({ selectedStripItemId: id }),

  setCamera: (patch) => set((s) => ({ camera: { ...s.camera, ...patch } })),

  updateSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch };
      saveSettings(settings);
      return { settings };
    }),

  pushToast: (message, tone = 'info') =>
    set((s) => {
      // A failing tracker can fire the same message every frame — never stack it.
      if (s.toasts.some((t) => t.message === message)) return s;
      return { toasts: [...s.toasts, { id: nextId('toast'), message, tone }].slice(-3) };
    }),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setFps: (fps) => set({ fps }),
  setTrackingActive: (trackingActive) => set({ trackingActive }),
}));

/** Selectors — keep components from subscribing to the entire store. */
export const selectFilledCount = (s: PhotoboothStore) => s.photos.filter(Boolean).length;
export const selectRollComplete = (s: PhotoboothStore) => s.photos.every(Boolean);
export const makeId = nextId;
