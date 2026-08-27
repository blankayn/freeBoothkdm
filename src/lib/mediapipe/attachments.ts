import type { AttachmentPoint, AttachmentTarget } from '../../types/stickers';
import type { CoverCrop } from '../filters/FilterEngine';
import type { HandFrame, Landmark } from './HandTracker';
import { HAND_LANDMARK, palmCenter, palmSpan } from './HandTracker';
import type { FaceFrame } from './FaceTracker';
import { FACE_LANDMARK } from './FaceTracker';

export interface AnchorTransform {
  /** Normalised frame coordinates. */
  x: number;
  y: number;
  rotation: number;
  /** Suggested sticker width as a fraction of frame width. */
  width: number;
}

/**
 * Landmarks arrive in *video* space. The preview is a cover-cropped, possibly
 * mirrored window onto that video, so every anchor has to be re-projected before
 * it means anything on screen. Getting this wrong is the classic "sunglasses
 * drift off the face on a widescreen webcam" bug.
 */
export function toFrameSpace(
  point: { x: number; y: number },
  crop: CoverCrop,
  mirror: boolean,
): { x: number; y: number } {
  let x = (point.x - crop.offsetX) / crop.scaleX;
  const y = (point.y - crop.offsetY) / crop.scaleY;
  if (mirror) x = 1 - x;
  return { x, y };
}

/** Horizontal distances shrink by the same factor the crop applied. */
function scaleX(value: number, crop: CoverCrop): number {
  return value / crop.scaleX;
}

function angleBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
  mirror: boolean,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angle = Math.atan2(dy, dx);
  // Mirroring flips the sense of rotation.
  return mirror ? Math.PI - angle : angle;
}

export function resolveAnchor(
  target: AttachmentTarget,
  point: AttachmentPoint | undefined,
  hands: HandFrame,
  faces: FaceFrame,
  crop: CoverCrop,
  mirror: boolean,
  index = 0,
): AnchorTransform | null {
  if (target === 'none') return null;
  if (target === 'face' || target === 'head') {
    const face = faces.faces[index] ?? faces.faces[0];
    if (!face) return null;
    return faceAnchor(face.landmarks, point ?? (target === 'head' ? 'forehead' : 'eyes'), crop, mirror);
  }
  const hand = hands.hands[index] ?? hands.hands[0];
  if (!hand) return null;
  return handAnchor(hand.landmarks, point ?? (target === 'finger' ? 'index-tip' : 'palm'), crop, mirror);
}

function faceAnchor(
  lm: Landmark[],
  point: AttachmentPoint,
  crop: CoverCrop,
  mirror: boolean,
): AnchorTransform | null {
  if (lm.length < 468) return null;

  const rightEye = lm[FACE_LANDMARK.RIGHT_EYE_OUTER];
  const leftEye = lm[FACE_LANDMARK.LEFT_EYE_OUTER];
  const rightCheek = lm[FACE_LANDMARK.RIGHT_CHEEK];
  const leftCheek = lm[FACE_LANDMARK.LEFT_CHEEK];
  const forehead = lm[FACE_LANDMARK.FOREHEAD];
  const chin = lm[FACE_LANDMARK.CHIN];

  const faceWidth = scaleX(Math.hypot(leftCheek.x - rightCheek.x, leftCheek.y - rightCheek.y), crop);
  const rotation = angleBetween(rightEye, leftEye, mirror);

  const pick = (): { src: { x: number; y: number }; width: number } => {
    switch (point) {
      case 'eyes': {
        const mid = { x: (rightEye.x + leftEye.x) / 2, y: (rightEye.y + leftEye.y) / 2 };
        return { src: mid, width: faceWidth * 1.06 };
      }
      case 'forehead': {
        // Sit above the hairline rather than on it, so hats read as worn.
        const lift = (chin.y - forehead.y) * 0.42;
        return { src: { x: forehead.x, y: forehead.y - lift }, width: faceWidth * 1.15 };
      }
      case 'nose':
        return { src: lm[FACE_LANDMARK.NOSE_TIP], width: faceWidth * 0.34 };
      case 'mouth':
        return { src: lm[FACE_LANDMARK.MOUTH_CENTER], width: faceWidth * 0.46 };
      case 'chin':
        return { src: chin, width: faceWidth * 0.4 };
      case 'left-cheek':
        return { src: leftCheek, width: faceWidth * 0.3 };
      case 'right-cheek':
        return { src: rightCheek, width: faceWidth * 0.3 };
      default: {
        const mid = { x: (rightEye.x + leftEye.x) / 2, y: (rightEye.y + leftEye.y) / 2 };
        return { src: mid, width: faceWidth };
      }
    }
  };

  const { src, width } = pick();
  const mapped = toFrameSpace(src, crop, mirror);
  return { x: mapped.x, y: mapped.y, rotation, width };
}

function handAnchor(
  lm: Landmark[],
  point: AttachmentPoint,
  crop: CoverCrop,
  mirror: boolean,
): AnchorTransform | null {
  if (lm.length < 21) return null;
  const span = scaleX(palmSpan(lm), crop);

  switch (point) {
    case 'palm': {
      const center = palmCenter(lm);
      const mapped = toFrameSpace(center, crop, mirror);
      const rotation =
        angleBetween(lm[HAND_LANDMARK.WRIST], lm[HAND_LANDMARK.MIDDLE_MCP], mirror) + Math.PI / 2;
      return { x: mapped.x, y: mapped.y, rotation, width: span * 1.9 };
    }
    case 'index-tip': {
      const mapped = toFrameSpace(lm[HAND_LANDMARK.INDEX_TIP], crop, mirror);
      const rotation =
        angleBetween(lm[HAND_LANDMARK.INDEX_DIP], lm[HAND_LANDMARK.INDEX_TIP], mirror) + Math.PI / 2;
      return { x: mapped.x, y: mapped.y, rotation, width: span * 0.8 };
    }
    case 'thumb-tip': {
      const mapped = toFrameSpace(lm[HAND_LANDMARK.THUMB_TIP], crop, mirror);
      const rotation =
        angleBetween(lm[HAND_LANDMARK.THUMB_IP], lm[HAND_LANDMARK.THUMB_TIP], mirror) + Math.PI / 2;
      return { x: mapped.x, y: mapped.y, rotation, width: span * 0.7 };
    }
    default: {
      const center = palmCenter(lm);
      const mapped = toFrameSpace(center, crop, mirror);
      return { x: mapped.x, y: mapped.y, rotation: 0, width: span * 1.6 };
    }
  }
}

export const ATTACHMENT_LABELS: Record<AttachmentTarget, string> = {
  none: 'Free',
  face: 'Face',
  head: 'Head',
  hand: 'Hand',
  finger: 'Finger',
};
