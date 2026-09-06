import { useEffect, useRef, useState } from 'react';
import { deviceTier, supportsWebGL } from '../lib/device';
import { useFinePointer, useReducedMotion } from '../lib/hooks';
import { onFrame } from '../lib/runtime';
import type { FieldEngine } from '../webgl/field-engine';
import './environment.css';

interface Props {
  /** 0 while the opening sequence holds, 1 once the site is revealed. */
  reveal: number;
  /** Bumped whenever the colour mode flips, so the canvas re-reads its tokens. */
  themeKey: number;
}

/**
 * The single WebGL layer behind everything.
 *
 * It is mounted once and never unmounted between sections — that persistence
 * is the whole point. Three is loaded dynamically so a device that cannot use
 * it never pays to download it.
 */
export default function Environment({ reveal, themeKey }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FieldEngine | null>(null);
  const [failed, setFailed] = useState(() => !supportsWebGL());
  const reduced = useReducedMotion();
  const fine = useFinePointer();

  useEffect(() => {
    if (failed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tier = deviceTier();
    if (tier === 'none') {
      setFailed(true);
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void import('../webgl/field-engine').then(({ createFieldEngine }) => {
      if (disposed) return;
      const engine = createFieldEngine(canvas, tier, reduced, () => setFailed(true));
      if (!engine) {
        setFailed(true);
        return;
      }
      engineRef.current = engine;
      engine.resize();

      const offFrame = onFrame((dt, elapsed) => engine.frame(dt, elapsed));
      const onResize = () => engine.resize();
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);

      // Give the tab back to the machine when it is not being looked at.
      const onVisibility = () => engine.setPointerActive(!document.hidden && fine);
      document.addEventListener('visibilitychange', onVisibility);

      cleanup = () => {
        offFrame();
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
        engine.dispose();
        engineRef.current = null;
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [failed, reduced, fine]);

  // Pointer drives the field only where a real pointer exists. On touch the
  // field is animated by scroll alone, which is both correct and cheaper.
  useEffect(() => {
    if (failed || !fine) return;

    const onMove = (e: PointerEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.setPointer((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      engine.setPointerActive(true);
    };
    const onLeave = () => engineRef.current?.setPointerActive(false);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [failed, fine]);

  useEffect(() => {
    engineRef.current?.setReveal(reveal);
  }, [reveal]);

  useEffect(() => {
    engineRef.current?.refreshTheme();
  }, [themeKey]);

  if (failed) return <FieldFallback revealed={reveal > 0.5} />;

  return (
    <canvas
      ref={canvasRef}
      className="environment"
      aria-hidden="true"
      data-revealed={reveal > 0.5 ? 'true' : 'false'}
    />
  );
}

/**
 * The no-WebGL environment.
 *
 * Not an apology and not a blank background: the same horizon, the same
 * atmosphere, drawn in CSS. The art direction survives; only the interactivity
 * of the field is lost.
 */
function FieldFallback({ revealed }: { revealed: boolean }) {
  return (
    <div className="environment environment--fallback" aria-hidden="true" data-revealed={revealed}>
      <div className="fallback-horizon" />
      <div className="fallback-grid" />
      <div className="fallback-glow" />
    </div>
  );
}
