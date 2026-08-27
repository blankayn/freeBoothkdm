import type { StickerAsset, StickerCategory } from '../../types/stickers';

/**
 * The built-in sticker set.
 *
 * Every sticker is original vector art defined inline and encoded as a data URI,
 * so the booth ships with zero image requests, scales crisply to any export size,
 * and works offline. Each design is drawn twice — once as a fat white silhouette
 * underneath, once in colour on top — which is what gives the die-cut look.
 */

const CUT_STROKE = 9;

function sticker(body: string, size = 120): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<g fill="#fff" stroke="#fff" stroke-width="${CUT_STROKE}" stroke-linejoin="round" stroke-linecap="round">${body}</g>` +
    body +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Wide art (glasses, banners) needs its own box so the aspect stays honest. */
function wideSticker(body: string, w: number, h: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<g fill="#fff" stroke="#fff" stroke-width="${CUT_STROKE}" stroke-linejoin="round" stroke-linecap="round">${body}</g>` +
    body +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const eyes = (cx1: number, cx2: number, cy: number, r = 5) =>
  `<circle cx="${cx1}" cy="${cy}" r="${r}" fill="#1F1B24"/><circle cx="${cx2}" cy="${cy}" r="${r}" fill="#1F1B24"/>`;

const blush = (cx1: number, cx2: number, cy: number, r = 7) =>
  `<ellipse cx="${cx1}" cy="${cy}" rx="${r}" ry="${r * 0.66}" fill="#FF8FB1" opacity="0.85"/>` +
  `<ellipse cx="${cx2}" cy="${cy}" rx="${r}" ry="${r * 0.66}" fill="#FF8FB1" opacity="0.85"/>`;

const smile = (d: string) =>
  `<path d="${d}" fill="none" stroke="#1F1B24" stroke-width="3.4" stroke-linecap="round"/>`;

// --- cute --------------------------------------------------------------------

const CAT = sticker(
  `<path d="M28 44 L24 18 L48 32 Q60 28 72 32 L96 18 L92 44 Q102 58 102 72 Q102 100 60 100 Q18 100 18 72 Q18 58 28 44 Z" fill="#FFD9A8"/>` +
    `<path d="M30 26 L33 40 L44 34 Z" fill="#FF9AB5"/><path d="M90 26 L87 40 L76 34 Z" fill="#FF9AB5"/>` +
    eyes(46, 74, 64, 5.5) +
    blush(34, 86, 74, 8) +
    `<path d="M56 74 Q60 78 64 74" fill="none" stroke="#1F1B24" stroke-width="3.2" stroke-linecap="round"/>` +
    `<path d="M60 68 l-4 4 h8 z" fill="#FF7A9C"/>`,
);

const GHOST = sticker(
  `<path d="M60 14 Q98 14 98 54 L98 100 L86 88 L74 100 L62 88 L50 100 L38 88 L26 100 L22 54 Q22 14 60 14 Z" fill="#F2F0FF"/>` +
    eyes(46, 74, 50, 6) +
    `<ellipse cx="60" cy="66" rx="7" ry="9" fill="#1F1B24"/>` +
    blush(33, 87, 62, 7),
);

const BEAR = sticker(
  `<circle cx="30" cy="32" r="16" fill="#C99A6E"/><circle cx="90" cy="32" r="16" fill="#C99A6E"/>` +
    `<circle cx="30" cy="32" r="8" fill="#F0C9A0"/><circle cx="90" cy="32" r="8" fill="#F0C9A0"/>` +
    `<circle cx="60" cy="64" r="38" fill="#C99A6E"/>` +
    `<ellipse cx="60" cy="76" rx="20" ry="15" fill="#F0C9A0"/>` +
    eyes(47, 73, 58, 5) +
    `<ellipse cx="60" cy="70" rx="6" ry="4.5" fill="#1F1B24"/>` +
    smile('M52 80 Q60 87 68 80'),
);

const BUNNY = sticker(
  `<ellipse cx="42" cy="26" rx="11" ry="26" fill="#FFF3F7" stroke="#F3C9DA" stroke-width="2"/>` +
    `<ellipse cx="78" cy="26" rx="11" ry="26" fill="#FFF3F7" stroke="#F3C9DA" stroke-width="2"/>` +
    `<ellipse cx="42" cy="28" rx="5" ry="17" fill="#FFC2D8"/><ellipse cx="78" cy="28" rx="5" ry="17" fill="#FFC2D8"/>` +
    `<circle cx="60" cy="72" r="30" fill="#FFF3F7"/>` +
    eyes(49, 71, 68, 4.6) +
    blush(38, 82, 78, 7) +
    `<path d="M60 76 l-4 4 h8 z" fill="#FF7A9C"/>` +
    smile('M53 84 Q60 89 67 84'),
);

