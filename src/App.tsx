import { Suspense, lazy, useCallback, useEffect } from 'react';
import { usePhotobooth } from './state/photoboothStore';
import { CameraManager } from './lib/camera/CameraManager';
import { unlockAudio } from './lib/utils/feedback';
import { isCameraLive } from './state/machine';
import { Landing } from './components/landing/Landing';
import { ToastStack } from './components/ui/ToastStack';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

const PhotoboothScreen = lazy(() =>
  import('./components/photobooth/PhotoboothScreen').then((m) => ({ default: m.PhotoboothScreen })),
);
const PhotoStripEditor = lazy(() =>
  import('./components/editor/PhotoStripEditor').then((m) => ({ default: m.PhotoStripEditor })),
);
const StripChooser = lazy(() =>
  import('./components/editor/StripChooser').then((m) => ({ default: m.StripChooser })),
);
const FinalScreen = lazy(() =>
  import('./components/editor/FinalScreen').then((m) => ({ default: m.FinalScreen })),
);

function ScreenFallback({ label }: { label: string }) {
  return (
    <div className="screen-fallback" role="status" aria-live="polite">
      <div className="screen-fallback__spinner" aria-hidden />
      <p>Loading {label}…</p>
    </div>
  );
}

export default function App() {
  const status = usePhotobooth((s) => s.status);
  const transition = usePhotobooth((s) => s.transition);
  const reset = usePhotobooth((s) => s.reset);

  const cameraSupported = CameraManager.isSupported() && CameraManager.isSecure();

  const openBooth = useCallback(() => {
    // Audio has to be unlocked inside a real gesture or the shutter is silent.
    unlockAudio();
    transition('CHOOSING_STRIP');
  }, [transition]);

  const startShooting = useCallback(() => {
    transition('CAMERA_PERMISSION');
  }, [transition]);

  const exitBooth = useCallback(() => {
    reset();
  }, [reset]);

  // The strip survives a reset, so a second run goes straight back to the camera
  // rather than asking you to pick the same template again.
  const takeAnother = useCallback(() => {
    reset();
    unlockAudio();
    transition('CAMERA_PERMISSION');
  }, [reset, transition]);

  // Warn before a refresh throws away un-downloaded photos.
  const photos = usePhotobooth((s) => s.photos);
  useEffect(() => {
    const hasUnsaved = photos.some(Boolean);
    const risky =
      (status === 'REVIEW' || status === 'EDITING' || status === 'CAPTURED') && hasUnsaved;
    if (!risky) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status, photos]);

  // Persist unsaved roll across accidental reloads / visibility hidden.
  useEffect(() => {
    const onVisibilityHidden = () => {
      if (document.visibilityState !== 'hidden') return;
      const { photos: current } = usePhotobooth.getState();
      if (
        current.some(Boolean) &&
        (status === 'REVIEW' || status === 'EDITING' || status === 'CAPTURED')
      ) {
        try {
          sessionStorage.setItem('booth-draft', JSON.stringify({ status, at: Date.now() }));
        } catch {
          /* quota or privacy mode */
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityHidden);
    return () => document.removeEventListener('visibilitychange', onVisibilityHidden);
  }, [status]);

  const inBooth = isCameraLive(status);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to the photobooth
      </a>

      {status === 'IDLE' ? <Landing onOpen={openBooth} cameraSupported={cameraSupported} /> : null}

      {status === 'CHOOSING_STRIP' ? (
        <ErrorBoundary label="Strip chooser" onReset={exitBooth}>
          <Suspense fallback={<ScreenFallback label="strip options" />}>
            <StripChooser onStart={startShooting} onBack={exitBooth} />
          </Suspense>
        </ErrorBoundary>
      ) : null}

      {inBooth ? (
        <ErrorBoundary label="Photobooth" onReset={exitBooth}>
          <Suspense fallback={<ScreenFallback label="camera" />}>
            <PhotoboothScreen onExit={exitBooth} />
          </Suspense>
        </ErrorBoundary>
      ) : null}

      {status === 'EDITING' ? (
        <ErrorBoundary label="Editor" onReset={() => transition('REVIEW')}>
          <Suspense fallback={<ScreenFallback label="editor" />}>
            <PhotoStripEditor onExport={() => transition('EXPORTING')} />
          </Suspense>
        </ErrorBoundary>
      ) : null}

      {status === 'EXPORTING' || status === 'COMPLETE' ? (
        <ErrorBoundary label="Export" onReset={() => transition('EDITING')}>
          <Suspense fallback={<ScreenFallback label="strip" />}>
            <FinalScreen onTakeAnother={takeAnother} onBackToEditor={() => transition('EDITING')} />
          </Suspense>
        </ErrorBoundary>
      ) : null}

      <ToastStack />
    </div>
  );
}
