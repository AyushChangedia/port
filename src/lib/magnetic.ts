import { useEffect, useRef } from 'react';
import { onFrame } from './runtime';
import { damp } from './text';
import { prefersReducedMotion, isCoarsePointer } from './device';

/**
 * Magnetic attraction toward the pointer.
 *
 * Applied only to a handful of the most important targets. Used on everything
 * it stops being an affordance and becomes noise — and it is disabled outright
 * on touch and under reduced motion, where it would be meaningless or unwanted.
 */
export function useMagnetic<T extends HTMLElement>(strength = 0.28, radius = 90) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || isCoarsePointer()) return;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let inside = false;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const distance = Math.hypot(dx, dy);
      const reach = Math.max(rect.width, rect.height) / 2 + radius;

      if (distance < reach) {
        inside = true;
        const falloff = 1 - distance / reach;
        target.x = dx * strength * falloff;
        target.y = dy * strength * falloff;
      } else if (inside) {
        inside = false;
        target.x = 0;
        target.y = 0;
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });

    const off = onFrame((dt) => {
      current.x = damp(current.x, target.x, 12, dt);
      current.y = damp(current.y, target.y, 12, dt);
      if (Math.abs(current.x) < 0.01 && Math.abs(current.y) < 0.01 && !inside) {
        el.style.transform = '';
        return;
      }
      el.style.transform = `translate3d(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px, 0)`;
    });

    return () => {
      window.removeEventListener('pointermove', onMove);
      off();
      el.style.transform = '';
    };
  }, [strength, radius]);

  return ref;
}
