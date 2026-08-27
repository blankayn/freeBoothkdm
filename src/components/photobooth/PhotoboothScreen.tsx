import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AttachmentTarget, StickerAsset, StickerLayer } from '../../types/stickers';
import { SHOT_COUNT } from '../../types/photobooth';
import { usePhotobooth } from '../../state/photoboothStore';
import { stickerManager } from '../../lib/stickers/StickerManager';
import { bringForward, reindex, sendBackward, topZ } from '../../lib/stickers/StickerRenderer';
import { FILTER_BY_ID } from '../../lib/filters/filterCatalog';
import { haptic, playChime, playPop, playShutter, playTick } from '../../lib/utils/feedback';
import { useBoothEngine } from './useBoothEngine';
import { useStickerInteraction, applyKeyboardTransform } from './useStickerInteraction';
import { CameraPreview } from './CameraPreview';
import { CameraControls } from './CameraControls';
import { CaptureButton } from './CaptureButton';
import { FilterCarousel } from './FilterCarousel';
import { ShotProgress } from './ShotProgress';
import { StickerPanel } from './StickerPanel';
import { StickerToolbar } from './StickerToolbar';
import { SettingsSheet } from './SettingsSheet';
import { ReviewSheet } from './ReviewSheet';
import { Button, IconButton, LiveRegion } from '../ui/Primitives';
import { IconSticker } from '../ui/Icons';
import { isCameraLive } from '../../state/machine';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function PhotoboothScreen({ onExit }: { onExit: () => void }) {
  const status = usePhotobooth((s) => s.status);
  const photos = usePhotobooth((s) => s.photos);
  const activeShot = usePhotobooth((s) => s.activeShot);
  const retakeTarget = usePhotobooth((s) => s.retakeTarget);
  const filter = usePhotobooth((s) => s.filter);
  const intensity = usePhotobooth((s) => s.intensities[s.filter]);
  const liveStickers = usePhotobooth((s) => s.liveStickers);
  const selectedStickerId = usePhotobooth((s) => s.selectedStickerId);
  const settings = usePhotobooth((s) => s.settings);
  const cameraError = usePhotobooth((s) => s.camera.error);
  const fps = usePhotobooth((s) => s.fps);

  const setFilter = usePhotobooth((s) => s.setFilter);
  const setIntensity = usePhotobooth((s) => s.setIntensity);
  const setLiveStickers = usePhotobooth((s) => s.setLiveStickers);
  const selectSticker = usePhotobooth((s) => s.selectSticker);
  const updateSettings = usePhotobooth((s) => s.updateSettings);
  const pushToast = usePhotobooth((s) => s.pushToast);

  const boothActive = isCameraLive(status);
  const booth = useBoothEngine(boothActive);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [freezeUrl, setFreezeUrl] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const cancelRef = useRef(false);
  const capturingRef = useRef(false);

  const selectedSticker = useMemo(
    () => liveStickers.find((l) => l.id === selectedStickerId) ?? null,
    [liveStickers, selectedStickerId],
  );

  const sticker = useStickerInteraction({
    surfaceRef: booth.frameRef,
    layers: liveStickers,
    onChange: setLiveStickers,
    selectedId: selectedStickerId,
    onSelect: selectSticker,
    onDelete: (id) => {
      setLiveStickers(reindex(liveStickers.filter((l) => l.id !== id)));
      haptic(settings.hapticsEnabled, 'tick');
    },
    onManipulate: () => haptic(settings.hapticsEnabled, 'tick'),
    enabled: status === 'READY',
  });

  // --- capture -------------------------------------------------------------
  const abortCountdown = useCallback(() => {
    cancelRef.current = true;
    setCountdown(null);
    const store = usePhotobooth.getState();
    if (store.status === 'COUNTDOWN') store.transition('READY');
  }, []);

  const runCapture = useCallback(async () => {
    const store = usePhotobooth.getState();
    if (capturingRef.current) return;
    if (store.status !== 'READY' || !booth.engine || store.camera.error) return;
    if (!store.transition('COUNTDOWN')) return;

    capturingRef.current = true;
    cancelRef.current = false;
    const { soundEnabled, hapticsEnabled, countdownSeconds } = store.settings;

    try {
      for (let i = countdownSeconds; i >= 1; i--) {
        setCountdown(i);
        setAnnouncement(String(i));
        playTick(soundEnabled, 620 + (countdownSeconds - i) * 90);
        haptic(hapticsEnabled, 'tick');
        await wait(1000);
        if (cancelRef.current) return;
      }

      setCountdown(0);
      setAnnouncement('Snap');
      playTick(soundEnabled, 1180);
      await wait(countdownSeconds > 0 ? 420 : 120);
      if (cancelRef.current) return;
      setCountdown(null);

      setFlashing(true);
      const result = await booth.engine.capture();
      playShutter(soundEnabled);
      haptic(hapticsEnabled, 'capture');

      const url = URL.createObjectURL(result.blob);
      const slot = store.retakeTarget ?? store.activeShot;
      usePhotobooth.getState().addPhoto(
        {
          url,
          blob: result.blob,
          width: result.width,
          height: result.height,
          filter: usePhotobooth.getState().filter,
          takenAt: Date.now(),
        },
        slot,
      );
      usePhotobooth.getState().transition('CAPTURED');

      setFreezeUrl(url);
      await wait(360);
      setFlashing(false);
      await wait(420);
      setFreezeUrl(null);

      const complete = usePhotobooth.getState().photos.every(Boolean);
      setAnnouncement(
        complete ? 'All four shots are done' : `Shot ${slot + 1} saved`,
      );

      if (complete) {
        setCelebrating(true);
        playChime(soundEnabled);
        haptic(hapticsEnabled, 'success');
        await wait(1100);
        setCelebrating(false);
        usePhotobooth.getState().transition('REVIEW');
      } else {
        usePhotobooth.getState().transition('READY');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'That shot did not work.', 'error');
      usePhotobooth.getState().transition('READY');
    } finally {
      setFlashing(false);
      setCountdown(null);
      capturingRef.current = false;
      if (cancelRef.current) {
        const s = usePhotobooth.getState();
        if (s.status === 'COUNTDOWN') s.transition('READY');
      }
    }
  }, [booth.engine, pushToast]);

  // --- stickers ------------------------------------------------------------
  const addSticker = useCallback(
    async (asset: StickerAsset) => {
      try {
        await stickerManager.load(asset.src);
      } catch {
        pushToast('That sticker could not be loaded.', 'error');
        return;
      }
      const state = usePhotobooth.getState();
      const suggestion = asset.suggestedAttachment;
      const canAttach =
        suggestion === 'face' || suggestion === 'head'
          ? state.settings.faceTracking
          : suggestion === 'hand' || suggestion === 'finger'
            ? state.settings.handTracking
            : false;

      const layer = stickerManager.createLayer(asset, {
        zIndex: topZ(state.liveStickers),
        attachment: canAttach ? suggestion : 'none',
        // Offset each new sticker slightly so a stack is visibly a stack.
        x: 0.5 + ((state.liveStickers.length % 3) - 1) * 0.06,
        y: 0.44 + (state.liveStickers.length % 2) * 0.06,
      });

      setLiveStickers([...state.liveStickers, layer]);
      selectSticker(layer.id);
      playPop(state.settings.soundEnabled);
      haptic(state.settings.hapticsEnabled, 'tick');
      setAnnouncement(`${asset.name} sticker added`);
    },
    [pushToast, setLiveStickers, selectSticker],
  );

  const patchSelected = useCallback(
    (patch: Partial<StickerLayer>) => {
      if (!selectedStickerId) return;
      setLiveStickers(
        liveStickers.map((l) => (l.id === selectedStickerId ? { ...l, ...patch } : l)),
      );
    },
    [liveStickers, selectedStickerId, setLiveStickers],
  );

  const attachSelected = useCallback(
    (target: AttachmentTarget) => {
      if (!selectedSticker) return;
      const point =
        target === 'face'
          ? ('eyes' as const)
          : target === 'head'
            ? ('forehead' as const)
            : target === 'hand'
              ? ('palm' as const)
              : target === 'finger'
                ? ('index-tip' as const)
                : undefined;
      patchSelected({ attachment: target, attachmentPoint: point });
      haptic(settings.hapticsEnabled, 'tick');
    },
    [selectedSticker, patchSelected, settings.hapticsEnabled],
  );

  const duplicateSelected = useCallback(() => {
    if (!selectedSticker) return;
    const copy: StickerLayer = {
      ...selectedSticker,
      id: `${selectedSticker.id}-copy-${Date.now().toString(36)}`,
      x: Math.min(0.94, selectedSticker.x + 0.07),
      y: Math.min(0.94, selectedSticker.y + 0.07),
      zIndex: topZ(liveStickers),
      bornAt: performance.now(),
    };
    setLiveStickers([...liveStickers, copy]);
    selectSticker(copy.id);
    playPop(settings.soundEnabled);
  }, [selectedSticker, liveStickers, setLiveStickers, selectSticker, settings.soundEnabled]);

  const deleteSelected = useCallback(() => {
    if (!selectedStickerId) return;
    setLiveStickers(reindex(liveStickers.filter((l) => l.id !== selectedStickerId)));
    selectSticker(null);
    haptic(settings.hapticsEnabled, 'tick');
  }, [selectedStickerId, liveStickers, setLiveStickers, selectSticker, settings.hapticsEnabled]);

  // --- keyboard ------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (typing) return;
      if (stickersOpen || settingsOpen) return;

      const store = usePhotobooth.getState();

      if (event.key === 'Escape') {
        if (store.status === 'COUNTDOWN') {
          event.preventDefault();
          abortCountdown();
        } else if (store.selectedStickerId) {
          event.preventDefault();
          selectSticker(null);
        }
        return;
      }

      if (event.key === ' ' || event.key === 'Enter') {
        // Let real buttons keep their own activation behaviour.
        if (target?.tagName === 'BUTTON') return;
        event.preventDefault();
        if (store.status === 'COUNTDOWN') abortCountdown();
        else void runCapture();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && store.selectedStickerId) {
        event.preventDefault();
        deleteSelected();
        return;
      }

      if (store.selectedStickerId) {
        const next = applyKeyboardTransform(
          store.liveStickers,
          store.selectedStickerId,
          event.key,
          event.shiftKey,
        );
        if (next) {
          event.preventDefault();
          setLiveStickers(next);
          return;
        }
      }

      if (event.key === 'ArrowRight' && target?.getAttribute('role') !== 'radio') {
        event.preventDefault();
        store.cycleFilter(1);
      } else if (event.key === 'ArrowLeft' && target?.getAttribute('role') !== 'radio') {
        event.preventDefault();
        store.cycleFilter(-1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    abortCountdown,
    runCapture,
    deleteSelected,
    selectSticker,
    setLiveStickers,
    stickersOpen,
    settingsOpen,
  ]);

  // Announce filter changes (a gesture can change them without a click).
  useEffect(() => {
    setAnnouncement(`${FILTER_BY_ID[filter].label} filter`);
  }, [filter]);

  const counting = status === 'COUNTDOWN';
  const busy = status === 'CAPTURED';
  const shotNumber = Math.min((retakeTarget ?? activeShot) + 1, SHOT_COUNT);

  return (
    <div className="booth dark-scope" id="main">
      <CameraControls
        onClose={onExit}
        onSwitchCamera={() => void booth.switchCamera()}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleSound={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
        canSwitch={booth.engine?.camera.canSwitch() ?? false}
        soundEnabled={settings.soundEnabled}
        handTrackingOn={settings.handTracking}
        gesture={booth.gesture}
        fps={fps}
        showDiagnostics={import.meta.env.DEV}
        rendererKind={booth.rendererKind}
      />

      <CameraPreview
        frameRef={booth.frameRef}
        canvasRef={booth.canvasRef}
        countdown={countdown}
        flashing={flashing}
        freezeUrl={freezeUrl}
        starting={booth.starting}
        error={cameraError}
        onRetry={() => void booth.retry()}
        onExit={onExit}
        pointerHandlers={sticker.handlers}
        celebrating={celebrating}
      />

      <div className="booth__bottom">
        <ShotProgress
          photos={photos}
          activeShot={retakeTarget ?? activeShot}
          retakeTarget={retakeTarget}
          onSelect={(index) => {
            usePhotobooth.getState().beginRetake(index);
            setAnnouncement(`Retaking shot ${index + 1}`);
          }}
        />

        {selectedSticker ? (
          <StickerToolbar
            layer={selectedSticker}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
            onForward={() => setLiveStickers(bringForward(liveStickers, selectedSticker.id))}
            onBackward={() => setLiveStickers(sendBackward(liveStickers, selectedSticker.id))}
            onAttach={attachSelected}
            faceTrackingOn={settings.faceTracking}
            handTrackingOn={settings.handTracking}
          />
        ) : (
          <FilterCarousel
            value={filter}
            onChange={setFilter}
            intensity={intensity}
            onIntensity={(v) => setIntensity(v)}
            handTrackingOn={settings.handTracking}
            disabled={counting}
          />
        )}

        <div className="booth__actions">
          <IconButton
            label="Stickers"
            active={stickersOpen || liveStickers.length > 0}
            onClick={() => setStickersOpen(true)}
          >
            <IconSticker />
          </IconButton>

          <CaptureButton
            onCapture={() => void runCapture()}
            onCancel={abortCountdown}
            busy={busy}
            counting={counting}
            disabled={!!cameraError || booth.starting || busy}
            shotNumber={shotNumber}
            totalShots={SHOT_COUNT}
          />

          <div className="booth__actions-right">
            {photos.some(Boolean) ? (
              <Button
                size="sm"
                variant="dark"
                onClick={() => usePhotobooth.getState().transition('REVIEW')}
                disabled={!photos.every(Boolean)}
              >
                Review
              </Button>
            ) : (
              <span className="booth__hint-inline">Press space to shoot</span>
            )}
          </div>
        </div>
      </div>

      <StickerPanel
        open={stickersOpen}
        onClose={() => setStickersOpen(false)}
        onPick={(asset) => void addSticker(asset)}
        onNotice={pushToast}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={updateSettings}
        rendererKind={booth.rendererKind}
        fps={fps}
      />

      <ReviewSheet
        open={status === 'REVIEW'}
        photos={photos}
        onRetakeOne={(index) => {
          usePhotobooth.getState().beginRetake(index);
          usePhotobooth.getState().transition('READY');
        }}
        onRetakeAll={() => {
          usePhotobooth.getState().beginRetake('all');
          usePhotobooth.getState().transition('READY');
        }}
        onContinue={() => usePhotobooth.getState().transition('EDITING')}
      />

      <LiveRegion message={announcement} />
    </div>
  );
}
