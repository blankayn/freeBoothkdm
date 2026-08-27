import type { StickerAsset, StickerLayer, AttachmentTarget } from '../../types/stickers';
import { BUILT_IN_STICKERS } from './stickerLibrary';
import type { ResizeRequest, ResizeResponse } from '../../workers/imageResize.worker';

const CUSTOM_KEY = 'make-a-moment:custom-stickers:v1';
const MAX_CUSTOM = 12;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_DIMENSION = 512;

const ACCEPTED = new Set(['image/png', 'image/webp', 'image/jpeg', 'image/jpg']);

export interface UploadResult {
  ok: boolean;
  asset?: StickerAsset;
  error?: string;
}

let seq = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/**
 * Owns sticker assets and their decoded bitmaps. Uploads never leave the device:
 * they are resized in a worker, kept as data URIs, and stored in localStorage on
 * this browser only.
 */
export class StickerManager {
  private images = new Map<string, HTMLImageElement>();
  private pending = new Map<string, Promise<HTMLImageElement>>();
  private custom: StickerAsset[] = [];
  private worker: Worker | null = null;
  private workerJobs = new Map<string, (r: ResizeResponse) => void>();

  constructor() {
    this.custom = this.readCustom();
  }

  get customStickers(): StickerAsset[] {
    return this.custom;
  }

  get allAssets(): StickerAsset[] {
    return [...BUILT_IN_STICKERS, ...this.custom];
  }

  findAsset(id: string): StickerAsset | undefined {
    return this.allAssets.find((a) => a.id === id);
  }

  /** Decoded image, cached. Safe to call every frame. */
  getImage(src: string): HTMLImageElement | null {
    return this.images.get(src) ?? null;
  }

