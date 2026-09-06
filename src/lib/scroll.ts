/**
 * A single source of truth for scroll, shared by the DOM and the WebGL layer.
 *
 * Deliberately outside React: scroll updates every frame, and routing that
 * through state would re-render the tree sixty times a second. Components
 * that need it read the mutable store from inside their own rAF loop.
 */

export interface ScrollState {
  /** Raw scroll offset in pixels. */
  y: number;
  /** 0–1 across the whole document. */
  progress: number;
  /** Signed, smoothed pixels-per-frame. Negative when scrolling up. */
  velocity: number;
  /** 0–1, absolute velocity normalised and clamped. Drives intensity. */
  intensity: number;
  /**
   * Continuous chapter position: 0 at the top of chapter 0, 1.5 halfway
   * between chapters 1 and 2. This is what the environment morphs along.
   */
  phase: number;
  /** Index of the chapter currently occupying the viewport centre. */
  active: number;
}

export const scroll: ScrollState = {
  y: 0,
  progress: 0,
  velocity: 0,
  intensity: 0,
  phase: 0,
  active: 0,
};

interface Anchor {
  index: number;
  el: HTMLElement;
  top: number;
}

const anchors: Anchor[] = [];
let measured = false;

export function registerChapter(el: HTMLElement, index: number): () => void {
  anchors.push({ index, el, top: 0 });
  anchors.sort((a, b) => a.index - b.index);
  measured = false;
  return () => {
    const i = anchors.findIndex((a) => a.el === el);
    if (i >= 0) anchors.splice(i, 1);
    measured = false;
  };
}

export function measureChapters(): void {
  for (const anchor of anchors) {
    anchor.top = anchor.el.getBoundingClientRect().top + window.scrollY;
  }
  measured = true;
}

export function chapterCount(): number {
  return anchors.length;
}

/**
 * Maps a scroll offset onto a continuous chapter phase. Using measured
 * positions rather than a flat progress ratio means the environment changes
 * state exactly when a chapter does, whatever its height.
 */
function computePhase(y: number): { phase: number; active: number } {
  if (!measured) measureChapters();
  if (anchors.length === 0) return { phase: 0, active: 0 };

  const focus = y + window.innerHeight * 0.42;

  if (focus <= anchors[0].top) return { phase: 0, active: 0 };

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (focus < b.top) {
      const span = Math.max(1, b.top - a.top);
      const local = (focus - a.top) / span;
      return { phase: i + Math.min(1, Math.max(0, local)), active: local > 0.5 ? i + 1 : i };
    }
  }
  const last = anchors.length - 1;
  return { phase: last, active: last };
}

let lastY = 0;
let smoothedVelocity = 0;

/** Called once per frame by the app's single rAF loop. */
export function updateScroll(y: number, externalVelocity?: number): void {
  const raw = externalVelocity ?? y - lastY;
  lastY = y;

  // Smooth aggressively: unfiltered velocity reads as jitter, not motion.
  smoothedVelocity += (raw - smoothedVelocity) * 0.12;
  if (Math.abs(smoothedVelocity) < 0.01) smoothedVelocity = 0;

  const limit = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const { phase, active } = computePhase(y);

  scroll.y = y;
  scroll.velocity = smoothedVelocity;
  scroll.intensity = Math.min(1, Math.abs(smoothedVelocity) / 55);
  scroll.progress = Math.min(1, Math.max(0, y / limit));
  scroll.phase = phase;
  scroll.active = active;
}
