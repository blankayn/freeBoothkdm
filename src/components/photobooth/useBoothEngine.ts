import { useCallback, useEffect, useRef, useState } from 'react';
import { BoothEngine } from '../../lib/booth/BoothEngine';
import { isCameraError } from '../../lib/camera/CameraManager';
import { usePhotobooth } from '../../state/photoboothStore';
import { stickerManager } from '../../lib/stickers/StickerManager';
import { looksLowPowered } from '../../lib/mediapipe/config';
import type { GestureId } from '../../lib/mediapipe/GestureManager';

export interface BoothHandle {
  engine: BoothEngine | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  frameRef: React.RefObject<HTMLDivElement>;
  gesture: GestureId;
  rendererKind: 'webgl' | 'canvas2d' | 'none';
  starting: boolean;
  switchCamera: () => Promise<void>;
  retry: () => Promise<void>;
}

/**
 * Wires the booth engine to React and to the store.
 *
 * The engine is created once and never re-created; React only pushes config into
 * it and reads events back out. That separation is what keeps a 60 fps render
 * loop from being at the mercy of the component tree re-rendering.
 */
export function useBoothEngine(active: boolean): BoothHandle {
  const engineRef = useRef<BoothEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const [rendererKind, setRendererKind] = useState<'webgl' | 'canvas2d' | 'none'>('none');
  const [gesture, setGesture] = useState<GestureId>('NONE');
  const [starting, setStarting] = useState(false);

  const status = usePhotobooth((s) => s.status);
  const filter = usePhotobooth((s) => s.filter);
  const intensity = usePhotobooth((s) => s.intensities[s.filter]);
  const liveStickers = usePhotobooth((s) => s.liveStickers);
  const selectedStickerId = usePhotobooth((s) => s.selectedStickerId);
  const settings = usePhotobooth((s) => s.settings);
  const cameraFacing = usePhotobooth((s) => s.camera.facing);

  // --- one-time setup ------------------------------------------------------
  // Engine must be created inside an effect, not during render, so StrictMode's
  // double-invoke of render does not leak a hidden <video> + MediaStream.
  useEffect(() => {
    const engine = new BoothEngine();
    engineRef.current = engine;

    // iOS refuses to decode a <video> that is not in the document.
    document.body.appendChild(engine.video);

    const kind = engine.initRenderer();
    setRendererKind(kind);
    if (kind === 'canvas2d') {
      usePhotobooth
        .getState()
        .pushToast('WebGL is unavailable — filters are running in a simpler mode.', 'warn');
    }

    void stickerManager.preload();

    if (import.meta.env.DEV) {
      // Dev-only handle. Lets the pipeline be driven from the console with a
      // synthetic stream on machines (or headless panes) with no camera.
      (window as unknown as Record<string, unknown>).__booth = { engine, store: usePhotobooth };
    }

    return () => {
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
      if (import.meta.env.DEV) {
        const w = window as unknown as Record<string, unknown>;
        if ((w.__booth as { engine?: unknown } | undefined)?.engine === engine) delete w.__booth;
      }
    };
  }, []);

  // --- callbacks -----------------------------------------------------------
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setCallbacks({
      onStickersChanged: (next) => usePhotobooth.getState().setLiveStickers(next),
      onNextFilter: () => usePhotobooth.getState().cycleFilter(1),
      onFps: (fps) => usePhotobooth.getState().setFps(fps),
      onGesture: (state) => setGesture(state.gesture),
      onTrackingStateChanged: (ok) => usePhotobooth.getState().setTrackingActive(ok),
    });
  }, []);

  // --- push config ---------------------------------------------------------
  useEffect(() => {
    engineRef.current?.setConfig({
      filter,
      intensity,
      stickers: liveStickers,
      selectedStickerId,
      mirrorFrontCamera: settings.mirrorFrontCamera,
      handTracking: settings.handTracking,
      faceTracking: settings.faceTracking,
      showChrome: status === 'READY',
      cameraZoom: settings.cameraZoom,
    });
  }, [
    filter,
    intensity,
    liveStickers,
    selectedStickerId,
    settings.mirrorFrontCamera,
    settings.handTracking,
    settings.faceTracking,
    settings.cameraZoom,
    status,
  ]);

  // --- camera lifecycle ----------------------------------------------------
  const startCamera = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const store = usePhotobooth.getState();
    setStarting(true);
    store.setCamera({ error: null });
    try {
      await engine.camera.start({ facing: store.camera.facing });
      store.setCamera({
        ready: true,
        error: null,
        facing: engine.camera.currentFacing,
        deviceId: engine.camera.currentDeviceId,
      });
      engine.start();
      if (usePhotobooth.getState().status === 'CAMERA_PERMISSION') {
        store.transition('READY');
      }
    } catch (err) {
      const error = isCameraError(err)
        ? err
        : { kind: 'unknown' as const, message: 'The camera could not be started.' };
      store.setCamera({ ready: false, error });
    } finally {
      setStarting(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const engine = engineRef.current;
    if (!engine) return;
    if (!engine.camera.isActive) {
      void startCamera();
    } else {
      engine.start();
    }
    return () => {
      engine.stop();
    };
  }, [active, startCamera]);

  // Release the camera entirely once the booth is done with it.
  useEffect(() => {
    if (active) return;
    const engine = engineRef.current;
    if (!engine) return;
    engine.stop();
    engine.camera.stop();
    usePhotobooth.getState().setCamera({ ready: false });
  }, [active]);

  // --- sizing --------------------------------------------------------------
  useEffect(() => {
    const engine = engineRef.current;
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!engine || !frame || !canvas) return;

    engine.attachCanvas(canvas);

    const apply = () => {
      const rect = frame.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        engine.resizePreview(rect.width, rect.height, window.devicePixelRatio || 1);
      }
    };
    apply();

    const observer = new ResizeObserver(apply);
    observer.observe(frame);
    window.addEventListener('orientationchange', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', apply);
    };
  }, [active]);

  // Stop burning battery when the booth scrolls out of view.
  useEffect(() => {
    const engine = engineRef.current;
    const frame = frameRef.current;
    if (!engine || !frame || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => engine.setVisible(entries[0]?.isIntersecting ?? true),
      { threshold: 0.05 },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [active]);

  // --- tracking ------------------------------------------------------------
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !settings.handTracking) return;
    let cancelled = false;
    void engine.enableHandTracking().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        const store = usePhotobooth.getState();
        store.pushToast('Hand tracking could not load. The booth still works normally.', 'warn');
        store.updateSettings({ handTracking: false });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settings.handTracking]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !settings.faceTracking) return;
    let cancelled = false;
    void engine.enableFaceTracking().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        const store = usePhotobooth.getState();
        store.pushToast('Face tracking is unavailable on this device.', 'warn');
        store.updateSettings({ faceTracking: false });
      } else if (looksLowPowered()) {
        usePhotobooth
          .getState()
          .pushToast('Face tracking is on, but this device may run slowly.', 'info');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settings.faceTracking]);

  // --- actions -------------------------------------------------------------
  const switchCamera = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const store = usePhotobooth.getState();
    try {
      const facing = await engine.camera.switchCamera();
      store.setCamera({ facing, deviceId: engine.camera.currentDeviceId });
    } catch (err) {
      const error = isCameraError(err)
        ? err
        : { kind: 'unknown' as const, message: 'Could not switch cameras.' };
      store.pushToast(error.message, 'error');
    }
  }, []);

  useEffect(() => {
    // Keep the store's idea of facing in step if the browser overrode our ask.
    const engine = engineRef.current;
    if (engine && engine.camera.isActive && engine.camera.currentFacing !== cameraFacing) {
      usePhotobooth.getState().setCamera({ facing: engine.camera.currentFacing });
    }
  }, [cameraFacing]);

  return {
    engine: engineRef.current,
    canvasRef,
    frameRef,
    gesture,
    rendererKind,
    starting,
    switchCamera,
    retry: startCamera,
  };
}
