import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { registerChapter } from './scroll';

/** SSR-safe layout effect (this app is client-only, but the guard is cheap). */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

export function useFinePointer(): boolean {
  return useMediaQuery('(pointer: fine)');
}

/**
 * Registers a section as a chapter, which is what the WebGL environment reads
 * to know which state it should be in.
 */
export function useChapter(index: number) {
  const ref = useRef<HTMLElement | null>(null);
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerChapter(el, index);
  }, [index]);
  return ref;
}

/** True once the element has entered the viewport. Never resets. */
export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (!('IntersectionObserver' in window)) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);

  return [ref, seen] as const;
}
