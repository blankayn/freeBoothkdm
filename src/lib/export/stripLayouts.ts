import type { StripLayout, StripLayoutId, StripStyle } from '../../types/photobooth';

export const STRIP_LAYOUTS: StripLayout[] = [
  /*
   * Cell aspects are a compromise. Captures are 4:5 portrait, but four portrait
   * frames stacked give a 1:4.9 strip — far taller than a real photo strip and
   * awkward to share. Square cells centre-crop only 20% of the height (the face
   * survives) and land the classic strip near the traditional 1:4.
   */
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'Four frames, one tall strip.',
    columns: 1,
    rows: 4,
    cellAspect: 1,
    footerScale: 3.4,
  },
  {
    id: 'grid',
    label: 'Grid',
    blurb: 'Two by two. Easier to share.',
    columns: 2,
    rows: 2,
    cellAspect: 4 / 5,
    footerScale: 2.4,
  },
  {
    id: 'polaroid',
    label: 'Polaroid',
    blurb: 'Thick white chin under every shot.',
    columns: 1,
    rows: 4,
    cellAspect: 1,
    footerScale: 3,
    perCellFooter: 0.26,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    blurb: 'Edge to edge, no chrome.',
    columns: 1,
    rows: 4,
    cellAspect: 1,
    footerScale: 1.3,
  },
];

export const LAYOUT_BY_ID: Record<StripLayoutId, StripLayout> = STRIP_LAYOUTS.reduce(
  (acc, l) => {
    acc[l.id] = l;
    return acc;
  },
  {} as Record<StripLayoutId, StripLayout>,
);

export const STRIP_BACKGROUNDS: { id: string; label: string; color: string; alt: string | null; frame: string; ink: string }[] = [
  { id: 'ink', label: 'Ink', color: '#16151A', alt: null, frame: '#16151A', ink: '#FBF7F2' },
  { id: 'paper', label: 'Paper', color: '#FBF7F2', alt: null, frame: '#FBF7F2', ink: '#16151A' },
  { id: 'blush', label: 'Blush', color: '#FFE3EA', alt: '#FFC8D8', frame: '#FFE3EA', ink: '#7A2540' },
  { id: 'butter', label: 'Butter', color: '#FFF3C9', alt: '#FFE08A', frame: '#FFF3C9', ink: '#6B4A00' },
  { id: 'mint', label: 'Mint', color: '#DDF6EA', alt: '#B4E8D0', frame: '#DDF6EA', ink: '#12503B' },
  { id: 'sky', label: 'Sky', color: '#DCEBFF', alt: '#B8D4FF', frame: '#DCEBFF', ink: '#123A72' },
  { id: 'violet', label: 'Violet', color: '#E9E1FF', alt: '#C9B6FF', frame: '#E9E1FF', ink: '#3B2170' },
  { id: 'lime', label: 'Lime', color: '#EAFFC4', alt: '#C8FF4D', frame: '#EAFFC4', ink: '#33500A' },
];

export const STRIP_FONTS: { id: string; label: string; stack: string }[] = [
  { id: 'display', label: 'Display', stack: '"Bricolage Grotesque", "Inter", system-ui, sans-serif' },
  { id: 'sans', label: 'Sans', stack: '"Inter", system-ui, -apple-system, sans-serif' },
  { id: 'hand', label: 'Handwriting', stack: '"Caveat", "Bradley Hand", cursive' },
  { id: 'serif', label: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Mono', stack: '"SFMono-Regular", "Consolas", "Courier New", monospace' },
];

export const DEFAULT_STRIP_STYLE: StripStyle = {
  layout: 'classic',
  background: '#16151A',
  backgroundAlt: null,
  frameColor: '#16151A',
  borderWidth: 0,
  gutter: 0.045,
  cornerRadius: 0.05,
  photoRadius: 0.035,
  showLogo: true,
  showDate: true,
  title: 'MAKE A MOMENT',
  caption: '',
  accent: '#FF3B6B',
};
