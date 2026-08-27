import { useCallback, useMemo, useState } from 'react';
import type { StripTextItem } from '../../types/photobooth';
import type { StickerAsset, StickerLayer } from '../../types/stickers';
import { usePhotobooth, makeId } from '../../state/photoboothStore';
import { stickerManager } from '../../lib/stickers/StickerManager';
import { bringForward, reindex, sendBackward, topZ } from '../../lib/stickers/StickerRenderer';
import { STRIP_FONTS } from '../../lib/export/stripLayouts';
import { readableInk } from '../../lib/export/StripRenderer';
import { haptic, playPop } from '../../lib/utils/feedback';
import { useDecodedPhotos } from './useDecodedPhotos';
import { PhotoStripPreview } from './PhotoStripPreview';
import type { StripSelection } from './PhotoStripPreview';
import { LayoutControls, SizeControls, StyleControls } from './StripStyleControls';
import { TextControls } from './StripTextControls';
import { StickerPanel } from '../photobooth/StickerPanel';
import { Button, IconButton, LiveRegion } from '../ui/Primitives';
import {
  IconBackward,
  IconChevronRight,
  IconCopy,
  IconForward,
  IconLayout,
  IconPalette,
  IconRetake,
  IconSticker,
  IconText,
  IconTrash,
} from '../ui/Icons';

type Tab = 'layout' | 'style' | 'text' | 'stickers';

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'layout', label: 'Layout', icon: <IconLayout size={18} /> },
  { id: 'style', label: 'Style', icon: <IconPalette size={18} /> },
  { id: 'text', label: 'Text', icon: <IconText size={18} /> },
  { id: 'stickers', label: 'Stickers', icon: <IconSticker size={18} /> },
];

