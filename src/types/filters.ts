export type FilterId =
  | 'original'
  | 'spherize'
  | 'bulge'
  | 'pinch'
  | 'wave'
  | 'mirror'
  | 'rgbshift'
  | 'fisheye'
  | 'pixel'
  | 'handwarp';

export interface FilterDefinition {
  id: FilterId;
  label: string;
  /** One-line description shown under the carousel. */
  blurb: string;
  /** Default intensity, 0..1. */
  defaultIntensity: number;
  /** Whether the intensity slider is meaningful for this filter. */
  adjustable: boolean;
  /** Needs a live hand position to be interesting. */
  usesHand?: boolean;
  /** Animates on its own, so the render loop must keep drawing even when idle. */
  animated?: boolean;
  /** Approximate cost, used to decide what to drop on weak hardware. */
  cost: 'low' | 'medium';
  /** Swatch colours for the carousel chip. */
  swatch: [string, string];
}

/** Everything a fragment shader can read. Kept flat and reused frame to frame. */
export interface FilterUniformState {
  intensity: number;
  time: number;
  /** Normalised 0..1 point of interest — hand position, pointer, or the frame centre. */
  centerX: number;
  centerY: number;
  /** Frame aspect (width / height), so radial effects stay circular. */
  aspect: number;
  /** 1 when the source should be flipped horizontally (front camera). */
  mirror: number;
}

export type RendererKind = 'webgl' | 'canvas2d';