const CLOUD_FACE = sticker(
  `<path d="M32 78 Q14 78 14 62 Q14 48 30 46 Q32 26 54 26 Q72 26 78 42 Q100 40 102 60 Q104 78 86 78 Z" fill="#DCEBFF"/>` +
    eyes(48, 74, 58, 4.6) +
    blush(38, 84, 66, 6) +
    smile('M55 64 Q61 70 67 64'),
);

const STAR_FACE = sticker(
  `<path d="M60 12 L73 45 L109 47 L81 69 L90 103 L60 84 L30 103 L39 69 L11 47 L47 45 Z" fill="#FFD166"/>` +
    eyes(49, 71, 58, 4.6) +
    blush(38, 82, 66, 6) +
    smile('M54 66 Q60 72 66 66'),
);

const MUSHROOM = sticker(
  `<path d="M18 58 Q18 20 60 20 Q102 20 102 58 Q102 64 94 64 L26 64 Q18 64 18 58 Z" fill="#FF6B6B"/>` +
    `<circle cx="38" cy="42" r="8" fill="#FFF3F7"/><circle cx="72" cy="36" r="6" fill="#FFF3F7"/><circle cx="84" cy="52" r="5" fill="#FFF3F7"/>` +
    `<path d="M40 64 L44 96 Q60 104 76 96 L80 64 Z" fill="#FFF0DC"/>` +
    eyes(52, 68, 78, 3.6) +
    smile('M56 84 Q60 87 64 84'),
);

// --- funny -------------------------------------------------------------------

const GOOGLY = wideSticker(
  `<circle cx="42" cy="45" r="34" fill="#FFFFFF" stroke="#1F1B24" stroke-width="4"/>` +
    `<circle cx="112" cy="45" r="34" fill="#FFFFFF" stroke="#1F1B24" stroke-width="4"/>` +
    `<circle cx="50" cy="54" r="15" fill="#1F1B24"/><circle cx="104" cy="52" r="15" fill="#1F1B24"/>`,
  154,
  90,
);

const TONGUE = sticker(
  `<circle cx="60" cy="60" r="46" fill="#FFD53D"/>` +
    `<path d="M40 46 l14 8 -14 8" fill="none" stroke="#1F1B24" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="80" cy="50" r="6" fill="#1F1B24"/>` +
    `<path d="M42 72 Q60 90 78 72 Z" fill="#1F1B24"/>` +
    `<path d="M56 80 Q56 98 66 96 Q74 94 72 78 Z" fill="#FF6B8A"/>`,
);

const COOL = sticker(
  `<circle cx="60" cy="60" r="46" fill="#FFD53D"/>` +
    `<path d="M20 48 H100 V54 Q100 70 84 70 Q68 70 66 56 H54 Q52 70 36 70 Q20 70 20 54 Z" fill="#1F1B24"/>` +
    smile('M44 84 Q60 96 76 84'),
);

const BOLT = sticker(
  `<path d="M70 8 L28 66 L54 66 L44 112 L92 48 L64 48 Z" fill="#FFD53D" stroke="#1F1B24" stroke-width="4" stroke-linejoin="round"/>`,
);

const BANG = sticker(
  `<path d="M34 12 h20 l-5 58 h-10 Z" fill="#FF3B6B"/><circle cx="44" cy="90" r="10" fill="#FF3B6B"/>` +
    `<path d="M70 12 h20 l-5 58 h-10 Z" fill="#FF3B6B"/><circle cx="80" cy="90" r="10" fill="#FF3B6B"/>`,
);

// --- love --------------------------------------------------------------------

const heartPath = (fill: string) =>
  `<path d="M60 102 C10 70 12 34 34 24 C48 18 58 28 60 36 C62 28 72 18 86 24 C108 34 110 70 60 102 Z" fill="${fill}"/>`;

const HEART = sticker(heartPath('#FF3B6B'));

const HEART_PINK = sticker(heartPath('#FF9AD5'));

