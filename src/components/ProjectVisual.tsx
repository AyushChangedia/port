import { useEffect, useRef } from 'react';
import type { VisualKind } from '../data/projects';
import { onFrame } from '../lib/runtime';
import { useInView, useReducedMotion } from '../lib/hooks';
import { hash } from '../lib/text';
import './project-visual.css';

interface Props {
  kind: VisualKind;
  /** 0–1, eased by the parent on hover. */
  energy: number;
  label: string;
}

interface Palette {
  ink: string;
  faint: string;
  signal: string;
}

type Renderer = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  energy: number,
  palette: Palette,
) => void;

/**
 * The source portfolio contains no project screenshots, so rather than
 * inventing mockups each project is drawn procedurally as a diagram of the
 * thing it actually does — a price range breaking out, a repository built as a
 * city, a résumé being marked up, a request crossing an API.
 *
 * Honest, and considerably more interesting than a stock browser frame.
 */
const RENDERERS: Record<VisualKind, Renderer> = {
  // ORB Strategy Backtester — an opening range, and a price path leaving it.
  range(ctx, w, h, t, energy, palette) {
    const pad = w * 0.08;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const mid = pad + innerH / 2;

    // Baseline grid — quiet, and only fully present on hover.
    ctx.strokeStyle = palette.faint;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.25 + energy * 0.4;
    for (let i = 0; i <= 4; i += 1) {
      const y = pad + (innerH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The opening range: the box the whole strategy is defined against.
    const rangeW = innerW * 0.22;
    const rangeH = innerH * 0.16;
    ctx.strokeStyle = palette.signal;
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([3, 4]);
    ctx.strokeRect(pad, mid - rangeH / 2, rangeW, rangeH);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Price. Deterministic, so the same shape is drawn on every visit.
    const steps = 92;
    const sweep = (t * 0.16 + energy * 0.25) % 1.35;
    const drawn = Math.min(steps, Math.floor(sweep * steps));

    ctx.beginPath();
    let y = mid;
    for (let i = 0; i <= drawn; i += 1) {
      const x = pad + (innerW / steps) * i;
      const wander = (hash(i * 1.7) - 0.5) * innerH * 0.09;
      // Inside the range it chops; past it, it trends.
      const breakout = i < steps * 0.22 ? 0 : ((i - steps * 0.22) / steps) * innerH * 0.62;
      y = mid + wander - breakout + Math.sin(i * 0.28) * innerH * 0.035;
      y = Math.max(pad, Math.min(h - pad, y));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // The live edge of the backtest.
    if (drawn > 0 && drawn <= steps) {
      const x = pad + (innerW / steps) * drawn;
      ctx.fillStyle = palette.signal;
      ctx.beginPath();
      ctx.arc(x, y, 2.6 + energy * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // Git City — a repository laid out as blocks, growing by line count.
  city(ctx, w, h, t, energy, palette) {
    const cols = 14;
    const rows = 9;
    const tileW = w / (cols + rows) * 1.7;
    const tileH = tileW * 0.5;
    const originX = w * 0.5;
    const originY = h * 0.24;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const seed = hash(r * 31.3 + c * 7.1);
        // Streets: districts read only if some plots stay empty.
        if (seed < 0.28) continue;

        // Buildings rise in sequence, the way the playback replays history.
        const order = (r * cols + c) / (rows * cols);
        const grow = Math.max(0, Math.min(1, (t * 0.22 + energy * 0.4) % 1.6 - order));
        if (grow <= 0) continue;

        const height = seed * tileH * 5.2 * Math.min(1, grow * 2);
        const x = originX + (c - r) * tileW * 0.5;
        const y = originY + (c + r) * tileH * 0.5 - height;

        // Two faces and a cap — enough to read as volume, cheap to draw.
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = palette.faint;
        ctx.beginPath();
        ctx.moveTo(x, y + tileH);
        ctx.lineTo(x, y + tileH + height);
        ctx.lineTo(x + tileW * 0.5, y + tileH * 1.5 + height);
        ctx.lineTo(x + tileW * 0.5, y + tileH * 1.5);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = seed > 0.93 ? palette.signal : palette.ink;
        ctx.globalAlpha = seed > 0.93 ? 0.95 : 0.55;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + tileH);
        ctx.lineTo(x + tileW * 0.5, y + tileH * 0.5);
        ctx.lineTo(x + tileW, y + tileH);
        ctx.lineTo(x + tileW * 0.5, y + tileH * 1.5);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  },

  // Résumé Roaster — lines of a document, scored and struck through.
  critique(ctx, w, h, t, energy, palette) {
    const pad = w * 0.09;
    const lines = 11;
    const gap = (h - pad * 2) / lines;
    const cycle = (t * 0.35 + energy) % (lines + 4);

    for (let i = 0; i < lines; i += 1) {
      const y = pad + gap * i + gap * 0.35;
      const width = (w - pad * 2) * (0.42 + hash(i * 4.4) * 0.55);

      ctx.fillStyle = palette.faint;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(pad, y, width, 2);
      ctx.globalAlpha = 1;

      // Weak bullets get struck, in order, as the critique lands.
      const flagged = hash(i * 9.1) > 0.62;
      if (flagged && cycle > i) {
        const progress = Math.min(1, cycle - i);
        ctx.strokeStyle = palette.signal;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(pad, y + 1);
        ctx.lineTo(pad + width * progress, y + 1);
        ctx.stroke();

        if (progress > 0.9) {
          ctx.fillStyle = palette.signal;
          ctx.fillRect(pad - 10, y - 1, 4, 4);
        }
      }
    }

    // The score, drawn as an arc that fills as the pass completes.
    const cx = w - pad - 26;
    const cy = pad + 26;
    const radius = 20;
    ctx.strokeStyle = palette.faint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    const filled = Math.min(1, cycle / lines);
    ctx.strokeStyle = palette.signal;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * filled);
    ctx.stroke();
  },

  // E-Commerce REST API — endpoints, and requests moving between them.
  graph(ctx, w, h, t, energy, palette) {
    const nodes = [
      { x: 0.12, y: 0.5 },
      { x: 0.36, y: 0.24 },
      { x: 0.36, y: 0.76 },
      { x: 0.62, y: 0.16 },
      { x: 0.62, y: 0.5 },
      { x: 0.62, y: 0.84 },
      { x: 0.88, y: 0.36 },
      { x: 0.88, y: 0.66 },
    ].map((n) => ({ x: n.x * w, y: n.y * h }));

    const edges: [number, number][] = [
      [0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5], [3, 6], [4, 6], [4, 7], [5, 7],
    ];

    ctx.strokeStyle = palette.faint;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    for (const [a, b] of edges) {
      ctx.beginPath();
      ctx.moveTo(nodes[a].x, nodes[a].y);
      ctx.lineTo(nodes[b].x, nodes[b].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Requests in flight. More of them when the visitor is engaged.
    const packets = 3 + Math.round(energy * 4);
    for (let p = 0; p < packets; p += 1) {
      const edge = edges[Math.floor(hash(p * 5.5) * edges.length)];
      const speed = 0.24 + hash(p * 2.2) * 0.3;
      const progress = (t * speed + hash(p * 8.8)) % 1;
      const a = nodes[edge[0]];
      const b = nodes[edge[1]];
      ctx.fillStyle = palette.signal;
      ctx.beginPath();
      ctx.arc(a.x + (b.x - a.x) * progress, a.y + (b.y - a.y) * progress, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const r = i === 0 ? 6 : 4;
      ctx.fillStyle = palette.ink;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();

      // The entry point carries the auth ring.
      if (i === 0) {
        ctx.strokeStyle = palette.signal;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 5 + Math.sin(t * 2) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  },
};

export default function ProjectVisual({ kind, energy, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [wrapRef, inView] = useInView<HTMLDivElement>(0.05);
  const reduced = useReducedMotion();
  const energyRef = useRef(energy);
  energyRef.current = energy;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const styles = getComputedStyle(document.documentElement);
    const palette: Palette = {
      ink: styles.getPropertyValue('--ink').trim() || '#e9e5db',
      faint: styles.getPropertyValue('--ink-faint').trim() || '#5d594f',
      signal: styles.getPropertyValue('--signal').trim() || '#d8452a',
    };

    const draw = (t: number) => {
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      RENDERERS[kind](ctx, width, height, t, energyRef.current, palette);
    };

    // A static frame is drawn immediately, so the visual is complete even if
    // it never animates — off screen, in a background tab, or reduced motion.
    draw(reduced ? 8 : 0);

    if (reduced) {
      return () => observer.disconnect();
    }

    const off = onFrame((_dt, elapsed) => {
      // Paused when scrolled away or when the tab is hidden. Four canvases
      // redrawing behind a backgrounded tab is exactly the kind of cost this
      // site should not have.
      if (!inView || document.hidden) return;
      draw(elapsed);
    });

    return () => {
      off();
      observer.disconnect();
    };
  }, [kind, inView, reduced]);

  return (
    <div className="project-visual" ref={wrapRef}>
      <canvas ref={canvasRef} role="img" aria-label={label} />
      <span className="project-visual-frame" aria-hidden="true" />
    </div>
  );
}
