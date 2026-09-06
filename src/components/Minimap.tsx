import { useEffect, useRef } from 'react';
import { places, WORLD_RADIUS } from '../data/world';

export interface Pose {
  x: number;
  z: number;
  yaw: number;
}

interface Props {
  poseRef: React.MutableRefObject<Pose>;
  nearId: string | null;
  onPick: (placeId: string) => void;
}

/**
 * A map of the world, so nobody has to wander to find things.
 *
 * Drawn from the same place data the 3D world is built from, and clickable —
 * it doubles as fast travel.
 */
export default function Minimap({ poseRef, nearId, onPick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nearRef = useRef(nearId);
  nearRef.current = nearId;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 168;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const toMap = (x: number, z: number) => ({
      mx: size / 2 + (x / WORLD_RADIUS) * (size / 2 - 14),
      my: size / 2 + (z / WORLD_RADIUS) * (size / 2 - 14),
    });

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const pose = poseRef.current;

      ctx.clearRect(0, 0, size, size);

      ctx.fillStyle = '#e7e3da';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(23,23,27,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();

      for (const place of places) {
        const { mx, my } = toMap(place.at[0], place.at[1]);
        const active = nearRef.current === place.id;
        ctx.fillStyle = active ? '#b8391a' : '#45454e';
        ctx.beginPath();
        ctx.arc(mx, my, active ? 5 : 3.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // The player, as a wedge pointing where they face.
      const me = toMap(pose.x, pose.z);
      ctx.save();
      ctx.translate(me.mx, me.my);
      ctx.rotate(-pose.yaw + Math.PI);
      ctx.fillStyle = '#17171b';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [poseRef]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = rect.width;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    let best: { id: string; d: number } | null = null;
    for (const place of places) {
      const mx = size / 2 + (place.at[0] / WORLD_RADIUS) * (size / 2 - 14);
      const my = size / 2 + (place.at[1] / WORLD_RADIUS) * (size / 2 - 14);
      const d = Math.hypot(mx - px, my - py);
      if (d < 16 && (!best || d < best.d)) best = { id: place.id, d };
    }
    if (best) onPick(best.id);
  };

  return (
    <canvas
      className="minimap"
      ref={canvasRef}
      onClick={onClick}
      aria-hidden="true"
      style={{ width: 168, height: 168 }}
    />
  );
}