const HEART_DOUBLE = sticker(
  `<g transform="translate(-14,10) scale(0.72)">${heartPath('#FF9AD5')}</g>` +
    `<g transform="translate(26,-6) scale(0.86)">${heartPath('#FF3B6B')}</g>`,
);

const HEART_BROKEN = sticker(
  `<path d="M58 102 C10 70 12 34 34 24 C48 18 58 28 58 36 L48 56 L60 66 L52 84 Z" fill="#FF3B6B"/>` +
    `<path d="M62 102 C110 70 108 34 86 24 C72 18 62 28 62 36 L72 56 L60 66 L68 84 Z" fill="#D42150"/>`,
);

const HEART_ARROW = wideSticker(
  `<path d="M14 62 L44 46" stroke="#1F1B24" stroke-width="6" stroke-linecap="round" fill="none"/>` +
    `<path d="M8 68 l6 -8 8 4 z" fill="#1F1B24"/>` +
    `<g transform="translate(30,-2) scale(0.86)">${heartPath('#FF3B6B')}</g>` +
    `<path d="M126 34 L154 20" stroke="#1F1B24" stroke-width="6" stroke-linecap="round" fill="none"/>` +
    `<path d="M158 14 l6 12 -13 1 z" fill="#1F1B24"/>`,
  172,
  120,
);

const LOVE_TAG = wideSticker(
  `<rect x="6" y="16" width="148" height="58" rx="29" fill="#FF3B6B"/>` +
    `<text x="80" y="56" font-family="Bricolage Grotesque, Inter, sans-serif" font-size="34" font-weight="800" fill="#FFF3F7" text-anchor="middle" letter-spacing="4">LOVE</text>`,
  160,
  90,
);

const LIPS = wideSticker(
  `<path d="M8 40 Q30 14 52 32 Q64 42 76 32 Q98 14 120 40 Q92 82 64 82 Q36 82 8 40 Z" fill="#E5245B"/>` +
    `<path d="M8 40 Q64 52 120 40" fill="none" stroke="#9E0F38" stroke-width="3"/>`,
  128,
  96,
);

// --- food --------------------------------------------------------------------

const BOBA = sticker(
  `<path d="M34 34 h52 l-6 66 q-1 10 -11 10 h-18 q-10 0 -11 -10 Z" fill="#F5E3D0"/>` +
    `<path d="M36 52 h48 l-4 48 q-1 10 -11 10 h-18 q-10 0 -11 -10 Z" fill="#C98A5C" opacity="0.85"/>` +
    `<rect x="28" y="26" width="64" height="12" rx="6" fill="#FFF3F7"/>` +
    `<path d="M74 26 L92 4" stroke="#FF6B8A" stroke-width="8" stroke-linecap="round" fill="none"/>` +
    `<circle cx="48" cy="96" r="6" fill="#3A2418"/><circle cx="62" cy="102" r="6" fill="#3A2418"/><circle cx="75" cy="94" r="6" fill="#3A2418"/>`,
);

const DONUT = sticker(
  `<circle cx="60" cy="60" r="46" fill="#F3B37A"/>` +
    `<path d="M14 58 Q22 34 44 26 Q68 16 90 30 Q108 42 106 62 Q98 50 86 56 Q74 44 60 52 Q44 40 32 52 Q22 50 14 58 Z" fill="#FF8FC5"/>` +
    `<circle cx="60" cy="60" r="15" fill="#FFF3F7"/>` +
    `<rect x="40" y="34" width="10" height="4" rx="2" fill="#FFD53D" transform="rotate(-20 45 36)"/>` +
    `<rect x="70" y="30" width="10" height="4" rx="2" fill="#5AD2FF" transform="rotate(15 75 32)"/>` +
    `<rect x="86" y="52" width="10" height="4" rx="2" fill="#C8FF4D" transform="rotate(60 91 54)"/>` +
    `<rect x="26" y="52" width="10" height="4" rx="2" fill="#8B5CF6" transform="rotate(-60 31 54)"/>`,
);

const CHERRY = sticker(
  `<path d="M60 22 Q44 44 34 62" fill="none" stroke="#4E8C3A" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M60 22 Q78 44 86 60" fill="none" stroke="#4E8C3A" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M60 22 Q76 8 92 14 Q80 26 60 22 Z" fill="#5FA845"/>` +
    `<circle cx="32" cy="80" r="20" fill="#E5245B"/><circle cx="88" cy="78" r="20" fill="#FF3B6B"/>` +
    `<circle cx="26" cy="74" r="5" fill="#FFF3F7" opacity="0.7"/><circle cx="82" cy="72" r="5" fill="#FFF3F7" opacity="0.7"/>`,
);

