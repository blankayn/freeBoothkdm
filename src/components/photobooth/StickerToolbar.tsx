import type { AttachmentTarget, StickerLayer } from '../../types/stickers';
import { IconBackward, IconCopy, IconForward, IconTrash } from '../ui/Icons';
import { ATTACHMENT_LABELS } from '../../lib/mediapipe/attachments';

interface StickerToolbarProps {
  layer: StickerLayer;
  onDuplicate: () => void;
  onDelete: () => void;
  onForward: () => void;
  onBackward: () => void;
  onAttach: (target: AttachmentTarget) => void;
  faceTrackingOn: boolean;
  handTrackingOn: boolean;
}

const TARGETS: AttachmentTarget[] = ['none', 'face', 'head', 'hand', 'finger'];

/**
 * Controls for whichever sticker is selected. Attachment options are disabled
 * rather than hidden when their tracker is off, so the capability is discoverable.
 */
export function StickerToolbar({
  layer,
  onDuplicate,
  onDelete,
  onForward,
  onBackward,
  onAttach,
  faceTrackingOn,
  handTrackingOn,
}: StickerToolbarProps) {
  const requires = (target: AttachmentTarget) => {
    if (target === 'face' || target === 'head') return faceTrackingOn;
    if (target === 'hand' || target === 'finger') return handTrackingOn;
    return true;
  };

  return (
    <div className="stoolbar" role="group" aria-label="Selected sticker">
      <div className="stoolbar__row">
        <button type="button" onClick={onBackward} aria-label="Send backward">
          <IconBackward size={17} />
        </button>
        <button type="button" onClick={onForward} aria-label="Bring forward">
          <IconForward size={17} />
        </button>
        <button type="button" onClick={onDuplicate} aria-label="Duplicate sticker">
          <IconCopy size={17} />
        </button>
        <button type="button" onClick={onDelete} aria-label="Delete sticker" className="is-danger">
          <IconTrash size={17} />
        </button>
      </div>

      <div className="stoolbar__attach" role="radiogroup" aria-label="Pin this sticker to">
        {TARGETS.map((target) => {
          const enabled = requires(target);
          return (
            <button
              key={target}
              type="button"
              role="radio"
              aria-checked={layer.attachment === target}
              disabled={!enabled}
              className={layer.attachment === target ? 'is-selected' : ''}
              onClick={() => onAttach(target)}
              title={
                enabled
                  ? `Pin to ${ATTACHMENT_LABELS[target].toLowerCase()}`
                  : `Turn on ${target === 'face' || target === 'head' ? 'face' : 'hand'} tracking first`
              }
            >
              {ATTACHMENT_LABELS[target]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
