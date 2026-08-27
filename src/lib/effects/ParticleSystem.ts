import { randomRange, TAU } from '../utils/math';

export type ParticleKind = 'sparkle' | 'heart' | 'star' | 'confetti' | 'ring' | 'bubble';

interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  gravity: number;
  drag: number;
}

const PALETTE = [
  '#FF3B6B',
  '#FF9AD5',
  '#FFD166',
  '#C8FF4D',
  '#5AD2FF',
  '#8B5CF6',
  '#FFFFFF',
];

export interface BurstOptions {
  count?: number;
  speed?: number;
  spread?: number;
  /** Direction in radians; omit for a full circle. */
  angle?: number;
  size?: number;
  life?: number;
  gravity?: number;
  colors?: string[];
}

/**
 * A fixed pool of particles drawn in normalised frame space (0..1). Because the
 * draw call takes the target size, the same system renders identically into the
 * small live preview and the full-resolution capture — the sparkles you see are
 * the sparkles you get.
 */
export class ParticleSystem {
  private pool: Particle[];
  private cursor = 0;
  private live = 0;

  constructor(capacity = 280) {
    this.pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.pool[i] = {
        active: false,
        kind: 'sparkle',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 0.02,
        rotation: 0,
        spin: 0,
        color: '#fff',
        gravity: 0,
        drag: 0.92,
      };
    }
  }

  get activeCount(): number {
    return this.live;
  }

  get isIdle(): boolean {
    return this.live === 0;
  }

  /** Recycles the oldest slot when the pool is exhausted rather than allocating. */
  private acquire(): Particle {
    const start = this.cursor;
    const n = this.pool.length;
    for (let i = 0; i < n; i++) {
      const idx = (start + i) % n;
      if (!this.pool[idx].active) {
        this.cursor = (idx + 1) % n;
        this.live++;
        return this.pool[idx];
      }
    }
    const victim = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % n;
    return victim;
  }

  burst(kind: ParticleKind, x: number, y: number, options: BurstOptions = {}): void {
    const count = options.count ?? 18;
    const speed = options.speed ?? 0.5;
    const spread = options.spread ?? TAU;
    const baseAngle = options.angle ?? -Math.PI / 2;
    const size = options.size ?? 0.032;
    const life = options.life ?? 1.1;
    const gravity = options.gravity ?? 0.35;
    const colors = options.colors ?? PALETTE;

    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      const angle =
        spread >= TAU ? Math.random() * TAU : baseAngle + randomRange(-spread / 2, spread / 2);
      const v = speed * randomRange(0.45, 1.15);
      p.active = true;
      p.kind = kind;
      p.x = x + randomRange(-0.012, 0.012);
      p.y = y + randomRange(-0.012, 0.012);
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.maxLife = life * randomRange(0.75, 1.25);
      p.life = p.maxLife;
      p.size = size * randomRange(0.6, 1.4);
      p.rotation = Math.random() * TAU;
      p.spin = randomRange(-4, 4);
      p.color = colors[(Math.random() * colors.length) | 0];
      p.gravity = gravity;
      p.drag = kind === 'confetti' ? 0.88 : 0.94;
    }
  }

  /** Continuous emission, e.g. sparkles trailing an open palm. */
  private emitAccumulator = 0;
  emit(kind: ParticleKind, x: number, y: number, perSecond: number, dt: number, options: BurstOptions = {}): void {
    this.emitAccumulator += perSecond * dt;
    const n = Math.floor(this.emitAccumulator);
    if (n <= 0) return;
    this.emitAccumulator -= n;
    this.burst(kind, x, y, { ...options, count: n });
  }

  update(dt: number): void {
    if (this.live === 0) return;
    const step = Math.min(dt, 0.05);
    let live = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= step;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += p.gravity * step;
      const dragFactor = Math.pow(p.drag, step * 60);
      p.vx *= dragFactor;
      p.vy *= dragFactor;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rotation += p.spin * step;
      live++;
    }
    this.live = live;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.live === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      const t = p.life / p.maxLife;
      const alpha = t > 0.75 ? (1 - t) / 0.25 : t / 0.75;
      const px = p.x * width;
      const py = p.y * height;
      const size = p.size * height * (p.kind === 'ring' ? 1 + (1 - t) * 3 : 0.6 + t * 0.6);

      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.rotation);

      switch (p.kind) {
        case 'sparkle':
          drawSparkle(ctx, size);
          break;
        case 'star':
          drawStar(ctx, size, 5);
          break;
        case 'heart':
          drawHeart(ctx, size);
          break;
        case 'confetti':
          ctx.fillRect(-size * 0.3, -size * 0.55, size * 0.6, size * 1.1);
          break;
        case 'bubble':
          ctx.lineWidth = Math.max(1, size * 0.12);
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.5, 0, TAU);
          ctx.stroke();
          break;
        case 'ring':
          ctx.lineWidth = Math.max(1, size * 0.06);
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.5, 0, TAU);
          ctx.stroke();
          break;
      }
      ctx.restore();
    }
    ctx.restore();
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
    this.live = 0;
    this.emitAccumulator = 0;
  }
}

/** Four-point twinkle with concave sides — reads as "sparkle" even at 6px. */
function drawSparkle(ctx: CanvasRenderingContext2D, size: number): void {
  const r = size * 0.5;
  const w = r * 0.24;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(w, -w, r, 0);
  ctx.quadraticCurveTo(w, w, 0, r);
  ctx.quadraticCurveTo(-w, w, -r, 0);
  ctx.quadraticCurveTo(-w, -w, 0, -r);
  ctx.closePath();
  ctx.fill();
}

function drawStar(ctx: CanvasRenderingContext2D, size: number, points: number): void {
  const outer = size * 0.5;
  const inner = outer * 0.44;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / (points * 2)) * TAU - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.75);
  ctx.bezierCurveTo(-s * 1.5, -s * 0.3, -s * 0.55, -s * 1.15, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.55, -s * 1.15, s * 1.5, -s * 0.3, 0, s * 0.75);
  ctx.closePath();
  ctx.fill();
}