const STRAWBERRY = sticker(
  `<path d="M60 30 Q102 34 96 66 Q90 104 60 112 Q30 104 24 66 Q18 34 60 30 Z" fill="#FF3B6B"/>` +
    `<path d="M40 26 L60 12 L80 26 Q70 34 60 34 Q50 34 40 26 Z" fill="#5FA845"/>` +
    `<circle cx="48" cy="54" r="3" fill="#FFF0DC"/><circle cx="70" cy="50" r="3" fill="#FFF0DC"/>` +
    `<circle cx="60" cy="70" r="3" fill="#FFF0DC"/><circle cx="40" cy="76" r="3" fill="#FFF0DC"/>` +
    `<circle cx="80" cy="74" r="3" fill="#FFF0DC"/><circle cx="60" cy="92" r="3" fill="#FFF0DC"/>`,
);

const ICE_CREAM = sticker(
  `<circle cx="42" cy="34" r="20" fill="#FF9AD5"/><circle cx="76" cy="32" r="19" fill="#FFF0DC"/>` +
    `<circle cx="60" cy="52" r="21" fill="#A8E6C4"/>` +
    `<path d="M34 62 L60 114 L86 62 Z" fill="#E0A867"/>` +
    `<path d="M42 74 L64 70 M50 88 L72 82" stroke="#B9834A" stroke-width="3" stroke-linecap="round" fill="none"/>`,
);

const COFFEE = sticker(
  `<path d="M26 34 h60 l-6 62 q-1 12 -13 12 h-22 q-12 0 -13 -12 Z" fill="#FFF3F7"/>` +
    `<path d="M30 46 h52 l-5 50 q-1 10 -11 10 h-20 q-10 0 -11 -10 Z" fill="#7A4A2B"/>` +
    `<path d="M86 44 q22 2 22 18 t-22 18" fill="none" stroke="#FFF3F7" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M40 18 q6 -10 0 -16 M56 18 q6 -10 0 -16 M72 18 q6 -10 0 -16" fill="none" stroke="#CBB9AC" stroke-width="4" stroke-linecap="round"/>`,
);

// --- stars -------------------------------------------------------------------

const sparklePath = (fill: string, s = 1, tx = 0, ty = 0) =>
  `<path transform="translate(${tx},${ty}) scale(${s})" d="M60 6 Q68 46 106 60 Q68 74 60 114 Q52 74 14 60 Q52 46 60 6 Z" fill="${fill}"/>`;

const SPARKLE = sticker(sparklePath('#FFD53D'));
const SPARKLE_WHITE = sticker(sparklePath('#FFFFFF'));

const STAR_5 = sticker(
  `<path d="M60 10 L74 45 L112 48 L83 72 L92 108 L60 88 L28 108 L37 72 L8 48 L46 45 Z" fill="#FFD53D"/>`,
);

const STAR_CLUSTER = sticker(
  sparklePath('#FFD53D', 0.55, 22, 0) +
    sparklePath('#FF9AD5', 0.38, -8, 44) +
    sparklePath('#5AD2FF', 0.3, 52, 52),
);

const SHOOTING_STAR = wideSticker(
  `<path d="M10 78 Q54 68 96 34" fill="none" stroke="#5AD2FF" stroke-width="9" stroke-linecap="round" opacity="0.85"/>` +
    `<path d="M22 92 Q60 84 92 56" fill="none" stroke="#B8E6FF" stroke-width="6" stroke-linecap="round" opacity="0.7"/>` +
    `<path d="M116 10 L127 36 L155 39 L134 57 L140 84 L116 70 L92 84 L98 57 L77 39 L105 36 Z" fill="#FFD53D"/>`,
  168,
  104,
);

const MOON = sticker(
  `<path d="M78 10 Q34 22 34 60 Q34 98 78 110 Q34 116 18 78 Q4 40 34 18 Q52 6 78 10 Z" fill="#FFE9A8"/>` +
    sparklePath('#FFF3C4', 0.26, 62, 10),
);

const SUN = sticker(
  `<circle cx="60" cy="60" r="30" fill="#FFD53D"/>` +
    `<g stroke="#FFB13D" stroke-width="7" stroke-linecap="round">` +
    `<path d="M60 8 v14 M60 98 v14 M8 60 h14 M98 60 h14 M23 23 l10 10 M87 87 l10 10 M97 23 l-10 10 M33 87 l-10 10"/></g>`,
);

