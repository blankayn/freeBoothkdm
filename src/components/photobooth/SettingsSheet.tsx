import { Sheet, Slider, Toggle, Segmented } from '../ui/Primitives';
import type { BoothSettings } from '../../state/photoboothStore';
import { GESTURE_HINTS } from '../../lib/mediapipe/GestureManager';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  settings: BoothSettings;
  onChange: (patch: Partial<BoothSettings>) => void;
  rendererKind: 'webgl' | 'canvas2d' | 'none';
  fps: number;
}

export function SettingsSheet({
  open,
  onClose,
  settings,
  onChange,
  rendererKind,
  fps,
}: SettingsSheetProps) {
  return (
    <Sheet open={open} title="Booth settings" onClose={onClose}>
      <div className="settings">
        <section>
          <h3 className="settings__heading">Timing</h3>
          <div className="settings__row">
            <span>Countdown</span>
            <Segmented
              label="Countdown length"
              tone="dark"
              value={String(settings.countdownSeconds)}
              options={[
                { value: '0', label: 'Off' },
                { value: '3', label: '3s' },
                { value: '5', label: '5s' },
              ]}
              onChange={(v) => onChange({ countdownSeconds: Number(v) })}
            />
          </div>
        </section>

        <section>
          <h3 className="settings__heading">Camera</h3>
          <Toggle
            label="Mirror the front camera"
            hint="Matches what you see in a real mirror. Turn off if text in frame looks backwards."
            checked={settings.mirrorFrontCamera}
            onChange={(v) => onChange({ mirrorFrontCamera: v })}
          />
          <div style={{ marginTop: 16 }}>
            <Slider
              label="Distance"
              tone="dark"
              value={settings.cameraZoom}
              min={0.3}
              max={1}
              step={0.05}
              display={
                settings.cameraZoom <= 0.45
                  ? 'Wide • phone'
                  : settings.cameraZoom <= 0.65
                    ? 'Natural • classic'
                    : 'Tight'
              }
              onChange={(v) => onChange({ cameraZoom: Math.round(v * 20) / 20 })}
            />
            <p style={{ fontSize: '0.74rem', color: 'var(--on-dark-soft)', marginTop: 6, lineHeight: 1.4 }}>
              Front cam is wide by nature — <strong>0.42</strong> = phone at arm’s length (shoulders + background, like
              FaceTime). <strong>0.65</strong> = classic 2ft booth (chest up). <strong>1.0</strong> = tight
              headshot. If it’s too close, drag to <strong>0.35–0.40</strong>. Strip is 4:5 (1080×1350) vs webcam
              16:9, so wide shows blurred bars top/bottom — that’s the extra room.
            </p>
          </div>
        </section>

        <section>
          <h3 className="settings__heading">Tracking</h3>
          <Toggle
            label="Hand tracking"
            hint="Gestures control the booth, and stickers can pin to your hand. Downloads a model the first time."
            checked={settings.handTracking}
            onChange={(v) => onChange({ handTracking: v })}
          />
          {settings.handTracking ? (
            <ul className="settings__gestures">
              {GESTURE_HINTS.map((hint) => (
                <li key={hint.gesture}>
                  <span aria-hidden>{hint.icon}</span>
                  {hint.does}
                </li>
              ))}
            </ul>
          ) : null}
          <Toggle
            label="Face tracking"
            hint="Lets stickers stay stuck to your face as you move. The heaviest option — turn it off if things feel slow."
            checked={settings.faceTracking}
            onChange={(v) => onChange({ faceTracking: v })}
          />
        </section>

        <section>
          <h3 className="settings__heading">Feedback</h3>
          <Toggle
            label="Shutter sound"
            checked={settings.soundEnabled}
            onChange={(v) => onChange({ soundEnabled: v })}
          />
          <Toggle
            label="Vibration"
            hint="Only on devices that support it."
            checked={settings.hapticsEnabled}
            onChange={(v) => onChange({ hapticsEnabled: v })}
          />
        </section>

        <footer className="settings__footer">
          <p>
            Rendering with <strong>{rendererKind === 'webgl' ? 'WebGL' : 'Canvas 2D'}</strong> at
            roughly <strong>{fps} fps</strong>.
          </p>
          <p className="settings__privacy">
            Camera frames stay on this device. Nothing is uploaded, and photos are only saved when
            you download them.
          </p>
        </footer>
      </div>
    </Sheet>
  );
}
