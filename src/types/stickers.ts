export type StickerCategory =
  | 'cute'
  | 'funny'
  | 'love'
  | 'food'
  | 'stars'
  | 'doodles'
  | 'frames'
  | 'accessories'
  | 'custom';

export interface StickerAsset {
  id: string;
  name: string;
  category: StickerCategory;
  /** Data URI (SVG for the built-in set, PNG/WebP/JPEG for uploads). */
  src: string;
  /** Natural aspect ratio, width / height. */
  aspect: number;
  /**
   * Where this sticker wants to sit when tracking is on. Purely a hint — the user
   * can always detach it and place it by hand.
   */
  suggestedAttachment?: AttachmentTarget;
}

/** What a sticker can be pinned to. */
export type AttachmentTarget = 'none' | 'face' | 'head' | 'hand' | 'finger';

/**
 * A named anchor on a tracked body part. Resolved to real coordinates by the
 * tracker each frame, so the sticker follows the subject instead of the canvas.
 */
export type AttachmentPoint =
  | 'eyes'
  | 'nose'
  | 'mouth'
  | 'forehead'
  | 'left-cheek'
  | 'right-cheek'
  | 'chin'
  | 'palm'
  | 'index-tip'
  | 'thumb-tip';

export interface StickerLayer {
  id: string;
  assetId: string;
  /** Resolved bitmap. Never serialised. */
  image: CanvasImageSource | null;
  src: string;
  /** Normalised frame coordinates, 0..1, measured from the top-left of the frame. */
  x: number;
  y: number;
  /** Size as a fraction of frame width, before aspect correction. */
  scale: number;
  /** Radians. */
  rotation: number;
  zIndex: number;
  opacity: number;
  aspect: number;
  attachment: AttachmentTarget;
  attachmentPoint?: AttachmentPoint;
  /** Which detected hand/face this is pinned to, when several are visible. */
  attachmentIndex?: number;
  /** Set the frame a sticker was added on, so it can bounce in. */
  bornAt: number;
  locked?: boolean;
}

export interface StickerHitResult {
  layer: StickerLayer;
  /** Pointer position in the sticker's own local space, -0.5..0.5. */
  localX: number;
  localY: number;
  handle: StickerHandle;
}

export type StickerHandle = 'body' | 'scale' | 'rotate' | 'delete';