// --- doodles -----------------------------------------------------------------

const doodle = (d: string, color = '#1F1B24', width = 8) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const SQUIGGLE = wideSticker(doodle('M8 60 q18 -40 36 0 t36 0 t36 0 t36 0'), 160, 120);
const ARROW = wideSticker(
  doodle('M8 74 Q60 10 140 42') + doodle('M112 22 L146 40 L116 62', '#1F1B24', 8),
  160,
  100,
);
const SPIRAL = sticker(
  doodle('M60 60 q-6 -14 8 -14 t14 18 t-22 22 t-30 -30 t34 -34 t42 40', '#8B5CF6', 7),
);
const SCRIBBLE_CHECK = sticker(doodle('M18 62 L46 92 L104 22', '#C8FF4D', 12));
const POW = sticker(
  `<path d="M60 4 L74 30 L104 20 L96 50 L118 62 L94 76 L104 106 L74 94 L60 118 L46 94 L16 106 L26 76 L2 62 L24 50 L16 20 L46 30 Z" fill="#FF3B6B"/>` +
    `<text x="60" y="74" font-family="Bricolage Grotesque, Inter, sans-serif" font-size="28" font-weight="800" fill="#FFF3F7" text-anchor="middle">POW</text>`,
);
const SWOOSH = wideSticker(doodle('M8 62 Q52 96 96 62 T182 54', '#5AD2FF', 11), 192, 110);

// --- frames ------------------------------------------------------------------

const FRAME_DASHED = wideSticker(
  `<rect x="8" y="8" width="184" height="140" rx="18" fill="none" stroke="#FF3B6B" stroke-width="7" stroke-dasharray="18 14" stroke-linecap="round"/>`,
  200,
  156,
);

const SPEECH = wideSticker(
  `<path d="M12 12 h152 a14 14 0 0 1 14 14 v70 a14 14 0 0 1 -14 14 h-84 l-30 26 v-26 h-38 a14 14 0 0 1 -14 -14 v-70 a14 14 0 0 1 14 -14 Z" fill="#FFFFFF" stroke="#1F1B24" stroke-width="5"/>` +
    `<circle cx="62" cy="62" r="7" fill="#1F1B24"/><circle cx="90" cy="62" r="7" fill="#1F1B24"/><circle cx="118" cy="62" r="7" fill="#1F1B24"/>`,
  192,
  148,
);

const BANNER = wideSticker(
  `<path d="M6 22 h188 l-22 30 l22 30 h-188 l22 -30 Z" fill="#FF3B6B"/>` +
    `<path d="M6 22 v60 M194 22 v60" stroke="#D42150" stroke-width="4"/>`,
  200,
  104,
);

const FILM_CORNER = wideSticker(
  `<rect x="8" y="8" width="150" height="112" rx="10" fill="none" stroke="#1F1B24" stroke-width="7"/>` +
    `<g fill="#1F1B24"><rect x="18" y="18" width="14" height="12" rx="3"/><rect x="18" y="40" width="14" height="12" rx="3"/>` +
    `<rect x="18" y="62" width="14" height="12" rx="3"/><rect x="18" y="84" width="14" height="12" rx="3"/>` +
    `<rect x="134" y="18" width="14" height="12" rx="3"/><rect x="134" y="40" width="14" height="12" rx="3"/>` +
    `<rect x="134" y="62" width="14" height="12" rx="3"/><rect x="134" y="84" width="14" height="12" rx="3"/></g>`,
  166,
  128,
);

// --- accessories -------------------------------------------------------------

const SUNGLASSES = wideSticker(
  `<path d="M8 26 H192 V38 Q192 44 184 46 Q182 88 142 88 Q106 88 104 52 H96 Q94 88 58 88 Q18 88 16 46 Q8 44 8 38 Z" fill="#1F1B24"/>` +
    `<path d="M28 44 Q40 74 62 74 Q84 74 88 48 Q60 40 28 44 Z" fill="#3D3A46" opacity="0.85"/>` +
    `<path d="M112 48 Q116 74 138 74 Q160 74 172 44 Q140 40 112 48 Z" fill="#3D3A46" opacity="0.85"/>`,
  200,
  96,
);

