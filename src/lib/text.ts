/** Splits a string into words that never break mid-word across mask lines. */
export function words(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

/** Splits into characters, preserving spaces as non-breaking for animation. */
export function chars(value: string): string[] {
  return Array.from(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent smoothing. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Deterministic pseudo-random in [0,1) — same layout on every load. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
