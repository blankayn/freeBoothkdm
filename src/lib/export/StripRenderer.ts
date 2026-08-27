import type { StripStyle, StripTextItem } from '../../types/photobooth';
import type { StickerLayer } from '../../types/stickers';
import { LAYOUT_BY_ID } from './stripLayouts';
import { stickerRenderer } from '../stickers/StickerRenderer';

export interface StripRenderInput {
  /** Four decoded photos, in order. Nulls render as empty slots. */
  photos: (CanvasImageSource | null)[];
  style: StripStyle;
  texts: StripTextItem[];
  stickers: StickerLayer[];
  date: Date;
}

export interface StripMetrics {
  width: number;
  height: number;
  pad: number;
  /** Full width of a cell, including the mount on polaroid layouts. */
  cellW: number;
  /** Full height of a cell, including the chin on polaroid layouts. */
  cardH: number;
  /** Symmetric white margin around the photo. Zero unless the layout mounts. */
  inset: number;
  photoW: number;
  photoH: number;
  footer: number;
  cols: number;
  rows: number;
  mounted: boolean;
}

/** Height the footer needs for whatever is switched on, in strip pixels. */
function footerContentHeight(style: StripStyle, width: number): number {
  let h = 0;
  if (style.showLogo) h += width * 0.047 + width * 0.016;
  if (style.title.trim()) h += width * 0.042 * 1.05;
  if (style.caption.trim()) h += width * 0.028 * 1.15;
  if (style.showDate) h += width * 0.023 * 1.4;
  return h;
}

/** Geometry only — the editor uses this to place things without drawing. */
export function measureStrip(style: StripStyle, width: number): StripMetrics {
  const layout = LAYOUT_BY_ID[style.layout];
  const pad = Math.max(2, style.gutter * width);
  const cols = layout.columns;
  const rows = layout.rows;
  const mounted = !!layout.perCellFooter;

  const cellW = (width - pad * (cols + 1)) / cols;
  const inset = mounted ? cellW * 0.055 : 0;
  const photoW = cellW - inset * 2;
  const photoH = photoW / layout.cellAspect;
  const chinExtra = (layout.perCellFooter ?? 0) * photoH;
  const cardH = mounted ? inset * 2 + photoH + chinExtra : photoH;

  // The footer is whichever is larger: the layout's stylistic allowance, or the
  // room its contents actually need. Without the second term, turning on a title
  // and a caption in a tight layout pushes text off the bottom of the strip.
  const footer = Math.max(pad * layout.footerScale, footerContentHeight(style, width) + pad * 0.7);

  const height = pad + rows * cardH + (rows - 1) * pad + footer;
  return { width, height, pad, cellW, cardH, inset, photoW, photoH, footer, cols, rows, mounted };
}

/**
 * Draws a complete photo strip at any size.
 *
 * Everything is expressed as a fraction of the strip width, so the on-screen
 * preview and the full-resolution export are the same drawing at two scales —
 * there is no separate export layout to keep in sync.
 */
