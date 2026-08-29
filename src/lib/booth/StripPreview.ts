import type { StripStyle } from '../../types/photobooth';

/**
 * Geometry for the WYSIWYG strip-layout camera preview.
 *
 * The cam display stops being "one big video" and becomes the strip itself:
 * the live feed fills whichever cell is next, earlier cells hold their frozen
 * shot, and everything is measured with the same `measureStrip` the exporter
 * uses — so what you shoot is what prints.
 */

export interface StripPreviewCell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Index into the roll (0..shotCount-1). */
  slot: number;
  /** Live camera feeds this cell right now; earlier cells hold frozen shots. */
  isLive: boolean;
}

export interface StripPreviewLayout {
  cells: StripPreviewCell[];
  /** Total strip bounds at the working scale. */
  width: number;
  height: number;
  footer: number;
  pad: number;
}

export interface StripPreviewInput {
  /** The renderer's working resolution, e.g. 720×900 from BoothEngine. */
  canvasWidth: number;
  canvasHeight: number;
  style: StripStyle;
  /** Cells are drawn from a local measureStrip-equivalent; style drives it. */
  slots: number;
  filledCount: number;
  /** Zoom-fit the strip into the canvas while preserving aspect. */
  padding: number;
}

import { measureStrip } from '../export/StripRenderer';
/**
 * Fit the strip (its natural aspect from `measureStrip`) into the preview box
 * with a margin, then hand back absolute cell rects. Live cell = the next
 * unfilled slot; on a complete roll nothing is live (pure review mode).
 */
export function layoutStripPreview(input: StripPreviewInput): StripPreviewLayout {
  const { canvasWidth, canvasHeight, style, slots, filledCount, padding } = input;

  // Measure at an arbitrary width, then scale — measureStrip is resolution
  // independent, so a two-pass measure/scale keeps every style knob exact.
  const unit = measureStrip(style, 1000);
  const scale = Math.min(
    (canvasWidth * (1 - padding * 2)) / unit.width,
    (canvasHeight * (1 - padding * 2)) / unit.height,
  );
  const width = unit.width * scale;
  const height = unit.height * scale;

  const cells: StripPreviewCell[] = [];
  for (let i = 0; i < slots; i++) {
    const col = i % unit.cols;
    const row = Math.floor(i / unit.cols);
    cells.push({
      x: (unit.pad + col * (unit.cellW + unit.pad) + unit.inset) * scale,
      y: (unit.pad + row * (unit.cardH + unit.pad) + unit.inset) * scale,
      w: unit.photoW * scale,
      h: unit.photoH * scale,
      slot: i,
      isLive: i === filledCount,
    });
  }

  return { cells, width, height, footer: unit.footer * scale, pad: unit.pad * scale };
}

/**
 * Where the live cell's rect sits inside the preview canvas, translated so the
 * strip is centred. The engine draws the camera cover-cropped into exactly
 * this rect — no CSS, no letterboxing surprises.
 */
export function stripPreviewOrigin(
  layout: StripPreviewLayout,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  return {
    x: (canvasWidth - layout.width) / 2,
    y: (canvasHeight - layout.height) / 2,
  };
}
