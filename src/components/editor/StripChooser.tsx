import { useMemo } from 'react';
import { usePhotobooth } from '../../state/photoboothStore';
import { LAYOUT_BY_ID } from '../../lib/export/stripLayouts';
import { PhotoStripPreview } from './PhotoStripPreview';
import { LayoutControls, SizeControls, ThemeControls } from './StripStyleControls';
import { Button } from '../ui/Primitives';
import { IconChevronLeft, IconChevronRight } from '../ui/Icons';
import { SHOT_COUNT } from '../../types/photobooth';

interface StripChooserProps {
  onStart: () => void;
  onBack: () => void;
}

const EMPTY_ROLL = new Array(SHOT_COUNT).fill(null);
const NO_OP = () => {};

/**
 * Picks the strip before the camera ever opens.
 *
 * The preview is the real `renderStrip` with an empty roll, so the blank cells
 * on screen are exactly the cells the shots will land in — including the crop.
 * That is the whole point of moving this step forward: the booth can then show
 * you the frame you are actually going to get instead of trimming 20% off it
 * after the fact.
 */
export function StripChooser({ onStart, onBack }: StripChooserProps) {
  const style = usePhotobooth((s) => s.stripStyle);
  const size = usePhotobooth((s) => s.stripSize);
  const setStripStyle = usePhotobooth((s) => s.setStripStyle);
  const setStripLayout = usePhotobooth((s) => s.setStripLayout);
  const setStripSize = usePhotobooth((s) => s.setStripSize);

  const layout = LAYOUT_BY_ID[style.layout];

  // How much of each 4:5 shot survives the cell crop, stated plainly rather
  // than discovered at export time.
  const cropNote = useMemo(() => {
    const photoAspect = 4 / 5;
    if (Math.abs(layout.cellAspect - photoAspect) < 0.001) {
      return 'Keeps the whole frame — nothing is trimmed.';
    }
    if (layout.cellAspect > photoAspect) {
      const kept = Math.round((photoAspect / layout.cellAspect) * 100);
      return `Square cells: each shot keeps the middle ${kept}% of its height.`;
    }
    const kept = Math.round((layout.cellAspect / photoAspect) * 100);
    return `Tall cells: each shot keeps the middle ${kept}% of its width.`;
  }, [layout.cellAspect]);

  return (
    <div className="chooser" id="main">
      <header className="chooser__top">
        <Button variant="ghost" size="sm" icon={<IconChevronLeft size={17} />} onClick={onBack}>
          Back
        </Button>
        <p className="chooser__step">Step 1 of 2</p>
      </header>

      <div className="chooser__body">
        <div className="chooser__stage">
          <PhotoStripPreview
            photos={EMPTY_ROLL}
            style={style}
            texts={[]}
            stickers={[]}
            createdAt={0}
            selection={null}
            onSelect={NO_OP}
            onStickersChange={NO_OP}
            onTextsChange={NO_OP}
            interactive={false}
          />
        </div>

        <div className="chooser__panel">
          <div className="chooser__intro">
            <h1>Pick your strip</h1>
            <p>
              Choose the shape first and the booth will frame every shot to match. You can still
              fine-tune the details after.
            </p>
          </div>

          <section className="chooser__section">
            <h2 className="chooser__heading">Layout</h2>
            <LayoutControls layout={style.layout} onChange={setStripLayout} />
            <p className="chooser__note">{cropNote}</p>
          </section>

          <section className="chooser__section">
            <h2 className="chooser__heading">Look</h2>
            <div className="panel">
              <ThemeControls style={style} onChange={setStripStyle} hint="" />
            </div>
          </section>

          <section className="chooser__section">
            <h2 className="chooser__heading">Size</h2>
            <SizeControls size={size} onChange={setStripSize} />
          </section>
        </div>
      </div>

      <footer className="chooser__actions">
        <Button size="lg" data-autofocus onClick={onStart}>
          Start shooting
          <IconChevronRight size={18} />
        </Button>
      </footer>
    </div>
  );
}
