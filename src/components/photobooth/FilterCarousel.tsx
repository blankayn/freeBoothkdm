import { useEffect, useRef } from 'react';
import type { FilterId } from '../../types/filters';
import { FILTERS, FILTER_BY_ID } from '../../lib/filters/filterCatalog';
import { Slider } from '../ui/Primitives';

interface FilterCarouselProps {
  value: FilterId;
  onChange: (id: FilterId) => void;
  intensity: number;
  onIntensity: (value: number) => void;
  handTrackingOn: boolean;
  disabled?: boolean;
}

export function FilterCarousel({
  value,
  onChange,
  intensity,
  onIntensity,
  handTrackingOn,
  disabled,
}: FilterCarouselProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const definition = FILTER_BY_ID[value];

  // Keep the active chip in view when the filter changes from a gesture or key.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [value]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = FILTERS.findIndex((f) => f.id === value);
    const next = event.key === 'ArrowRight' ? index + 1 : index - 1;
    const wrapped = (next + FILTERS.length) % FILTERS.length;
    onChange(FILTERS[wrapped].id);
  };

  return (
    <div className="filters">
      <div
        ref={listRef}
        className="filters__list"
        role="radiogroup"
        aria-label="Camera effect"
        onKeyDown={onKeyDown}
      >
        {FILTERS.map((filter) => {
          const selected = filter.id === value;
          const needsHands = filter.usesHand && !handTrackingOn;
          return (
            <button
              key={filter.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              className={`filters__chip ${selected ? 'is-selected' : ''}`}
              onClick={() => onChange(filter.id)}
              title={needsHands ? `${filter.label} — turn on hand tracking` : filter.label}
            >
              <span
                className="filters__swatch"
                style={{
                  background: `linear-gradient(135deg, ${filter.swatch[0]}, ${filter.swatch[1]})`,
                }}
                aria-hidden
              >
                {needsHands ? <span className="filters__badge">✋</span> : null}
              </span>
              <span className="filters__name">{filter.label}</span>
            </button>
          );
        })}
      </div>

      <div className="filters__meta">
        <p className="filters__blurb">{definition.blurb}</p>
        {definition.adjustable ? (
          <div className="filters__intensity">
            <Slider
              label="Intensity"
              value={intensity}
              onChange={onIntensity}
              display={`${Math.round(intensity * 100)}%`}
              tone="dark"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
