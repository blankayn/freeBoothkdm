import type { CapturedPhoto } from '../../types/photobooth';
import { Button, Sheet } from '../ui/Primitives';
import { IconRetake, IconChevronRight } from '../ui/Icons';

interface ReviewSheetProps {
  open: boolean;
  photos: (CapturedPhoto | null)[];
  onRetakeOne: (index: number) => void;
  onRetakeAll: () => void;
  onContinue: () => void;
}

export function ReviewSheet({
  open,
  photos,
  onRetakeOne,
  onRetakeAll,
  onContinue,
}: ReviewSheetProps) {
  return (
    <Sheet
      open={open}
      title="Four in the can"
      // Closing the review is the same as choosing to keep shooting.
      onClose={onRetakeAll}
    >
      <p className="review__lead">
        Tap any shot to take it again, or carry on to the strip editor.
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
        <Button data-autofocus onClick={onContinue}>
          Continue
          <IconChevronRight size={17} />
        </Button>
      </div>
    </Sheet>
  );
}