export function PhotoStripEditor({ onExport }: { onExport: () => void }) {
  const photos = usePhotobooth((s) => s.photos);
  const style = usePhotobooth((s) => s.stripStyle);
  const size = usePhotobooth((s) => s.stripSize);
  const texts = usePhotobooth((s) => s.stripTexts);
  const stickers = usePhotobooth((s) => s.stripStickers);
  const settings = usePhotobooth((s) => s.settings);
  const setStripStyle = usePhotobooth((s) => s.setStripStyle);
  const setStripLayout = usePhotobooth((s) => s.setStripLayout);
  const setStripSize = usePhotobooth((s) => s.setStripSize);
  const setStripTexts = usePhotobooth((s) => s.setStripTexts);
  const setStripStickers = usePhotobooth((s) => s.setStripStickers);
  const pushToast = usePhotobooth((s) => s.pushToast);

  const [tab, setTab] = useState<Tab>('layout');
  const [selection, setSelection] = useState<StripSelection>(null);
  const [stickerSheet, setStickerSheet] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const { images, ready } = useDecodedPhotos(photos);
  const createdAt = useMemo(() => Date.now(), []);

  const selectedSticker =
    selection?.kind === 'sticker' ? stickers.find((s) => s.id === selection.id) ?? null : null;

  const addText = useCallback(() => {
    const item: StripTextItem = {
      id: makeId('text'),
      text: 'hello',
      fontFamily: STRIP_FONTS[0].stack,
      size: 0.06,
      align: 'center',
      rotation: 0,
      letterSpacing: 0,
      // Default to whatever will actually be legible on this background.
      color: readableInk(style.background) === '#16151A' ? '#16151A' : '#FBF7F2',
      x: 0.5,
      y: 0.5,
    };
    setStripTexts([...texts, item]);
    setSelection({ kind: 'text', id: item.id });
    setTab('text');
    playPop(settings.soundEnabled);
    setAnnouncement('Text added');
  }, [texts, setStripTexts, style.background, settings.soundEnabled]);

  const patchText = useCallback(
    (id: string, patch: Partial<StripTextItem>) => {
      setStripTexts(texts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    [texts, setStripTexts],
  );

  const deleteText = useCallback(
    (id: string) => {
      setStripTexts(texts.filter((t) => t.id !== id));
      setSelection(null);
    },
    [texts, setStripTexts],
  );

  const addSticker = useCallback(
    async (asset: StickerAsset) => {
      try {
        await stickerManager.load(asset.src);
      } catch {
        pushToast('That sticker could not be loaded.', 'error');
        return;
      }
      const layer = stickerManager.createLayer(asset, {
        zIndex: topZ(stickers),
        x: 0.5,
        y: 0.5,
        // Strip stickers read smaller than booth stickers at the same fraction.
        scale: asset.aspect > 1.6 ? 0.34 : 0.2,
      });
      setStripStickers([...stickers, layer]);
      setSelection({ kind: 'sticker', id: layer.id });
      playPop(settings.soundEnabled);
      haptic(settings.hapticsEnabled, 'tick');
      setAnnouncement(`${asset.name} added to the strip`);
    },
    [stickers, setStripStickers, pushToast, settings.soundEnabled, settings.hapticsEnabled],
  );

  const duplicateSticker = useCallback(() => {
    if (!selectedSticker) return;
    const copy: StickerLayer = {
      ...selectedSticker,
      id: makeId('sticker'),
      x: Math.min(0.95, selectedSticker.x + 0.06),
      y: Math.min(0.97, selectedSticker.y + 0.04),
      zIndex: topZ(stickers),
      bornAt: performance.now(),
    };
    setStripStickers([...stickers, copy]);
    setSelection({ kind: 'sticker', id: copy.id });
  }, [selectedSticker, stickers, setStripStickers]);

  const deleteSticker = useCallback(() => {
    if (!selectedSticker) return;
    setStripStickers(reindex(stickers.filter((s) => s.id !== selectedSticker.id)));
    setSelection(null);
  }, [selectedSticker, stickers, setStripStickers]);

  return (
    <div className="editor" id="main">
      <header className="editor__top">
        <IconButton
          tone="light"
          label="Back to the camera"
          onClick={() => {
            usePhotobooth.getState().transition('READY');
          }}
        >
          <IconRetake size={18} />
        </IconButton>
        <h1>Your strip</h1>
        <Button size="sm" onClick={onExport} disabled={!ready}>
          Done
          <IconChevronRight size={16} />
        </Button>
      </header>

      <div className="editor__body">
        <section className="editor__stage" aria-label="Strip preview">
          <PhotoStripPreview
            photos={images}
            style={style}
            texts={texts}
            stickers={stickers}
            createdAt={createdAt}
            selection={selection}
            onSelect={setSelection}
            onStickersChange={setStripStickers}
            onTextsChange={setStripTexts}
            onManipulate={() => haptic(settings.hapticsEnabled, 'tick')}
          />
          <p className="editor__stage-hint">
            Drag anything on the strip. Tap an empty area to deselect.
          </p>
        </section>

        <aside className="editor__panel">
          <div className="editor__tabs" role="tablist" aria-label="Strip options">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                role="tab"
                type="button"
                aria-selected={entry.id === tab}
                className={entry.id === tab ? 'is-selected' : ''}
                onClick={() => setTab(entry.id)}
              >
                {entry.icon}
                <span>{entry.label}</span>
              </button>
            ))}
          </div>

          <div className="editor__panel-body">
            {tab === 'layout' ? (
              <>
                <LayoutControls layout={style.layout} onChange={setStripLayout} />
                <SizeControls size={size} onChange={setStripSize} />
              </>
            ) : null}

            {tab === 'style' ? <StyleControls style={style} onChange={setStripStyle} /> : null}

            {tab === 'text' ? (
              <TextControls
                texts={texts}
                selectedId={selection?.kind === 'text' ? selection.id : null}
                onAdd={addText}
                onSelect={(id) => setSelection({ kind: 'text', id })}
                onChange={patchText}
                onDelete={deleteText}
              />
            ) : null}

            {tab === 'stickers' ? (
              <div className="panel">
                <Button variant="secondary" full icon={<IconSticker size={17} />} onClick={() => setStickerSheet(true)}>
                  Browse stickers
                </Button>

                {selectedSticker ? (
                  <div className="panel__row panel__row--wrap">
                    <IconButton
                      tone="light"
                      label="Send backward"
                      onClick={() => setStripStickers(sendBackward(stickers, selectedSticker.id))}
                    >
                      <IconBackward size={17} />
                    </IconButton>
                    <IconButton
                      tone="light"
                      label="Bring forward"
                      onClick={() => setStripStickers(bringForward(stickers, selectedSticker.id))}
                    >
                      <IconForward size={17} />
                    </IconButton>
                    <IconButton tone="light" label="Duplicate" onClick={duplicateSticker}>
                      <IconCopy size={17} />
                    </IconButton>
                    <IconButton tone="light" label="Delete" onClick={deleteSticker}>
                      <IconTrash size={17} />
                    </IconButton>
                  </div>
                ) : (
                  <p className="panel__empty">
                    {stickers.length === 0
                      ? 'Add a sticker, then drag it onto any photo.'
                      : 'Tap a sticker on the strip to edit it.'}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <StickerPanel
        open={stickerSheet}
        onClose={() => setStickerSheet(false)}
        onPick={(asset) => void addSticker(asset)}
        onNotice={pushToast}
      />

      <LiveRegion message={announcement} />
    </div>
  );
}
