import type { FilterDefinition, FilterId } from '../../types/filters';

export const FILTERS: FilterDefinition[] = [
  {
    id: 'original',
    label: 'Original',
    blurb: 'Just you, exactly as you are.',
    defaultIntensity: 0,
    adjustable: false,
    cost: 'low',
    swatch: ['#FBF7F2', '#D9D2C7'],
  },
  {
    id: 'spherize',
    label: 'Spherize',
    blurb: 'A glass marble pushed out of the frame.',
    defaultIntensity: 0.5,
    adjustable: true,
    cost: 'low',
    swatch: ['#7BD5FF', '#3B6BFF'],
  },
  {
    id: 'bulge',
    label: 'Bulge',
    blurb: 'Big head energy.',
    defaultIntensity: 0.45,
    adjustable: true,
    cost: 'low',
    swatch: ['#FFC46B', '#FF6B3B'],
  },
  {
    id: 'pinch',
    label: 'Pinch',
    blurb: 'Squeezed toward the middle.',
    defaultIntensity: 0.45,
    adjustable: true,
    cost: 'low',
    swatch: ['#C8FF4D', '#3BAA5A'],
  },
  {
    id: 'wave',
    label: 'Wave',
    blurb: 'Underwater wobble.',
    defaultIntensity: 0.4,
    adjustable: true,
    animated: true,
    cost: 'low',
    swatch: ['#8AF0E6', '#2E8FA8'],
  },
  {
    id: 'mirror',
    label: 'Mirror',
    blurb: 'Perfectly symmetrical. Slightly uncanny.',
    defaultIntensity: 1,
    adjustable: true,
    cost: 'low',
    swatch: ['#E7C6FF', '#8B5CF6'],
  },
  {
    id: 'rgbshift',
    label: 'RGB Shift',
    blurb: 'Channels pulled apart like a bad VHS.',
    defaultIntensity: 0.4,
    adjustable: true,
    animated: true,
    cost: 'low',
    swatch: ['#FF3B6B', '#3BE0FF'],
  },
  {
    id: 'fisheye',
    label: 'Fish Eye',
    blurb: 'Whole-frame barrel warp.',
    defaultIntensity: 0.5,
    adjustable: true,
    cost: 'low',
    swatch: ['#FFE66B', '#FF3B6B'],
  },
  {
    id: 'pixel',
    label: 'Pixel',
    blurb: 'Sixteen-bit self portrait.',
    defaultIntensity: 0.35,
    adjustable: true,
    cost: 'low',
    swatch: ['#B8B2FF', '#4B45B8'],
  },
  {
    id: 'handwarp',
    label: 'Hand Warp',
    blurb: 'Warps wherever your hand goes. Needs hand tracking.',
    defaultIntensity: 0.6,
    adjustable: true,
    usesHand: true,
    animated: true,
    cost: 'medium',
    swatch: ['#FF9AD5', '#7A3BFF'],
  },
];

export const FILTER_BY_ID: Record<FilterId, FilterDefinition> = FILTERS.reduce(
  (acc, f) => {
    acc[f.id] = f;
    return acc;
  },
  {} as Record<FilterId, FilterDefinition>,
);

export const FILTER_IDS: FilterId[] = FILTERS.map((f) => f.id);

export function nextFilter(current: FilterId, step = 1): FilterId {
  const i = FILTER_IDS.indexOf(current);
  const n = FILTER_IDS.length;
  return FILTER_IDS[(((i + step) % n) + n) % n];
}