  load(src: string): Promise<HTMLImageElement> {
    const cached = this.images.get(src);
    if (cached) return Promise.resolve(cached);
    const inflight = this.pending.get(src);
    if (inflight) return inflight;

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      // Data URIs are same-origin, but this keeps the canvas untainted if a
      // future asset ever comes from elsewhere.
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        this.images.set(src, img);
        this.pending.delete(src);
        resolve(img);
      };
      img.onerror = () => {
        this.pending.delete(src);
        reject(new Error('sticker failed to decode'));
      };
      img.src = src;
    });
    this.pending.set(src, promise);
    return promise;
  }

  /** Warm the whole built-in set so the panel never shows empty tiles. */
  async preload(assets: StickerAsset[] = BUILT_IN_STICKERS): Promise<void> {
    await Promise.all(assets.map((a) => this.load(a.src).catch(() => null)));
  }

  createLayer(
    asset: StickerAsset,
    options: {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      zIndex?: number;
      attachment?: AttachmentTarget;
    } = {},
  ): StickerLayer {
    const attachment = options.attachment ?? 'none';
    return {
      id: uid('sticker'),
      assetId: asset.id,
      image: this.images.get(asset.src) ?? null,
      src: asset.src,
      x: options.x ?? 0.5,
      y: options.y ?? 0.42,
      scale: options.scale ?? defaultScaleFor(asset),
      rotation: options.rotation ?? 0,
      zIndex: options.zIndex ?? 0,
      opacity: 1,
      aspect: asset.aspect,
      attachment,
      attachmentPoint: attachment === 'none' ? undefined : anchorFor(attachment, asset),
      bornAt: performance.now(),
    };
  }

  /** Re-attach decoded bitmaps to layers that were created before load finished. */
  hydrate(layers: StickerLayer[]): StickerLayer[] {
    let changed = false;
    const next = layers.map((l) => {
      if (l.image) return l;
      const img = this.images.get(l.src);
      if (!img) return l;
      changed = true;
      return { ...l, image: img };
    });
    return changed ? next : layers;
  }

  // --- custom uploads ------------------------------------------------------

  async upload(file: File): Promise<UploadResult> {
    if (!ACCEPTED.has(file.type)) {
      return { ok: false, error: 'Use a PNG, WebP, or JPG. Transparent PNG works best.' };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: 'That file is over 12 MB. Try a smaller one.' };
    }
    if (this.custom.length >= MAX_CUSTOM) {
      return { ok: false, error: `You can keep ${MAX_CUSTOM} custom stickers. Delete one first.` };
    }

    // JPEG has no alpha, so re-encoding it as PNG only inflates the payload.
    const mimeType: 'image/png' | 'image/webp' = file.type === 'image/jpeg' ? 'image/webp' : 'image/png';

    let resized: { blob: Blob; width: number; height: number };
    try {
      resized = await this.resize(file, mimeType);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not read that image.' };
    }

    const dataUri = await blobToDataUri(resized.blob);
    const asset: StickerAsset = {
      id: uid('custom'),
      name: trimName(file.name),
      category: 'custom',
      src: dataUri,
      aspect: resized.width / resized.height,
    };

    try {
      await this.load(asset.src);
    } catch {
      return { ok: false, error: 'That image could not be decoded.' };
    }

    this.custom = [...this.custom, asset];
    this.writeCustom();
    return { ok: true, asset };
  }

  removeCustom(id: string): void {
    const target = this.custom.find((c) => c.id === id);
    if (target) this.images.delete(target.src);
    this.custom = this.custom.filter((c) => c.id !== id);
    this.writeCustom();
  }

  private resize(file: File, mimeType: 'image/png' | 'image/webp'): Promise<{ blob: Blob; width: number; height: number }> {
    const worker = this.ensureWorker();
    if (!worker) return this.resizeOnMainThread(file, mimeType);

    return new Promise((resolve, reject) => {
      const id = uid('job');
      const timeout = window.setTimeout(() => {
        this.workerJobs.delete(id);
        // A wedged worker should not lose the user's sticker.
        this.resizeOnMainThread(file, mimeType).then(resolve, reject);
      }, 8000);

      this.workerJobs.set(id, (response) => {
        window.clearTimeout(timeout);
        if (response.ok && response.blob && response.width && response.height) {
          resolve({ blob: response.blob, width: response.width, height: response.height });
        } else {
          this.resizeOnMainThread(file, mimeType).then(resolve, reject);
        }
      });

      const request: ResizeRequest = {
        id,
        blob: file,
        maxDimension: MAX_DIMENSION,
        mimeType,
        quality: 0.92,
      };
      worker.postMessage(request);
    });
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
    try {
      this.worker = new Worker(new URL('../../workers/imageResize.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (event: MessageEvent<ResizeResponse>) => {
        const handler = this.workerJobs.get(event.data.id);
        if (handler) {
          this.workerJobs.delete(event.data.id);
          handler(event.data);
        }
      };
      this.worker.onerror = () => {
        // Fall back permanently; the main-thread path still works.
        this.worker?.terminate();
        this.worker = null;
      };
      return this.worker;
    } catch {
      return null;
    }
  }

  private async resizeOnMainThread(
    file: File,
    mimeType: string,
  ): Promise<{ blob: Blob; width: number; height: number }> {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not read that image.'));
        image.src = url;
      });
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable.');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mimeType, 0.92),
      );
      if (!blob) throw new Error('Could not encode that image.');
      return { blob, width, height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private readCustom(): StickerAsset[] {
    try {
      const raw = window.localStorage.getItem(CUSTOM_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (a): a is StickerAsset =>
            !!a &&
            typeof a.id === 'string' &&
            typeof a.src === 'string' &&
            a.src.startsWith('data:image/'),
        )
        .slice(0, MAX_CUSTOM)
        .map((a) => ({ ...a, category: 'custom' as const, aspect: a.aspect || 1 }));
    } catch {
      return [];
    }
  }

  private writeCustom(): void {
    try {
      window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(this.custom));
    } catch {
      // Over quota: the stickers still work for this session, they just will not
      // be here next time. Drop the oldest so the next save has a chance.
      this.custom = this.custom.slice(-4);
      try {
        window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(this.custom));
      } catch {
        /* give up quietly */
      }
    }
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.workerJobs.clear();
    this.images.clear();
    this.pending.clear();
  }
}

function defaultScaleFor(asset: StickerAsset): number {
  // Wide art (banners, glasses) should land noticeably larger than a small icon.
  return asset.aspect > 1.6 ? 0.44 : 0.26;
}

function anchorFor(target: AttachmentTarget, asset: StickerAsset) {
  switch (target) {
    case 'face':
      return asset.id === 'lips' ? ('mouth' as const) : ('eyes' as const);
    case 'head':
      return 'forehead' as const;
    case 'hand':
      return 'palm' as const;
    case 'finger':
      return 'index-tip' as const;
    default:
      return undefined;
  }
}

function trimName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '');
  return base.length > 18 ? `${base.slice(0, 17)}…` : base || 'Sticker';
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not encode that image.'));
    reader.readAsDataURL(blob);
  });
}

/** One manager for the whole app — the image cache is worth sharing. */
export const stickerManager = new StickerManager();
