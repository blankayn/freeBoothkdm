import type { StripLayoutId, StripStyle } from '../../types/photobooth';
import { STRIP_BACKGROUNDS, STRIP_LAYOUTS } from '../../lib/export/stripLayouts';
import { Slider, Toggle } from '../ui/Primitives';

interface LayoutControlsProps {
  layout: StripLayoutId;
  onChange: (id: StripLayoutId) => void;
}

export function LayoutControls({ layout, onChange }: LayoutControlsProps) {
  return (
    <div className="panel">
      <div className="panel__group" role="radiogroup" aria-label="Strip layout">
        {STRIP_LAYOUTS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === layout}
            className={`layout-card ${option.id === layout ? 'is-selected' : ''}`}
            onClick={() => onChange(option.id)}
          >
            <LayoutGlyph id={option.id} />
            <span className="layout-card__name">{option.label}</span>
            <span className="layout-card__blurb">{option.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LayoutGlyph({ id }: { id: StripLayoutId }) {
  const cells =
    id === 'grid'
      ? [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]
      : [[0, 0], [0, 1], [0, 2], [0, 3]];
  const cols = id === 'grid' ? 2 : 1;
  const rows = id === 'grid' ? 2 : 4;
  const gap = id === 'minimal' ? 1.5 : 3;
  const cellW = (34 - gap * (cols + 1)) / cols;
  const chin = id === 'polaroid' ? 3 : 0;
  const cellH = (46 - gap * (rows + 1) - chin * rows) / rows;

  return (
    <svg viewBox="0 0 34 52" className="layout-card__glyph" aria-hidden>
      <rect x="0" y="0" width="34" height="52" rx="3" className="layout-card__bg" />
      {cells.map(([c, r], i) => (
        <rect
          key={i}
          x={gap + c * (cellW + gap)}
          y={gap + r * (cellH + chin + gap)}
          width={cellW}
          height={cellH}
          rx="1.5"
          className="layout-card__cell"
        />
      ))}
      {id !== 'minimal' ? <circle cx="17" cy="48" r="1.6" className="layout-card__mark" /> : null}
    </svg>
  );
}

interface StyleControlsProps {
  style: StripStyle;
  onChange: (patch: Partial<StripStyle>) => void;
}

export function StyleControls({ style, onChange }: StyleControlsProps) {
  return (
    <div className="panel">
      <fieldset className="panel__field">
        <legend>Background</legend>
        <div className="swatches">
          {STRIP_BACKGROUNDS.map((option) => {
            const selected = style.background === option.color;
            return (
              <button
                key={option.id}
                type="button"
                aria-label={option.label}
                aria-pressed={selected}
                title={option.label}
                className={`swatch ${selected ? 'is-selected' : ''}`}
                style={{
                  background: option.alt
                    ? `linear-gradient(160deg, ${option.color}, ${option.alt})`
                    : option.color,
                }}
                onClick={() =>
                  onChange({
                    background: option.color,
                    backgroundAlt: option.alt,
                    frameColor: option.frame,
                  })
                }
              />
            );
          })}
        </div>
      </fieldset>

      <fieldset className="panel__field">
        <legend>Accent</legend>
        <div className="swatches">
          {['#FF3B6B', '#8B5CF6', '#5AD2FF', '#C8FF4D', '#FFD166', '#16151A'].map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Accent ${color}`}
              aria-pressed={style.accent === color}
              className={`swatch swatch--sm ${style.accent === color ? 'is-selected' : ''}`}
              style={{ background: color }}
              onClick={() => onChange({ accent: color })}
            />
          ))}
        </div>
      </fieldset>

      <div className="panel__sliders">
        <Slider
          label="Spacing"
          tone="light"
          value={style.gutter}
          min={0.008}
          max={0.09}
          step={0.002}
          display={`${Math.round(style.gutter * 1000) / 10}`}
          onChange={(v) => onChange({ gutter: v })}
        />
        <Slider
          label="Photo corners"
          tone="light"
          value={style.photoRadius}
          min={0}
          max={0.09}
          step={0.002}
          display={`${Math.round(style.photoRadius * 1000) / 10}`}
          onChange={(v) => onChange({ photoRadius: v })}
        />
        <Slider
          label="Strip corners"
          tone="light"
          value={style.cornerRadius}
          min={0}
          max={0.1}
          step={0.002}
          display={`${Math.round(style.cornerRadius * 1000) / 10}`}
          onChange={(v) => onChange({ cornerRadius: v })}
        />
        <Slider
          label="Photo border"
          tone="light"
          value={style.borderWidth}
          min={0}
          max={0.02}
          step={0.001}
          display={style.borderWidth === 0 ? 'None' : `${Math.round(style.borderWidth * 1000) / 10}`}
          onChange={(v) => onChange({ borderWidth: v })}
        />
      </div>

      <fieldset className="panel__field">
        <legend>Footer</legend>
        <label className="panel__input">
          <span>Title</span>
          <input
            type="text"
            value={style.title}
            maxLength={28}
            placeholder="MAKE A MOMENT"
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </label>
        <label className="panel__input">
          <span>Caption</span>
          <input
            type="text"
            value={style.caption}
            maxLength={44}
            placeholder="Add a small caption"
            onChange={(e) => onChange({ caption: e.target.value })}
          />
        </label>
        <Toggle
          tone="light"
          label="Show the mark"
          checked={style.showLogo}
          onChange={(v) => onChange({ showLogo: v })}
        />
        <Toggle
          tone="light"
          label="Show the date"
          checked={style.showDate}
          onChange={(v) => onChange({ showDate: v })}
        />
      </fieldset>
    </div>
  );
}
