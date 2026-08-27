import { useRef, useState } from 'react';
import type { StickerAsset, StickerCategory } from '../../types/stickers';
import { STICKER_CATEGORIES, stickersByCategory } from '../../lib/stickers/stickerLibrary';
import { stickerManager } from '../../lib/stickers/StickerManager';
import { Sheet, Button } from '../ui/Primitives';
import { IconTrash, IconUpload } from '../ui/Icons';

interface StickerPanelProps {
  open: boolean;
  onClose: () => void;
  onPick: (asset: StickerAsset) => void;
  onNotice: (message: string, tone: 'info' | 'warn' | 'error' | 'success') => void;
}

export function StickerPanel({ open, onClose, onPick, onNotice }: StickerPanelProps) {
  const [category, setCategory] = useState<StickerCategory>('cute');
  const [custom, setCustom] = useState<StickerAsset[]>(stickerManager.customStickers);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const assets = category === 'custom' ? custom : stickersByCategory(category);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let added = 0;
    for (const file of Array.from(files).slice(0, 6)) {
      const result = await stickerManager.upload(file);
      if (result.ok && result.asset) {
        added++;
      } else if (result.error) {
        onNotice(result.error, 'warn');
      }
    }
    setCustom([...stickerManager.customStickers]);
    setUploading(false);
    if (added > 0) {
      setCategory('custom');
      onNotice(added === 1 ? 'Sticker added.' : `${added} stickers added.`, 'success');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeCustom = (id: string) => {
    stickerManager.removeCustom(id);
    setCustom([...stickerManager.customStickers]);
  };

  return (
    <Sheet
      open={open}
      title="Stickers"
      onClose={onClose}
      actions={
        <Button
          size="sm"
          variant="dark"
          icon={<IconUpload size={16} />}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Adding…' : 'Upload your own'}
        </Button>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        multiple
        className="sr-only"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <div className="stickers__tabs" role="tablist" aria-label="Sticker categories">
        {STICKER_CATEGORIES.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === category}
            className={tab.id === category ? 'is-selected' : ''}
            onClick={() => setCategory(tab.id)}
          >
            {tab.label}
            {tab.id === 'custom' && custom.length > 0 ? (
              <span className="stickers__count">{custom.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {assets.length === 0 ? (
        <div className="stickers__empty">
          <p>Nothing here yet.</p>
          <p className="stickers__empty-hint">
            Upload a transparent PNG or WebP and it will show up in this tab. Files stay on this
            device.
          </p>
          <Button
            variant="dark"
            icon={<IconUpload size={16} />}
            onClick={() => fileRef.current?.click()}
          >
            Choose a file
          </Button>
        </div>
      ) : (
        <ul className="stickers__grid">
          {assets.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                className="stickers__item"
                onClick={() => onPick(asset)}
                aria-label={`Add the ${asset.name} sticker`}
              >
                <img src={asset.src} alt="" loading="lazy" />
                <span>{asset.name}</span>
              </button>
              {category === 'custom' ? (
                <button
                  type="button"
                  className="stickers__remove"
                  aria-label={`Delete the ${asset.name} sticker`}
                  onClick={() => removeCustom(asset.id)}
                >
                  <IconTrash size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="stickers__note">
        PNG, WebP, or JPG up to 12&nbsp;MB. Large images are resized to 512&nbsp;px before they
        are stored.
      </p>
    </Sheet>
  );
}
