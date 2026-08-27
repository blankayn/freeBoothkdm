import { useEffect, useRef, useState } from 'react';
import { usePhotobooth } from '../../state/photoboothStore';
import { photoExporter } from '../../lib/export/PhotoExporter';
import type { ExportResult } from '../../lib/export/PhotoExporter';
import { STRIP_SIZE_BY_ID } from '../../lib/export/stripLayouts';
import { useDecodedPhotos } from './useDecodedPhotos';
import { haptic, playChime } from '../../lib/utils/feedback';
import { Button, LiveRegion } from '../ui/Primitives';
import { IconDownload, IconRetake, IconShare, IconChevronLeft } from '../ui/Icons';

interface FinalScreenProps {
  onTakeAnother: () => void;
  onBackToEditor: () => void;
}

export function FinalScreen({ onTakeAnother, onBackToEditor }: FinalScreenProps) {
  const status = usePhotobooth((s) => s.status);
  const photos = usePhotobooth((s) => s.photos);
  const style = usePhotobooth((s) => s.stripStyle);
  const size = usePhotobooth((s) => s.stripSize);
  const texts = usePhotobooth((s) => s.stripTexts);
  const stickers = usePhotobooth((s) => s.stripStickers);
  const settings = usePhotobooth((s) => s.settings);
  const pushToast = usePhotobooth((s) => s.pushToast);

  const { images, ready } = useDecodedPhotos(photos);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const startedRef = useRef(false);

  // Keep ref in sync so unmount cleanup always revokes the latest URL,
  // even though the effect closure would otherwise capture a stale value.
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // Render once, when we land here with everything decoded.
  useEffect(() => {
    if (startedRef.current || !ready || status !== 'EXPORTING') return;
    startedRef.current = true;

    const run = async () => {
      try {
        const width = STRIP_SIZE_BY_ID[size]?.width ?? 1200;
        const exported = await photoExporter.render({
          photos: images,
          document: { style, texts, stickers, createdAt: Date.now() },
          width,
        });
        setResult(exported);
        // Revoke previous preview if we re-run (e.g. after EDITING -> EXPORTING).
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(exported.blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        usePhotobooth.getState().transition('COMPLETE');
        playChime(settings.soundEnabled);
        haptic(settings.hapticsEnabled, 'success');
        setAnnouncement('Your strip is ready to download');
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'The strip could not be exported.', 'error');
        usePhotobooth.getState().transition('EDITING');
        startedRef.current = false;
      }
    };
    void run();
  }, [ready, status, images, style, texts, stickers, settings, pushToast, size]);

  // The preview URL is ours; release it when this screen goes away.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const download = () => {
    if (!result) return;
    photoExporter.download(result);
    setAnnouncement('Downloading your strip');
    haptic(settings.hapticsEnabled, 'tick');
  };

  const share = async () => {
    if (!result || busy) return;
    setBusy(true);
    try {
      const outcome = await photoExporter.share(result);
      if (outcome === 'downloaded') {
        pushToast('Sharing is not available here, so it downloaded instead.', 'info');
      } else if (outcome === 'shared') {
        setAnnouncement('Shared');
      }
    } finally {
      setBusy(false);
    }
  };

  const exporting = status === 'EXPORTING' || !result;

  return (
    <div className="final" id="main">
      <header className="final__top">
        <button className="final__back" onClick={onBackToEditor}>
          <IconChevronLeft size={17} />
          Keep editing
        </button>
      </header>

      <div className="final__stage">
        {exporting ? (
          <div className="final__loading">
            <div className="final__spinner" aria-hidden />
            <p>Developing your strip…</p>
          </div>
        ) : (
          <figure className="final__figure">
            <img src={previewUrl ?? ''} alt="Your finished strip, ready to download" />
            <figcaption>
              {result.width} × {result.height} PNG
            </figcaption>
          </figure>
        )}
      </div>

      <div className="final__actions">
        <Button size="lg" icon={<IconDownload size={19} />} onClick={download} disabled={exporting}>
          DOWNLOAD
        </Button>
        <Button
          size="lg"
          variant="secondary"
          icon={<IconShare size={19} />}
          onClick={() => void share()}
          disabled={exporting || busy}
        >
          SHARE
        </Button>
        <Button
          size="lg"
          variant="ghost"
          icon={<IconRetake size={19} />}
          onClick={onTakeAnother}
        >
          TAKE ANOTHER
        </Button>
      </div>

      <p className="final__note">
        Saved straight from your browser. Nothing was uploaded.
      </p>

      <LiveRegion message={announcement} />
    </div>
  );
}
