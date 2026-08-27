import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { StickerHandle, StickerLayer } from '../../types/stickers';
import { geometry, stickerRenderer } from '../../lib/stickers/StickerRenderer';
import { clamp } from '../../lib/utils/math';

interface DragState {
  pointerId: number;
  handle: StickerHandle;
  layerId: string;
  offsetX: number;
  offsetY: number;
  startScale: number;
  startRotation: number;
  startDistance: number;
  startAngle: number;
  moved: boolean;
}

export interface StickerInteractionOptions {
  surfaceRef: RefObject<HTMLElement>;
  layers: StickerLayer[];
  onChange: (next: StickerLayer[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDelete?: (id: string) => void;
  /** Called once per gesture that actually moved something, for haptics. */
  onManipulate?: () => void;
  enabled?: boolean;
}

const MIN_SCALE = 0.04;
const MAX_SCALE = 1.6;

/**
 * Direct manipulation of sticker layers on top of a canvas.
 *
 * Hit testing runs against the same geometry the renderer draws, so what looks
 * grabbable is grabbable — including the rotated bounding boxes, which a plain
 * DOM overlay would get wrong.
 */
export function useStickerInteraction({
  surfaceRef,
  layers,
  onChange,
  selectedId,
  onSelect,
  onDelete,
  onManipulate,
  enabled = true,
}: StickerInteractionOptions) {
  const drag = useRef<DragState | null>(null);
  // Layers change every frame while dragging; a ref keeps handlers current
  // without re-binding listeners.
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const toLocal = useCallback(
    (event: ReactPointerEvent) => {
      const el = surfaceRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        nx: (event.clientX - rect.left) / rect.width,
        ny: (event.clientY - rect.top) / rect.height,
        width: rect.width,
        height: rect.height,
      };
    },
    [surfaceRef],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return;
      const local = toLocal(event);
      if (!local) return;

      const hit = stickerRenderer.hitTest(
        layersRef.current,
        local.nx,
        local.ny,
        local.width,
        local.height,
        selectedId,
        1,
      );

      if (!hit) {
        onSelect(null);
        return;
      }

      event.preventDefault();
      (event.target as Element).setPointerCapture?.(event.pointerId);

      if (hit.handle === 'delete') {
        onDelete?.(hit.layer.id);
        onSelect(null);
        return;
      }

      onSelect(hit.layer.id);

      const box = geometry(hit.layer, local.width, local.height, performance.now());
      const px = local.nx * local.width;
      const py = local.ny * local.height;

      drag.current = {
        pointerId: event.pointerId,
        handle: hit.handle,
        layerId: hit.layer.id,
        offsetX: hit.layer.x - local.nx,
        offsetY: hit.layer.y - local.ny,
        startScale: hit.layer.scale,
        startRotation: hit.layer.rotation,
        startDistance: Math.max(1, Math.hypot(px - box.cx, py - box.cy)),
        startAngle: Math.atan2(py - box.cy, px - box.cx),
        moved: false,
      };
    },
    [enabled, toLocal, selectedId, onSelect, onDelete],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const local = toLocal(event);
      if (!local) return;
      event.preventDefault();

      const current = layersRef.current.find((l) => l.id === state.layerId);
      if (!current) return;

      const px = local.nx * local.width;
      const py = local.ny * local.height;
      const cx = current.x * local.width;
      const cy = current.y * local.height;

      let patch: Partial<StickerLayer> | null = null;

      if (state.handle === 'body') {
        patch = {
          x: clamp(local.nx + state.offsetX, -0.1, 1.1),
          y: clamp(local.ny + state.offsetY, -0.1, 1.1),
          // Dragging by hand detaches from tracking — an explicit choice beats
          // fighting the tracker for control.
          attachment: 'none',
          attachmentPoint: undefined,
        };
      } else if (state.handle === 'scale') {
        const distance = Math.max(1, Math.hypot(px - cx, py - cy));
        patch = {
          scale: clamp((state.startScale * distance) / state.startDistance, MIN_SCALE, MAX_SCALE),
        };
      } else if (state.handle === 'rotate') {
        const angle = Math.atan2(py - cy, px - cx);
        patch = { rotation: state.startRotation + (angle - state.startAngle) };
      }

      if (!patch) return;
      if (!state.moved) {
        state.moved = true;
        onManipulate?.();
      }
      onChange(
        layersRef.current.map((l) => (l.id === state.layerId ? { ...l, ...patch } : l)),
      );
    },
    [toLocal, onChange, onManipulate],
  );

  const endDrag = useCallback((event: ReactPointerEvent) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    drag.current = null;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    isDragging: () => drag.current !== null,
  };
}

/** Nudge/scale/rotate the selected sticker from the keyboard. */
export function applyKeyboardTransform(
  layers: StickerLayer[],
  id: string,
  key: string,
  shift: boolean,
): StickerLayer[] | null {
  const step = shift ? 0.04 : 0.01;
  const patch: Partial<StickerLayer> = {};
  switch (key) {
    case 'ArrowLeft':
      patch.x = -step;
      break;
    case 'ArrowRight':
      patch.x = step;
      break;
    case 'ArrowUp':
      patch.y = -step;
      break;
    case 'ArrowDown':
      patch.y = step;
      break;
    case '+':
    case '=':
      patch.scale = shift ? 0.08 : 0.03;
      break;
    case '-':
    case '_':
      patch.scale = shift ? -0.08 : -0.03;
      break;
    case '[':
      patch.rotation = -0.1;
      break;
    case ']':
      patch.rotation = 0.1;
      break;
    default:
      return null;
  }

  return layers.map((l) => {
    if (l.id !== id) return l;
    return {
      ...l,
      x: clamp(l.x + (patch.x ?? 0), -0.1, 1.1),
      y: clamp(l.y + (patch.y ?? 0), -0.1, 1.1),
      scale: clamp(l.scale + (patch.scale ?? 0), MIN_SCALE, MAX_SCALE),
      rotation: l.rotation + (patch.rotation ?? 0),
      ...(patch.x !== undefined || patch.y !== undefined
        ? { attachment: 'none' as const, attachmentPoint: undefined }
        : {}),
    };
  });
}
