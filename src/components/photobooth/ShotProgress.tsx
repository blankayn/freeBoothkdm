import type { CapturedPhoto } from '../../types/photobooth';
import { SHOT_COUNT } from '../../types/photobooth';

interface ShotProgressProps {
  photos: (CapturedPhoto | null)[];
  activeShot: number;
  retakeTarget: number | null;
  onSelect?: (index: number) => void;
}

export function ShotProgress({ photos, activeShot, retakeTarget, onSelect }: ShotProgressProps) {
  const shotNumber = Math.min(activeShot + 1, SHOT_COUNT);
  const retaking = retakeTarget !== null;

  return (
    <div className="shots">
      <p className="shots__label">
        {retaking ? (
          <>
            RETAKING <strong>{retakeTarget + 1}</strong>
          </>
        ) : (
          <>
            SHOT <strong>{shotNumber}</strong> / {SHOT_COUNT}
          </>
        )}
      </p>
      <ol className="shots__list">
        {photos.map((photo, i) => {
          const isActive = i === activeShot;
          const label = photo ? `Shot ${i + 1}, taken` : `Shot ${i + 1}, empty`;
          return (
            <li key={i}>
              <button
                type="button"
                className={`shots__dot ${photo ? 'is-filled' : ''} ${isActive ? 'is-active' : ''}`}
                aria-label={photo ? `${label}. Retake it` : label}
                aria-current={isActive ? 'step' : undefined}
                disabled={!photo || !onSelect}
                onClick={() => photo && onSelect?.(i)}
              >
                {photo ? <img src={photo.url} alt="" /> : <span>{i + 1}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