export function renderStrip(
  ctx: CanvasRenderingContext2D,
  input: StripRenderInput,
  width: number,
): StripMetrics {
  const { style, photos, texts, stickers, date } = input;
  const m = measureStrip(style, width);
  const ink = readableInk(style.background);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, m.width, m.height);

  // Background
  if (style.backgroundAlt) {
    const gradient = ctx.createLinearGradient(0, 0, 0, m.height);
    gradient.addColorStop(0, style.background);
    gradient.addColorStop(1, style.backgroundAlt);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = style.background;
  }
  roundRectPath(ctx, 0, 0, m.width, m.height, style.cornerRadius * width);
  ctx.fill();

  // Photos
  const photoRadius = style.photoRadius * width;
  for (let i = 0; i < m.cols * m.rows; i++) {
    const col = i % m.cols;
    const row = Math.floor(i / m.cols);
    const cellX = m.pad + col * (m.cellW + m.pad);
    const cellY = m.pad + row * (m.cardH + m.pad);
    const x = cellX + m.inset;
    const y = cellY + m.inset;

    // Polaroid layouts sit each shot on a physical-looking white mount. The soft
    // shadow is what keeps the mount visible when the strip background is also
    // pale, instead of the chin dissolving into it.
    if (m.mounted) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
      ctx.shadowBlur = m.cellW * 0.03;
      ctx.shadowOffsetY = m.cellW * 0.008;
      ctx.fillStyle = '#FFFFFF';
      roundRectPath(ctx, cellX, cellY, m.cellW, m.cardH, m.cellW * 0.02);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    roundRectPath(ctx, x, y, m.photoW, m.photoH, photoRadius);
    ctx.clip();

    const photo = photos[i];
    if (photo) {
      drawCover(ctx, photo, x, y, m.photoW, m.photoH);
    } else {
      ctx.fillStyle = m.mounted ? 'rgba(22,21,26,0.08)' : withAlpha(ink, 0.08);
      ctx.fillRect(x, y, m.photoW, m.photoH);
      ctx.fillStyle = m.mounted ? 'rgba(22,21,26,0.3)' : withAlpha(ink, 0.34);
      ctx.font = `600 ${m.photoW * 0.06}px "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, x + m.photoW / 2, y + m.photoH / 2);
    }
    ctx.restore();

    if (style.borderWidth > 0) {
      ctx.save();
      ctx.strokeStyle = m.mounted ? 'rgba(22,21,26,0.12)' : style.frameColor;
      ctx.lineWidth = style.borderWidth * width;
      roundRectPath(ctx, x, y, m.photoW, m.photoH, photoRadius);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawFooter(ctx, m, style, ink, date);

  // Text and stickers sit above everything, in strip-normalised space.
  for (const item of texts) drawTextItem(ctx, item, m);
  stickerRenderer.draw(ctx, stickers, m.width, m.height, { showChrome: false });

  return m;
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  m: StripMetrics,
  style: StripStyle,
  ink: string,
  date: Date,
): void {
  const centerX = m.width / 2;
  const unit = m.width * 0.01;

  const logoH = style.showLogo ? unit * 4.7 : 0;
  const logoGap = style.showLogo ? m.width * 0.016 : 0;
  const titleSize = m.width * 0.042;
  const captionSize = m.width * 0.028;
  const dateSize = m.width * 0.023;

  const contentH =
    logoH +
    logoGap +
    (style.title.trim() ? titleSize * 1.05 : 0) +
    (style.caption.trim() ? captionSize * 1.15 : 0) +
    (style.showDate ? dateSize * 1.4 : 0);

  // Centre the block in the footer band rather than hanging it off the top, so
  // any combination of title/caption/date stays visually balanced.
  let cursorY = m.height - m.footer + (m.footer - contentH) / 2;

  if (style.showLogo) {
    // A small three-bar mark — a strip, abstracted.
    const barW = unit * 5.4;
    const barH = unit * 1.15;
    const gap = unit * 0.62;
    const colors = [ink, style.accent, ink];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = colors[i];
      ctx.globalAlpha = i === 1 ? 1 : 0.85;
      roundRectPath(ctx, centerX - barW / 2, cursorY + i * (barH + gap), barW, barH, barH / 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    cursorY += logoH + logoGap;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  if (style.title.trim()) {
    ctx.fillStyle = ink;
    ctx.font = `800 ${titleSize}px "Bricolage Grotesque", "Inter", system-ui, sans-serif`;
    drawSpacedText(ctx, style.title, centerX, cursorY, titleSize * 0.1, 'center');
    cursorY += titleSize * 1.05;
  }

  if (style.caption.trim()) {
    ctx.fillStyle = withAlpha(ink, 0.72);
    ctx.font = `500 ${captionSize}px "Inter", system-ui, sans-serif`;
    drawSpacedText(ctx, style.caption, centerX, cursorY, captionSize * 0.02, 'center');
    cursorY += captionSize * 1.15;
  }

  if (style.showDate) {
    ctx.fillStyle = withAlpha(ink, 0.55);
    ctx.font = `500 ${dateSize}px "Inter", system-ui, sans-serif`;
    drawSpacedText(ctx, formatDate(date), centerX, cursorY + dateSize * 0.2, dateSize * 0.14, 'center');
  }

  ctx.textBaseline = 'alphabetic';
}

function drawTextItem(ctx: CanvasRenderingContext2D, item: StripTextItem, m: StripMetrics): void {
  const size = item.size * m.width;
  const lines = item.text.split('\n');
  ctx.save();
  ctx.translate(item.x * m.width, item.y * m.height);
  ctx.rotate(item.rotation);
  ctx.fillStyle = item.color;
  ctx.font = `700 ${size}px ${item.fontFamily}`;
  ctx.textAlign = item.align;
  ctx.textBaseline = 'middle';
  const lineHeight = size * 1.15;
  const startY = -((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    drawSpacedText(ctx, line, 0, startY + i * lineHeight, item.letterSpacing * size, item.align);
  });
  ctx.restore();
}

/**
 * Canvas letter-spacing is still patchy across browsers, so glyphs are placed by
 * hand. Slower, but identical everywhere — which matters when the same code path
 * produces the downloaded PNG.
 */
export function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: CanvasTextAlign,
): void {
  if (!text) return;
  if (Math.abs(spacing) < 0.01) {
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    return;
  }

  const chars = Array.from(text);
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + spacing;
  total -= spacing;

  let cursor = x;
  if (align === 'center') cursor = x - total / 2;
  else if (align === 'right') cursor = x - total;

  const previousAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of chars) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = previousAlign;
}

/** `object-fit: cover` for canvas. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const size = sourceSize(image);
  if (!size) return;
  const srcAspect = size.width / size.height;
  const dstAspect = w / h;
  let sw = size.width;
  let sh = size.height;
  if (srcAspect > dstAspect) sw = size.height * dstAspect;
  else sh = size.width / dstAspect;
  const sx = (size.width - sw) / 2;
  const sy = (size.height - sh) / 2;
  try {
    ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
  } catch {
    /* a not-yet-decoded image; the next render will catch it */
  }
}

function sourceSize(image: CanvasImageSource): { width: number; height: number } | null {
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    return { width: image.width, height: image.height };
  }
  if (typeof HTMLVideoElement !== 'undefined' && image instanceof HTMLVideoElement) {
    return { width: image.videoWidth, height: image.videoHeight };
  }
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    return { width: image.width, height: image.height };
  }
  return null;
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

/** Picks near-black or near-white text depending on what the background can carry. */
export function readableInk(background: string): string {
  const rgb = parseColor(background);
  if (!rgb) return '#16151A';
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.42 ? '#16151A' : '#FBF7F2';
}

export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseColor(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function parseColor(value: string): [number, number, number] | null {
  const hex = value.trim();
  if (!hex.startsWith('#')) return null;
  const body = hex.slice(1);
  if (body.length === 3) {
    return [
      parseInt(body[0] + body[0], 16),
      parseInt(body[1] + body[1], 16),
      parseInt(body[2] + body[2], 16),
    ];
  }
  if (body.length >= 6) {
    return [
      parseInt(body.slice(0, 2), 16),
      parseInt(body.slice(2, 4), 16),
      parseInt(body.slice(4, 6), 16),
    ];
  }
  return null;
}