const HEART_GLASSES = wideSticker(
  `<path d="M14 34 H186" stroke="#FF3B6B" stroke-width="9" stroke-linecap="round" fill="none"/>` +
    `<path d="M58 92 C22 68 24 38 42 32 C52 28 57 36 58 42 C59 36 64 28 74 32 C92 38 94 68 58 92 Z" fill="#FF3B6B"/>` +
    `<path d="M142 92 C106 68 108 38 126 32 C136 28 141 36 142 42 C143 36 148 28 158 32 C176 38 178 68 142 92 Z" fill="#FF3B6B"/>`,
  200,
  104,
);

const CROWN = wideSticker(
  `<path d="M10 92 L18 26 L54 58 L80 14 L106 58 L142 26 L150 92 Z" fill="#FFD53D"/>` +
    `<rect x="10" y="92" width="140" height="16" rx="6" fill="#FFB13D"/>` +
    `<circle cx="80" cy="80" r="7" fill="#FF3B6B"/><circle cx="44" cy="84" r="5" fill="#5AD2FF"/><circle cx="116" cy="84" r="5" fill="#C8FF4D"/>`,
  160,
  116,
);

const BOW = wideSticker(
  `<path d="M76 44 Q34 8 18 30 Q4 50 30 62 Q6 76 20 94 Q38 114 76 76 Z" fill="#FF7AAE"/>` +
    `<path d="M84 44 Q126 8 142 30 Q156 50 130 62 Q154 76 140 94 Q122 114 84 76 Z" fill="#FF7AAE"/>` +
    `<rect x="68" y="42" width="24" height="38" rx="10" fill="#E5548C"/>`,
  160,
  120,
);

const CAP = wideSticker(
  `<path d="M18 76 Q18 18 84 18 Q150 18 150 76 Z" fill="#5AD2FF"/>` +
    `<path d="M150 66 Q192 68 192 88 L18 88 Q18 68 40 66 Z" fill="#3BA9D6"/>` +
    `<circle cx="84" cy="22" r="9" fill="#3BA9D6"/>`,
  200,
  100,
);

const RING = sticker(
  `<ellipse cx="60" cy="82" rx="26" ry="24" fill="none" stroke="#FFD53D" stroke-width="11"/>` +
    `<path d="M60 24 L76 46 L60 62 L44 46 Z" fill="#8AE6FF" stroke="#5AD2FF" stroke-width="3"/>` +
    sparklePath('#FFFFFF', 0.24, 62, -10),
);

// --- catalogue ---------------------------------------------------------------

interface Entry {
  id: string;
  name: string;
  category: StickerCategory;
  src: string;
  aspect?: number;
  suggestedAttachment?: StickerAsset['suggestedAttachment'];
}

