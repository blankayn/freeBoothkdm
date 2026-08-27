import { IconButton } from '../ui/Primitives';
import {
  IconClose,
  IconSettings,
  IconSoundOff,
  IconSoundOn,
  IconSwitchCamera,
} from '../ui/Icons';
import type { GestureId } from '../../lib/mediapipe/GestureManager';
import { GESTURE_LABELS } from '../../lib/mediapipe/GestureManager';

interface CameraControlsProps {
  onClose: () => void;
  onSwitchCamera: () => void;
  onOpenSettings: () => void;
  onToggleSound: () => void;
  canSwitch: boolean;
  soundEnabled: boolean;
  handTrackingOn: boolean;
  gesture: GestureId;
  fps: number;
  showDiagnostics: boolean;
  rendererKind: 'webgl' | 'canvas2d' | 'none';
}

export function CameraControls({
  onClose,
  onSwitchCamera,
  onOpenSettings,
  onToggleSound,
  canSwitch,
  soundEnabled,
  handTrackingOn,
  gesture,
  fps,
  showDiagnostics,
  rendererKind,
}: CameraControlsProps) {
  return (
    <div className="booth__top">
      <IconButton label="Close the photobooth" onClick={onClose}>
        <IconClose />
      </IconButton>

      <div className="booth__status">
        {handTrackingOn ? (
          <span className={`booth__gesture ${gesture !== 'NONE' ? 'is-live' : ''}`}>
            <span className="booth__gesture-dot" aria-hidden />
            {gesture === 'NONE' ? 'Hands on' : GESTURE_LABELS[gesture]}
          </span>
        ) : null}
        {showDiagnostics ? (
          <span className="booth__fps" title={`Renderer: ${rendererKind}`}>
            {fps} fps
          </span>
        ) : null}
      </div>

      <div className="booth__top-actions">
        <IconButton
          label={soundEnabled ? 'Mute the shutter' : 'Unmute the shutter'}
          onClick={onToggleSound}
        >
          {soundEnabled ? <IconSoundOn /> : <IconSoundOff />}
        </IconButton>
        <IconButton
          label="Switch camera"
          onClick={onSwitchCamera}
          disabled={!canSwitch}
        >
          <IconSwitchCamera />
        </IconButton>
        <IconButton label="Booth settings" onClick={onOpenSettings}>
          <IconSettings />
        </IconButton>
      </div>
    </div>
  );
}
