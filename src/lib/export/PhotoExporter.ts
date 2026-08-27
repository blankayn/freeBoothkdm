import type { StripDocument } from '../../types/photobooth';
import { measureStrip, renderStrip } from './StripRenderer';

export const EXPORT_WIDTH = 1200;

/**
 * A four-frame vertical strip is naturally about 1:5, which at a generous width
 * runs to seven thousand pixels tall — awkward to share and close to the canvas
 * area limits on older iOS devices. Bounding the height keeps every layout on
 * the safe side; at this width a cell still maps roughly 1:1 to the 1080px
 * captures, so nothing is upscaled.
 */
const MAX_EXPORT_HEIGHT = 7000;

export interface ExportInput {
  photos: (HTMLImageElement | null)[];
  document: StripDocument;
  width?: number;
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  filename: string;
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/**
 * Turns the edited strip into a file.
 *
 * Nothing here touches the network. The PNG is produced in the tab, handed to the
 * browser's own download or share sheet, and the object URL is revoked straight
 * after — the image is never uploaded anywhere.
 */
export class PhotoExporter {
  private canvas: HTMLCanvasElement | null = null;

  async render(input: ExportInput): Promise<ExportResult> {
    const requested = input.width ?? EXPORT_WIDTH;
    const probe = measureStrip(input.document.style, requested);
    const width =
      probe.height > MAX_EXPORT_HEIGHT
        ? Math.floor(requested * (MAX_EXPORT_HEIGHT / probe.height))
        : requested;
    const metrics = measureStrip(input.document.style, width);

    if (!this.canvas) this.canvas = document.createElement('canvas');
    const canvas = this.canvas;
    canvas.width = Math.round(metrics.width);
    canvas.height = Math.round(metrics.height);

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas is unavailable in this browser.');

    // Webfonts must be resolved before the first fillText or the export silently
    // falls back to a system face.
    await waitForFonts();

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    renderStrip(
      ctx,
      {
        photos: input.photos,
        style: input.document.style,
        texts: input.document.texts,
        stickers: input.document.stickers,
        date: new Date(input.document.createdAt),
      },
      width,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) throw new Error('That strip could not be encoded.');

    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      filename: buildFilename(input.document.createdAt),
    };
  }

  download(result: ExportResult): void {
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    link.rel = 'noopener';
    document.body.appendChild(link);

    const revoke = () => URL.revokeObjectURL(url);
    // iOS Safari ignores the download attribute and navigates to the blob;
    // revoking too early breaks long-press save, so delay and also listen for
    // pagehide (covers navigation away before the timeout fires).
    const isIOS = /iP(hone|ad|pod)/.test(navigator.userAgent);
    if (isIOS && link.download !== result.filename) {
      // Fallback: open blob in new context so user can long-press save.
      window.open(url, '_blank', 'noopener');
      window.addEventListener('pagehide', revoke, { once: true });
      setTimeout(revoke, 60_000);
      link.remove();
      return;
    }

    link.click();
    link.remove();
    // Some browsers need the URL to stay alive until the download starts.
    // Revoke after a short delay, or immediately on pagehide.
    window.addEventListener('pagehide', revoke, { once: true });
    setTimeout(revoke, 10_000);
  }

  /** Uses the native share sheet when it can actually carry a file. */
  async share(result: ExportResult): Promise<ShareOutcome> {
    const file = new File([result.blob], result.filename, { type: 'image/png' });
    const data: ShareData = {
      files: [file],
      title: 'My photo strip',
      text: 'Made in a browser photobooth.',
    };

    if (typeof navigator.canShare === 'function' && navigator.canShare(data) && navigator.share) {
      try {
        await navigator.share(data);
        return 'shared';
      } catch (err) {
        // A user dismissing the sheet is not an error worth shouting about.
        if ((err as { name?: string })?.name === 'AbortError') return 'cancelled';
        this.download(result);
        return 'downloaded';
      }
    }

    this.download(result);
    return 'downloaded';
  }

  destroy(): void {
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    this.canvas = null;
  }
}

function buildFilename(createdAt: number): string {
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `photostrip-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}.png`;
}

async function waitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    // Never let a font that fails to arrive block the export.
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    /* proceed with fallbacks */
  }
}

export const photoExporter = new PhotoExporter();

/** Decode a captured photo blob into an <img> the strip renderer can draw. */
export function decodePhoto(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That photo could not be decoded.'));
    img.src = url;
  });
}
