/**
 * Capability detection.
 *
 * The experience adapts rather than degrades: the same art direction runs on
 * a phone, a laptop and a machine with no WebGL at all — only the cost of it
 * changes.
 */

export type Tier = 'high' | 'medium' | 'low' | 'none';

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

let cachedSupport: boolean | null = null;

/** Does this browser actually give us a WebGL context? */
export function supportsWebGL(): boolean {
  if (cachedSupport !== null) return cachedSupport;
  if (typeof window === 'undefined') return (cachedSupport = false);
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    cachedSupport = Boolean(gl);
    // Release the probe context immediately — browsers cap how many exist.
    const lose = (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  } catch {
    cachedSupport = false;
  }
  return cachedSupport;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return true;
  return !window.matchMedia('(pointer: fine)').matches;
}

let cachedGpu: 'weak' | 'capable' | null = null;

/**
 * What the GPU actually is.
 *
 * Cores and memory say nothing about graphics. A laptop with eight fast cores
 * and 16GB can still be driving an integrated chip that cannot carry a shadow
 * map, an HDR post chain and a hundred thousand instances at once — and
 * guessing 'high' there does not degrade gracefully, it renders black.
 */
export function gpuClass(): 'weak' | 'capable' {
  if (cachedGpu) return cachedGpu;
  if (typeof window === 'undefined') return (cachedGpu = 'weak');

  let name = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as
      | WebGLRenderingContext
      | null;
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    return (cachedGpu = 'weak');
  }

  // Integrated and software adapters. Intel's discrete Arc parts are named
  // "Arc", so they are deliberately not caught here.
  const weak =
    /(intel|hd graphics|uhd|iris|swiftshader|llvmpipe|softwar|microsoft basic|mesa|apple m1|adreno|mali|powervr)/i.test(name) &&
    !/\barc\b/i.test(name);

  // An unknown adapter is treated as weak: the cost of guessing high is a
  // black screen, the cost of guessing low is slightly less bloom.
  cachedGpu = name && !weak ? 'capable' : 'weak';
  return cachedGpu;
}

let cachedTier: Tier | null = null;

/**
 * A conservative guess at how much this device can afford. Deliberately based
 * on cheap, synchronous signals — a benchmark on load would cost more than it
 * saves.
 */
export function deviceTier(): Tier {
  if (cachedTier) return cachedTier;
  if (!supportsWebGL()) return (cachedTier = 'none');

  const nav = navigator as NavigatorWithMemory;
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const coarse = isCoarsePointer();
  const narrow = window.innerWidth < 820;

  if (coarse || narrow) {
    cachedTier = cores >= 6 && memory >= 4 ? 'medium' : 'low';
  } else if (cores >= 8 && memory >= 8) {
    cachedTier = 'high';
  } else if (cores >= 4 && memory >= 4) {
    cachedTier = 'medium';
  } else {
    cachedTier = 'low';
  }

  // The GPU has the last word. Nothing about the CPU makes an integrated chip
  // able to run the full pass.
  if (gpuClass() === 'weak' && cachedTier === 'high') cachedTier = 'medium';
  return cachedTier;
}

/** Point budget for the environment field, per tier. */
export const POINT_BUDGET: Record<Exclude<Tier, 'none'>, number> = {
  high: 42000,
  medium: 20000,
  low: 8000,
};

export function pixelRatioCap(tier: Tier): number {
  if (tier === 'high') return 2;
  if (tier === 'medium') return 1.75;
  return 1.35;
}