const ENTRIES: Entry[] = [
  // cute
  { id: 'cat', name: 'Cat', category: 'cute', src: CAT },
  { id: 'ghost', name: 'Ghost', category: 'cute', src: GHOST },
  { id: 'bear', name: 'Bear', category: 'cute', src: BEAR },
  { id: 'bunny', name: 'Bunny', category: 'cute', src: BUNNY },
  { id: 'cloud', name: 'Cloud', category: 'cute', src: CLOUD_FACE },
  { id: 'starface', name: 'Star Pal', category: 'cute', src: STAR_FACE },
  { id: 'mushroom', name: 'Mushroom', category: 'cute', src: MUSHROOM },

  // funny
  { id: 'googly', name: 'Googly Eyes', category: 'funny', src: GOOGLY, aspect: 154 / 90, suggestedAttachment: 'face' },
  { id: 'tongue', name: 'Blep', category: 'funny', src: TONGUE },
  { id: 'cool', name: 'Cool', category: 'funny', src: COOL },
  { id: 'bolt', name: 'Bolt', category: 'funny', src: BOLT },
  { id: 'bang', name: 'Wow', category: 'funny', src: BANG },

  // love
  { id: 'heart', name: 'Heart', category: 'love', src: HEART },
  { id: 'heart-pink', name: 'Pink Heart', category: 'love', src: HEART_PINK },
  { id: 'heart-double', name: 'Two Hearts', category: 'love', src: HEART_DOUBLE },
  { id: 'heart-broken', name: 'Broken', category: 'love', src: HEART_BROKEN },
  { id: 'heart-arrow', name: 'Struck', category: 'love', src: HEART_ARROW, aspect: 172 / 120 },
  { id: 'love-tag', name: 'Love Tag', category: 'love', src: LOVE_TAG, aspect: 160 / 90 },
  { id: 'lips', name: 'Kiss', category: 'love', src: LIPS, aspect: 128 / 96 },

  // food
  { id: 'boba', name: 'Boba', category: 'food', src: BOBA },
  { id: 'donut', name: 'Donut', category: 'food', src: DONUT },
  { id: 'cherry', name: 'Cherries', category: 'food', src: CHERRY },
  { id: 'strawberry', name: 'Strawberry', category: 'food', src: STRAWBERRY },
  { id: 'icecream', name: 'Ice Cream', category: 'food', src: ICE_CREAM },
  { id: 'coffee', name: 'Coffee', category: 'food', src: COFFEE },

  // stars
  { id: 'sparkle', name: 'Sparkle', category: 'stars', src: SPARKLE, suggestedAttachment: 'hand' },
  { id: 'sparkle-white', name: 'Twinkle', category: 'stars', src: SPARKLE_WHITE, suggestedAttachment: 'hand' },
  { id: 'star5', name: 'Star', category: 'stars', src: STAR_5 },
  { id: 'cluster', name: 'Cluster', category: 'stars', src: STAR_CLUSTER },
  { id: 'shooting', name: 'Shooting Star', category: 'stars', src: SHOOTING_STAR, aspect: 168 / 104 },
  { id: 'moon', name: 'Moon', category: 'stars', src: MOON },
  { id: 'sun', name: 'Sun', category: 'stars', src: SUN },

  // doodles
  { id: 'squiggle', name: 'Squiggle', category: 'doodles', src: SQUIGGLE, aspect: 160 / 120 },
  { id: 'arrow', name: 'Arrow', category: 'doodles', src: ARROW, aspect: 160 / 100 },
  { id: 'spiral', name: 'Spiral', category: 'doodles', src: SPIRAL },
  { id: 'check', name: 'Check', category: 'doodles', src: SCRIBBLE_CHECK },
  { id: 'pow', name: 'Pow', category: 'doodles', src: POW },
  { id: 'swoosh', name: 'Swoosh', category: 'doodles', src: SWOOSH, aspect: 192 / 110 },

  // frames
  { id: 'frame-dashed', name: 'Dashed', category: 'frames', src: FRAME_DASHED, aspect: 200 / 156 },
  { id: 'speech', name: 'Speech', category: 'frames', src: SPEECH, aspect: 192 / 148 },
  { id: 'banner', name: 'Banner', category: 'frames', src: BANNER, aspect: 200 / 104 },
  { id: 'film', name: 'Film', category: 'frames', src: FILM_CORNER, aspect: 166 / 128 },

  // accessories
  { id: 'sunglasses', name: 'Shades', category: 'accessories', src: SUNGLASSES, aspect: 200 / 96, suggestedAttachment: 'face' },
  { id: 'heart-glasses', name: 'Heart Shades', category: 'accessories', src: HEART_GLASSES, aspect: 200 / 104, suggestedAttachment: 'face' },
  { id: 'crown', name: 'Crown', category: 'accessories', src: CROWN, aspect: 160 / 116, suggestedAttachment: 'head' },
  { id: 'bow', name: 'Bow', category: 'accessories', src: BOW, aspect: 160 / 120, suggestedAttachment: 'head' },
  { id: 'cap', name: 'Cap', category: 'accessories', src: CAP, aspect: 200 / 100, suggestedAttachment: 'head' },
  { id: 'ring', name: 'Ring', category: 'accessories', src: RING, suggestedAttachment: 'finger' },
];

export const BUILT_IN_STICKERS: StickerAsset[] = ENTRIES.map((e) => ({
  id: e.id,
  name: e.name,
  category: e.category,
  src: e.src,
  aspect: e.aspect ?? 1,
  suggestedAttachment: e.suggestedAttachment,
}));

export const STICKER_CATEGORIES: { id: StickerCategory; label: string }[] = [
  { id: 'cute', label: 'Cute' },
  { id: 'funny', label: 'Funny' },
  { id: 'love', label: 'Love' },
  { id: 'food', label: 'Food' },
  { id: 'stars', label: 'Stars' },
  { id: 'doodles', label: 'Doodles' },
  { id: 'frames', label: 'Frames' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'custom', label: 'Yours' },
];

export function stickersByCategory(category: StickerCategory): StickerAsset[] {
  return BUILT_IN_STICKERS.filter((s) => s.category === category);
}
