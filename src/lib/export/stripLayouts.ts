import type { StripLayout, StripLayoutId, StripStyle, StripSize, StripSizeId, StripTheme } from '../../types/photobooth';

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
  {
    id: 'duo',
    label: 'Duo',
    blurb: 'Two of you in every frame.',
    columns: 1,
    rows: 4,
    cellAspect: 4 / 5,
    footerScale: 3.4,
    // The couple layout: each cell is a 2-slot pair, my face left, partner right.
    cellSlots: 2,
  },
];

export const LAYOUT_BY_ID: Record<StripLayoutId, StripLayout> = STRIP_LAYOUTS.reduce(
  (acc, l) => {
    acc[l.id] = l;
    return acc;
  },
  {} as Record<StripLayoutId, StripLayout>,
);

/** Cycle layouts; the OPEN_PALM gesture walks this order on both screens. */
export function nextStripLayout(current: StripLayoutId): StripLayoutId {
  const order: StripLayoutId[] = ['classic', 'grid', 'polaroid', 'minimal'];
  const i = order.indexOf(current);
  return order[(i + 1) % order.length] ?? 'classic';
}

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

export const STRIP_SIZES: StripSize[] = [
  { id: 'sm', label: 'Small', blurb: 'Quick share', width: 800, hint: '800px' },
  { id: 'md', label: 'Medium', blurb: 'Balanced', width: 1200, hint: '1200px • default' },
  { id: 'lg', label: 'Large', blurb: 'Crisp print', width: 1800, hint: '1800px' },
  { id: 'xl', label: 'XL', blurb: 'Poster', width: 2400, hint: '2400px' },
];

export const STRIP_SIZE_BY_ID: Record<StripSizeId, StripSize> = STRIP_SIZES.reduce(
  (acc, s) => {
    acc[s.id] = s;
    return acc;
  },
  {} as Record<StripSizeId, StripSize>,
);

export const DEFAULT_STRIP_SIZE: StripSizeId = 'md';

export const STRIP_THEMES: StripTheme[] = [
  { id: 'midnight', label: 'Midnight', background: '#16151A', backgroundAlt: null, accent: '#FF3B6B', frameColor: '#16151A' },
  { id: 'paper', label: 'Paper', background: '#FBF7F2', backgroundAlt: null, accent: '#16151A', frameColor: '#FBF7F2' },
  { id: 'blush', label: 'Blush', background: '#FFE3EA', backgroundAlt: '#FFC8D8', accent: '#FF3B6B', frameColor: '#FFE3EA' },
  { id: 'butter', label: 'Butter', background: '#FFF3C9', backgroundAlt: '#FFE08A', accent: '#C8A600', frameColor: '#FFF3C9' },
  { id: 'mint', label: 'Mint', background: '#DDF6EA', backgroundAlt: '#B4E8D0', accent: '#0EA76D', frameColor: '#DDF6EA' },
  { id: 'sky', label: 'Sky', background: '#DCEBFF', backgroundAlt: '#B8D4FF', accent: '#3B82F6', frameColor: '#DCEBFF' },
  { id: 'violet', label: 'Violet', background: '#E9E1FF', backgroundAlt: '#C9B6FF', accent: '#8B5CF6', frameColor: '#E9E1FF' },
  { id: 'lime', label: 'Lime', background: '#EAFFC4', backgroundAlt: '#C8FF4D', accent: '#65A30D', frameColor: '#EAFFC4' },
];

export const THEME_BY_ID: Record<string, StripTheme> = STRIP_THEMES.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<string, StripTheme>,
);

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
