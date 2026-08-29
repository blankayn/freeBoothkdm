import type { FilterId } from './filters';
import type { StickerLayer } from './stickers';

export type PhotoboothState =
  | 'IDLE'
  /** Picking the strip template before a single shot is taken. */
  | 'CHOOSING_STRIP'
  | 'CAMERA_PERMISSION'
  | 'READY'
  | 'COUNTDOWN'
  | 'CAPTURED'
  | 'REVIEW'
  | 'EDITING'
  | 'EXPORTING'
  | 'COMPLETE';

export const SHOT_COUNT = 4;

/** Every captured frame is a 4:5 portrait at this resolution. */
export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1350;
export const FRAME_ASPECT = FRAME_WIDTH / FRAME_HEIGHT;

/**
 * How much of the frame the camera image fills. 1 is `object-fit: cover` — the
 * old behaviour, subject cropped tight. Below 1 pulls the subject back: 0.75 sits
 * the camera image at 75% of the frame height — natural phone distance, head +
 * shoulders, 25% blurred bars top/bottom. 0.42 was phone-wide but left 58%
 * blurred, making the inset look tiny (your screenshot).
 *
 * There is no zooming *out* past the sensor. A webcam is landscape and this
 * frame is 4:5, so the vertical field of view is already fully spent at 1x;
 * anything under 1 buys distance by leaving a gap above and below, which
 * `ZoomStage` fills with a blurred blow-up. That gap is `1 - CAMERA_ZOOM`.
 */
export const CAMERA_ZOOM = 0.75;

export interface CapturedPhoto {
  id: string;
  index: number;
  /** Object URL for display. Revoked when the photo is replaced or discarded. */
  url: string;
  blob: Blob;
  width: number;
  height: number;
  filter: FilterId;
  takenAt: number;
}

export type StripLayoutId = 'classic' | 'grid' | 'polaroid' | 'minimal' | 'duo';

export type StripSizeId = 'sm' | 'md' | 'lg' | 'xl';

export interface StripSize {
  id: StripSizeId;
  label: string;
  blurb: string;
  width: number;
  /** e.g. "800×3200" - shown in UI */
  hint: string;
}

export type ThemeId =
  'midnight' | 'paper' | 'blush' | 'butter' | 'mint' | 'sky' | 'violet' | 'lime' | 'custom';

export interface StripTheme {
  id: ThemeId;
  label: string;
  background: string;
  backgroundAlt: string | null;
  accent: string;
  frameColor: string;
}

export interface StripLayout {
  id: StripLayoutId;
  label: string;
  blurb: string;
  columns: number;
  rows: number;
  /** Aspect each photo is cropped to inside this layout, width / height. */
  cellAspect: number;
  /** Extra room under the last photo, as a multiple of the gutter. */
  footerScale: number;
  /** Polaroid-style asymmetric padding under each cell. */
  perCellFooter?: number;
  /** Duo layouts: each cell holds two faces side by side. */
  cellSlots?: 1 | 2;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface StripTextItem {
  id: string;
  text: string;
  fontFamily: string;
  /** Size as a fraction of strip width. */
  size: number;
  align: TextAlign;
  rotation: number;
  /** Letter spacing in em. */
  letterSpacing: number;
  color: string;
  /** Normalised strip coordinates. */
  x: number;
  y: number;
}

export interface StripStyle {
  layout: StripLayoutId;
  background: string;
  /** Optional second colour; when set the background is a soft two-stop wash. */
  backgroundAlt: string | null;
  frameColor: string;
  borderWidth: number;
  gutter: number;
  cornerRadius: number;
  photoRadius: number;
  showLogo: boolean;
  showDate: boolean;
  title: string;
  caption: string;
  accent: string;
}

export interface StripDocument {
  style: StripStyle;
  texts: StripTextItem[];
  stickers: StickerLayer[];
  createdAt: number;
}
