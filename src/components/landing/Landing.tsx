import { lazy, Suspense, useState } from 'react';
import { Button, Sheet } from '../ui/Primitives';
import { Logo, IconSparkle, IconHand, IconSticker, IconDownload } from '../ui/Icons';
import { BUILT_IN_STICKERS } from '../../lib/stickers/stickerLibrary';
import { GESTURE_HINTS } from '../../lib/mediapipe/GestureManager';

const Camera3D = lazy(() => import('./Camera3D').then((m) => ({ default: m.Camera3D })));

interface LandingProps {
  onOpen: () => void;
  cameraSupported: boolean;
}

const SHOWCASE_STICKERS = ['heart', 'sparkle', 'star5', 'boba'];

export function Landing({ onOpen, cameraSupported }: LandingProps) {
  const [howOpen, setHowOpen] = useState(false);

  return (
    <main className="landing" id="main">
      <div className="landing__grain" aria-hidden />

      <header className="landing__bar">
        <span className="landing__brand">
          <Logo size={24} />
          <span>Make a Moment</span>
        </span>
        <button className="landing__link" onClick={() => setHowOpen(true)}>
          How it works
        </button>
      </header>

      <div className="landing__body">
        <section className="landing__copy">
          <p className="landing__eyebrow">
            <span className="landing__dot" aria-hidden />
            Browser photobooth
          </p>
          <h1 className="landing__title">
            MAKE A<br />
            MOMENT
          </h1>
          <p className="landing__sub">
            Take four shots. Play with effects. Make your own strip.
          </p>

          <div className="landing__cta">
            <Button size="lg" onClick={onOpen} disabled={!cameraSupported}>
              OPEN PHOTOBOOTH
            </Button>
            <button className="landing__secondary" onClick={() => setHowOpen(true)}>
              How it works
            </button>
          </div>

          {!cameraSupported ? (
            <p className="landing__warning" role="alert">
              This browser does not expose a camera API. Try Chrome, Edge, Firefox, or Safari
              over HTTPS.
            </p>
          ) : (
            <p className="landing__note">
              Everything runs in your browser. Photos never leave this device.
            </p>
          )}
        </section>

        <section className="landing__preview" aria-label="Interactive 3D camera and example photo strip">
          <Suspense
            fallback={
              <div className="camera3d camera3d--loading" aria-hidden>
                <div className="camera3d__spinner" />
              </div>
            }
          >
            <Camera3D />
          </Suspense>
          <StripShowcase />
        </section>
      </div>

      <Sheet open={howOpen} title="How it works" tone="light" onClose={() => setHowOpen(false)}>
        <ol className="how">
          <li>
            <span className="how__icon">
              <IconSparkle />
            </span>
            <div>
              <h3>Pick something weird</h3>
              <p>
                Ten live effects, from a gentle spherical lens to full VHS breakdown. Every one
                runs on your camera in real time.
              </p>
            </div>
          </li>
          <li>
            <span className="how__icon">
              <IconSticker />
            </span>
            <div>
              <h3>Decorate</h3>
              <p>
                Drag, scale, and spin stickers — or upload your own. Pin a pair of shades to your
                face and they will stay there as you move.
              </p>
            </div>
          </li>
          <li>
            <span className="how__icon">
              <IconHand />
            </span>
            <div>
              <h3>Use your hands</h3>
              <p>Optional hand tracking turns gestures into controls:</p>
              <ul className="how__gestures">
                {GESTURE_HINTS.map((hint) => (
                  <li key={hint.gesture}>
                    <span aria-hidden>{hint.icon}</span>
                    {hint.does}
                  </li>
                ))}
              </ul>
            </div>
          </li>
          <li>
            <span className="how__icon">
              <IconDownload />
            </span>
            <div>
              <h3>Four shots, then the strip</h3>
              <p>
                Customise the layout, background, and caption, then download a high-resolution
                PNG or share it straight from your phone.
              </p>
            </div>
          </li>
        </ol>
        <p className="how__privacy">
          Camera frames are processed on this device and are never uploaded. Custom stickers stay
          in your browser&rsquo;s local storage.
        </p>
      </Sheet>
    </main>
  );
}

/**
 * An illustrative strip, not a fake photo. The frames are abstract gradients so
 * nothing here pretends to be a real person's picture.
 */
function StripShowcase() {
  const frames = [
    { from: '#FFB6C8', to: '#FF6B8A', tilt: '-1.2deg' },
    { from: '#B8E4FF', to: '#5AA8FF', tilt: '0.8deg' },
    { from: '#FFE59E', to: '#FFB13D', tilt: '-0.6deg' },
    { from: '#D9C6FF', to: '#8B5CF6', tilt: '1deg' },
  ];

  return (
    <div className="showcase" aria-hidden>
      <div className="showcase__strip">
        {frames.map((frame, i) => (
          <div
            key={i}
            className="showcase__frame"
            style={{
              background: `linear-gradient(155deg, ${frame.from}, ${frame.to})`,
              ['--tilt' as string]: frame.tilt,
              animationDelay: `${i * 0.35}s`,
            }}
          >
            <span className="showcase__face" />
          </div>
        ))}
        <div className="showcase__footer">
          <Logo size={18} />
          <span>MAKE A MOMENT</span>
        </div>
      </div>

      {SHOWCASE_STICKERS.map((id, i) => {
        const asset = BUILT_IN_STICKERS.find((s) => s.id === id);
        if (!asset) return null;
        return (
          <img
            key={id}
            src={asset.src}
            alt=""
            className={`showcase__sticker showcase__sticker--${i + 1}`}
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        );
      })}
    </div>
  );
}
