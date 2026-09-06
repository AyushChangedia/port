import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { measureChapters, updateScroll } from './scroll';
import { prefersReducedMotion } from './device';

gsap.registerPlugin(ScrollTrigger);

export type TickFn = (dt: number, elapsed: number) => void;

const subscribers = new Set<TickFn>();
let lenis: Lenis | null = null;
let booted = false;
let elapsed = 0;

/** Subscribe to the single shared frame loop. */
export function onFrame(fn: TickFn): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getLenis(): Lenis | null {
  return lenis;
}

/** Lock scrolling — used while the opening sequence plays and by overlays. */
export function lockScroll(locked: boolean): void {
  if (lenis) {
    if (locked) lenis.stop();
    else lenis.start();
  }
  document.documentElement.style.overflow = locked ? 'hidden' : '';
  if (!lenis) document.body.style.overflow = locked ? 'hidden' : '';
}

export function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) {
    lenis.scrollTo(el, { offset: 0, duration: 1.4 });
  } else {
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
}

export function bootRuntime(): () => void {
  if (booted) return () => undefined;
  booted = true;

  const reduced = prefersReducedMotion();

  // Smooth scrolling is an effect, not a requirement. With reduced motion on,
  // the browser's own scrolling is left completely alone.
  if (!reduced) {
    lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      // Touch devices keep native inertia — hijacking it feels worse, not better.
      syncTouch: false,
    });
    lenis.on('scroll', ScrollTrigger.update);
  }

  const tick = (time: number, deltaMs: number) => {
    lenis?.raf(time * 1000);
    const dt = Math.min(0.05, deltaMs / 1000); // clamp: a backgrounded tab must not jump
    elapsed += dt;

    const y = lenis ? lenis.scroll : window.scrollY;
    updateScroll(y, lenis ? lenis.velocity : undefined);

    subscribers.forEach((fn) => fn(dt, elapsed));
  };

  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  const onResize = () => {
    measureChapters();
    ScrollTrigger.refresh();
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // Chapter positions depend on webfonts, which land after first paint.
  if (document.fonts?.ready) {
    void document.fonts.ready.then(onResize);
  }
  const settle = window.setTimeout(onResize, 600);

  return () => {
    gsap.ticker.remove(tick);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.clearTimeout(settle);
    lenis?.destroy();
    lenis = null;
    booted = false;
  };
}
