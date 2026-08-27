import type { FilterId, RendererKind } from '../../types/filters';

/**
 * The contract the compositor draws through. Both the WebGL engine and the
 * Canvas2D fallback satisfy it, so nothing above this line has to know which one
 * is live.
 */
export interface FrameRenderer {
  readonly kind: RendererKind;
  readonly canvas: HTMLCanvasElement;
  readonly isReady: boolean;

  resize(width: number, height: number): void;
  setFilter(id: FilterId): void;
  setIntensity(value: number): void;
  setCenter(x: number, y: number): void;
  setRadiusScale(scale: number): void;
  setMirror(mirror: boolean): void;
  render(source: CanvasImageSource, timeSeconds: number, sourceWidth: number, sourceHeight: number): boolean;
  destroy(): void;
}
