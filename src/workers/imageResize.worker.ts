/// <reference lib="webworker" />

/**
 * Downscales uploaded stickers off the main thread. A 12MP phone photo dropped
 * into the booth would otherwise decode and resample on the UI thread and stall
 * the render loop for hundreds of milliseconds mid-session.
 */

export interface ResizeRequest {
  id: string;
  blob: Blob;
  maxDimension: number;
  /** PNG keeps transparency; the caller decides. */
  mimeType: 'image/png' | 'image/webp';
  quality: number;
}

export interface ResizeResponse {
  id: string;
  ok: boolean;
  blob?: Blob;
  width?: number;
  height?: number;
  error?: string;
}

self.onmessage = async (event: MessageEvent<ResizeRequest>) => {
  const { id, blob, maxDimension, mimeType, quality } = event.data;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('no 2d context in worker');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const out = await canvas.convertToBlob({ type: mimeType, quality });
    const response: ResizeResponse = { id, ok: true, blob: out, width, height };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: ResizeResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : 'resize failed',
    };
    (self as unknown as Worker).postMessage(response);
  }
};
