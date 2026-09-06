import { useEffect, useRef } from 'react';
import { useFinePointer, useReducedMotion } from '../lib/hooks';
import { onFrame } from '../lib/runtime';
import { damp } from '../lib/text';
import './cursor.css';

/** Cursor states, declared by any element via `data-cursor`. */
const LABELS: Record<string, string> = {
  explore: 'Explore',
  open: 'Open ↗',
  drag: 'Drag',
  close: 'Close',
  send: 'Send',
};

/**
 * A two-part cursor: a dot that tracks precisely, and a slower disc that
 * carries the label and lags behind. The lag is the whole character of it —
 * it reads as mass rather than as a pointer graphic.
 *
 * Never mounted on touch devices, and never mounted under reduced motion.
 */
export default function Cursor() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const dotRef = useRef<HTMLDivElement>(null);
  const discRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!fine || reduced) return;
    const dot = dotRef.current;
    const disc = discRef.current;
    const label = labelRef.current;
    if (!dot || !disc || !label) return;

    document.body.dataset.cursor = 'on';

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const fast = { x: target.x, y: target.y };
    const slow = { x: target.x, y: target.y };
    let state = '';
    let down = false;
    let visible = false;

    const readState = (node: EventTarget | null) => {
      const el = (node as HTMLElement | null)?.closest?.<HTMLElement>('[data-cursor]');
      const next = el?.dataset.cursor ?? '';
      if (next === state) return;
      state = next;
      disc.dataset.state = state;
      label.textContent = LABELS[state] ?? '';
    };

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;

      if (!visible) {
        visible = true;
        dot.style.opacity = '1';
        disc.style.opacity = '1';
      }
      readState(e.target);
    };

    // Also on pointerover, so the label is right when the thing under a
    // stationary cursor changes — an overlay opening, say.
    const onOver = (e: PointerEvent) => readState(e.target);

    const onDown = () => { down = true; disc.dataset.down = 'true'; };
    const onUp = () => { down = false; disc.dataset.down = 'false'; };
    const onLeave = () => {
      visible = false;
      dot.style.opacity = '0';
      disc.style.opacity = '0';
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    const off = onFrame((dt) => {
      fast.x = damp(fast.x, target.x, 34, dt);
      fast.y = damp(fast.y, target.y, 34, dt);
      slow.x = damp(slow.x, target.x, 11, dt);
      slow.y = damp(slow.y, target.y, 11, dt);

      // The disc stretches along its own direction of travel. Speed becomes
      // shape, rather than a separate effect bolted on.
      const vx = target.x - slow.x;
      const vy = target.y - slow.y;
      const speed = Math.min(1, Math.hypot(vx, vy) / 120);
      const angle = (Math.atan2(vy, vx) * 180) / Math.PI;
      const stretch = 1 + speed * 0.38;
      const squash = 1 - speed * 0.2;
      const press = down ? 0.86 : 1;

      dot.style.transform = `translate3d(${fast.x}px, ${fast.y}px, 0) translate(-50%, -50%)`;
      disc.style.transform =
        `translate3d(${slow.x}px, ${slow.y}px, 0) translate(-50%, -50%) ` +
        `rotate(${angle}deg) scale(${stretch * press}, ${squash * press}) rotate(${-angle}deg)`;
    });

    return () => {
      off();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeave);
      delete document.body.dataset.cursor;
    };
  }, [fine, reduced]);

  if (!fine || reduced) return null;

  return (
    <div aria-hidden="true">
      <div className="cursor-dot" ref={dotRef} />
      <div className="cursor-disc" ref={discRef} data-state="">
        <span className="cursor-label" ref={labelRef} />
      </div>
    </div>
  );
}
