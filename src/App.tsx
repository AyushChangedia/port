import { useCallback, useEffect, useRef, useState } from 'react';
import { createEngine, type Engine } from './world/engine';
import { supportsWebGL, prefersReducedMotion, deviceTier } from './lib/device';
import Hud from './components/Hud';
import Panel from './components/Panel';
import Directory from './components/Directory';
import ReadableSite from './components/ReadableSite';
import type { Pose } from './components/Minimap';
import './components/directory.css';

type Mode = 'world' | 'reading';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const poseRef = useRef<Pose>({ x: 0, z: 11, yaw: Math.PI });

  // Anyone who cannot (or would rather not) drive a 3D scene gets the page.
  const [mode, setMode] = useState<Mode>(() =>
    supportsWebGL() && !prefersReducedMotion() ? 'world' : 'reading',
  );
  // Reduced motion picks the page as the *default*, but it is a preference,
  // not a lock — only a missing WebGL context actually rules the world out.
  const [forcedRead, setForcedRead] = useState(() => !supportsWebGL());
  const [openId, setOpenId] = useState<string | null>(null);
  const [nearId, setNearId] = useState<string | null>(null);
  const [directory, setDirectory] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const overlayOpen = openId !== null || directory;

  // ── Engine lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'world') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Shadows carry most of the sense of solidity here and the scene is only a
    // few dozen meshes, so anything that is not a phone gets the full pass.
    // Only a genuinely capable GPU gets the full pass. 'medium' now means an
    // integrated chip that reports plenty of CPU, and it belongs on the light
    // path with the phones, not with the discrete cards.
    const tier = deviceTier();
    const quality: 'high' | 'low' = tier === 'high' ? 'high' : 'low';
    const engine = createEngine(
      canvas,
      {
        onNear: setNearId,
        onOpen: (id) => setOpenId(id),
        onPose: (x, z, yaw) => {
          poseRef.current.x = x;
          poseRef.current.z = z;
          poseRef.current.yaw = yaw;
        },
        onFirstMove: () => setShowHint(false),
      },
      quality,
      prefersReducedMotion(),
    );

    if (!engine) {
      setMode('reading');
      setForcedRead(true);
      return;
    }

    engineRef.current = engine;
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // If the GPU drops the context the canvas goes black and stays black, so
    // fall back to the page rather than leaving the visitor staring at nothing.
    const onContextLost = () => {
      setForcedRead(true);
      setMode('reading');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      engine.dispose();
      engineRef.current = null;
    };
  }, [mode]);

  // Freeze the world whenever something is open on top of it.
  useEffect(() => {
    engineRef.current?.setPaused(overlayOpen);
  }, [overlayOpen]);

  // ── Global keys ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'world') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const key = e.key.toLowerCase();

      if ((key === 'e' || key === 'enter') && !overlayOpen) {
        const near = engineRef.current?.nearest();
        if (near) {
          e.preventDefault();
          setOpenId(near);
        }
        return;
      }
      if (key === 'm' && !openId) {
        e.preventDefault();
        setDirectory((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, overlayOpen, openId]);

  const goTo = useCallback((id: string) => {
    setDirectory(false);
    engineRef.current?.goTo(id);
  }, []);

  const openFromDirectory = useCallback((id: string) => {
    setDirectory(false);
    engineRef.current?.teleport(id);
    setOpenId(id);
  }, []);

  const openNear = useCallback(() => {
    const near = engineRef.current?.nearest();
    if (near) setOpenId(near);
  }, []);

  if (mode === 'reading') {
    return (
      <ReadableSite
        reason={forcedRead ? 'fallback' : 'choice'}
        onExit={forcedRead ? undefined : () => setMode('world')}
      />
    );
  }

  return (
    <>
      <a className="skip-link" href="#read-origin" onClick={() => setMode('reading')}>
        Skip the 3D world and read everything as a page
      </a>

      <canvas ref={canvasRef} className="world-canvas" aria-hidden="true" />

      <Hud
        poseRef={poseRef}
        nearId={nearId}
        showHint={showHint}
        onOpenNear={openNear}
        onOpenDirectory={() => setDirectory(true)}
        onReadMode={() => setMode('reading')}
        onPickPlace={goTo}
      />

      {directory && (
        <Directory
          onGo={goTo}
          onOpen={openFromDirectory}
          onClose={() => setDirectory(false)}
        />
      )}

      {openId && <Panel placeId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
