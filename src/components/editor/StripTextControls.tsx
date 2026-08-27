import type { StripTextItem, TextAlign } from '../../types/photobooth';
import { STRIP_FONTS } from '../../lib/export/stripLayouts';
import { Button, Segmented, Slider } from '../ui/Primitives';
import { IconPlus, IconTrash } from '../ui/Icons';

interface TextControlsProps {
  texts: StripTextItem[];
  selectedId: string | null;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<StripTextItem>) => void;
  onDelete: (id: string) => void;
}

const TEXT_COLORS = ['#16151A', '#FBF7F2', '#FF3B6B', '#8B5CF6', '#5AD2FF', '#C8FF4D', '#FFD166'];

export function TextControls({
  texts,
  selectedId,
  onAdd,
  onSelect,
  onChange,
  onDelete,
}: TextControlsProps) {
  const selected = texts.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="panel">
      <Button variant="secondary" icon={<IconPlus size={17} />} full onClick={onAdd}>
        Add text
      </Button>

      {texts.length > 0 ? (
        <ul className="text-list">
          {texts.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`text-list__item ${item.id === selectedId ? 'is-selected' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <span style={{ fontFamily: item.fontFamily, color: item.color }}>
                  {item.text.split('\n')[0] || 'Empty'}
                </span>
              </button>
              <button
                type="button"
                className="text-list__delete"
                aria-label="Delete this text"
                onClick={() => onDelete(item.id)}
              >
                <IconTrash size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel__empty">
          No text yet. Add a line and drag it anywhere on the strip.
        </p>
      )}

      {selected ? (
        <div className="panel__editor">
          <label className="panel__input">
            <span>Words</span>
            <textarea
              rows={2}
              maxLength={80}
              value={selected.text}
              onChange={(e) => onChange(selected.id, { text: e.target.value })}
            />
          </label>

          <fieldset className="panel__field">
            <legend>Font</legend>
            <div className="font-row">
              {STRIP_FONTS.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  aria-pressed={selected.fontFamily === font.stack}
                  className={selected.fontFamily === font.stack ? 'is-selected' : ''}
                  style={{ fontFamily: font.stack }}
                  onClick={() => onChange(selected.id, { fontFamily: font.stack })}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="panel__row">
            <Segmented
              label="Alignment"
              value={selected.align}
              options={[
                { value: 'left' as TextAlign, label: 'Left' },
                { value: 'center' as TextAlign, label: 'Center' },
                { value: 'right' as TextAlign, label: 'Right' },
              ]}
              onChange={(align) => onChange(selected.id, { align })}
            />
          </div>

          <Slider
            label="Size"
            tone="light"
            value={selected.size}
            min={0.02}
            max={0.16}
            step={0.002}
            display={`${Math.round(selected.size * 1000) / 10}`}
            onChange={(v) => onChange(selected.id, { size: v })}
          />
          <Slider
            label="Letter spacing"
            tone="light"
            value={selected.letterSpacing}
            min={-0.05}
            max={0.4}
            step={0.005}
            display={`${Math.round(selected.letterSpacing * 100) / 100}em`}
            onChange={(v) => onChange(selected.id, { letterSpacing: v })}
          />
          <Slider
            label="Rotation"
            tone="light"
            value={selected.rotation}
            min={-0.6}
            max={0.6}
            step={0.01}
            display={`${Math.round((selected.rotation * 180) / Math.PI)}°`}
            onChange={(v) => onChange(selected.id, { rotation: v })}
          />

          <fieldset className="panel__field">
            <legend>Colour</legend>
            <div className="swatches">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Text colour ${color}`}
                  aria-pressed={selected.color === color}
                  className={`swatch swatch--sm ${selected.color === color ? 'is-selected' : ''}`}
                  style={{ background: color }}
                  onClick={() => onChange(selected.id, { color })}
                />
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
