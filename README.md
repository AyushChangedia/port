# Ayush Changedia — Interactive Profile

An interactive digital experience about Ayush Sameer Changedia: AI engineer and
backend developer, Pune, India.

Not a résumé page with animation on top. The site is a single continuous space —
one WebGL environment that morphs through five states as you scroll, with the
content composed over it. Typography is the primary surface; motion is used to
tell the story rather than to decorate it.

> This is a **new, standalone site**. It shares no code, markup, styling or
> assets with the existing portfolio at
> [ayushchangedia.github.io/AyushChangedia](https://ayushchangedia.github.io/AyushChangedia/),
> which lives in a different repository and was used **read-only**, purely as the
> source of factual content. Nothing there was modified.

## Running it

```bash
npm install
npm run dev        # development server
npm run build      # typecheck, then production build to dist/
npm run preview    # serve the production build
npm run typecheck  # types only
```

Requires Node 20.19+ or 22.12+.

## Deploying

`vite.config.ts` sets `base: './'`, so the contents of `dist/` work unchanged at
a domain root **and** at a subpath such as `/port/` on GitHub Pages. Build, then
publish `dist/`.

## Where the content lives

All facts are in `src/data/`, separate from the components that display them, so
they can be updated without touching any visual code:

| File | Holds |
| --- | --- |
| `profile.ts` | Name, role, bio, education, verified metrics, certifications |
| `projects.ts` | The four projects: copy, technologies, results, links |
| `experience.ts` | Internships and leadership roles |
| `skills.ts` | Technologies, and which projects each is actually used in |
| `socials.ts` | Email, GitHub, LinkedIn, résumé |
| `chapters.ts` | The five chapters, which are also the five environment states |

Every field traces to Ayush's own material — the live portfolio and the LaTeX
résumé. Nothing is invented: no fabricated clients, awards, statistics or links.
Where a project has no public repository, the site says so rather than linking
somewhere that does not exist.

## How it is built

```
src/
  webgl/        the environment: one point cloud, five layouts, blended in a shader
  components/   chapters, overlays, cursor, console
  lib/          scroll store, frame loop, device tiering, audio, magnetics
  data/         all factual content
  styles/       tokens and the base layer
```

**The environment.** `webgl/shaders/field.vert.ts` gives every point five
possible positions — a city of columns, a horizon, a corridor, a constellation,
a rising column — and blends between them along a single `phase` value derived
from scroll. The camera is choreographed against the same value, so the move and
the morph are always in step. It is mounted once and never torn down between
sections; that persistence is what makes the site read as one space rather than
five stacked pages.

**Pacing.** A `PRESENCE` curve in `webgl/field-engine.ts` decides how loud the
environment is per chapter. It opens and closes at full strength and pulls back
through the chapters meant to be read.

**Scroll.** Lenis and GSAP ScrollTrigger share a single `gsap.ticker` loop
(`lib/runtime.ts`). Scroll position and velocity live in a mutable store
(`lib/scroll.ts`) that components read inside that loop rather than through React
state, so scrolling never re-renders the tree. Velocity drives the width axis of
the variable display font — the type narrows as you move.

**Project visuals.** The source material contains no screenshots, so rather than
inventing mockups each project is drawn procedurally in `components/ProjectVisual.tsx`
as a diagram of what it actually does: an opening range breaking out, a
repository built as a city, a résumé being marked up, requests crossing an API.

## Performance

- three.js is a dynamic import in its own chunk — a device that cannot use WebGL
  never downloads it.
- Point budget and pixel-ratio cap adapt to a device tier derived from cores,
  memory and pointer type (`lib/device.ts`).
- One `requestAnimationFrame` loop for the entire page. Canvases pause when
  scrolled out of view or when the tab is hidden.
- WebGL and event listeners are disposed on unmount; context loss falls back
  without an error.

## Accessibility

- Semantic landmarks and headings, a skip link, and visible focus on everything
  focusable.
- The exhibition is fully keyboard operable: focusing a project brings its plate
  forward, Enter opens the case study, focus moves into the overlay and is
  restored on Escape.
- `prefers-reduced-motion` is honoured throughout — no smooth-scroll hijacking,
  no pinning, no custom cursor, no scroll-driven distortion.
- All text colours clear WCAG AA (4.5:1) against their own ground, in both
  colour modes.
- Without JavaScript, the page states who Ayush is and links to the résumé,
  GitHub, LinkedIn and email.

## Hidden

Three, for people who explore:

1. Type `AYUSH` anywhere to open a console (`help` lists its commands).
2. Double-click the wordmark to invert the whole environment into paper mode.
3. The `[ ]` in the footer opens the colophon.

## Sound

Off by default, remembered per visitor, and synthesised — there are no audio
files and nothing autoplays. The site is complete in silence.
