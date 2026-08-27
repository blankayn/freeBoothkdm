export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Frame-rate independent smoothing. `halfLife` is seconds to close half the gap. */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return lerp(target, current, Math.pow(2, -dt / halfLife));
}

export const TAU = Math.PI * 2;

/** Shortest signed angular distance from a to b, in radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export function hash01(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453123;
  return x - Math.floor(x);
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Rotate a point around the origin. */
export function rotate(x: number, y: number, radians: number): [number, number] {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [x * c - y * s, x * s + y * c];
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
