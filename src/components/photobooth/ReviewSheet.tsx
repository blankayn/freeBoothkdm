import type { CapturedPhoto } from '../../types/photobooth';
import { Button, Sheet } from '../ui/Primitives';
import { IconRetake, IconChevronRight, IconPalette } from '../ui/Icons';

interface ReviewSheetProps {
  open: boolean;
  photos: (CapturedPhoto | null)[];
  onRetakeOne: (index: number) => void;
  onRetakeAll: () => void;
  onSave: () => void;
  onCustomize: () => void;
}

export function ReviewSheet({
  open,
  photos,
  onRetakeOne,
  onRetakeAll,
  onSave,
  onCustomize,
}: ReviewSheetProps) {
  return (
    <Sheet
      open={open}
      title="Four in the can"
      // Closing the review is the same as choosing to keep shooting.
      onClose={onRetakeAll}
    >
      <p className="review__lead">
        Tap any shot to take it again — your strip is already set up, so saving is the only step
        left.
      </p>

      <ul className="review__grid">
        {photos.map((photo, i) => (
          <li key={photo?.id ?? i}>
            <button
              type="button"
              className="review__shot"
              onClick={() => onRetakeOne(i)}
              aria-label={`Retake shot ${i + 1}`}
            >
              {photo ? <img src={photo.url} alt={`Shot ${i + 1}`} /> : <span />}
              <span className="review__index">{i + 1}</span>
              <span className="review__redo">
                <IconRetake size={16} />
                Retake
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="review__actions">
        <Button variant="dark" icon={<IconRetake size={17} />} onClick={onRetakeAll}>
          Retake all
        </Button>
        <Button variant="dark" icon={<IconPalette size={17} />} onClick={onCustomize}>
          Customize
        </Button>
        <Button data-autofocus onClick={onSave}>
          Save strip
          <IconChevronRight size={17} />
        </Button>
      </div>
    </Sheet>
  );
}
