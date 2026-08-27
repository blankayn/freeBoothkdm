import { useEffect, useRef, useState } from 'react';
import type { CapturedPhoto } from '../../types/photobooth';
import { decodePhoto } from '../../lib/export/PhotoExporter';

/**
 * Decodes captured blobs into <img> elements the strip renderer can draw.
 * Results are cached by object URL so flipping between layouts never re-decodes.
 */
export function useDecodedPhotos(photos: (CapturedPhoto | null)[]) {
  const cache = useRef(new Map<string, HTMLImageElement>());
  const [images, setImages] = useState<(HTMLImageElement | null)[]>(() => photos.map(() => null));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    const load = async () => {
      const next = await Promise.all(
        photos.map(async (photo) => {
          if (!photo) return null;
          const cached = cache.current.get(photo.url);
          if (cached) return cached;
          try {
            const img = await decodePhoto(photo.url);
            cache.current.set(photo.url, img);
            return img;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setImages(next);
      setReady(true);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [photos]);

  // Drop cache entries whose photos are gone, so retakes do not leak memory.
  useEffect(() => {
    const live = new Set(photos.filter(Boolean).map((p) => p!.url));
    for (const key of cache.current.keys()) {
      if (!live.has(key)) cache.current.delete(key);
    }
  }, [photos]);

  return { images, ready };
}
