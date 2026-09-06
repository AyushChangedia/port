# Ayush Changedia — Interactive Profile

A small 3D world you walk around. Every structure holds part of Ayush Sameer
Changedia's record — the four projects, where he has worked, what he builds
with, how to reach him — and walking up to one opens it as a plain, readable
page.

There is no scrolling narrative and nothing to sit through. You steer.

> This is a **new, standalone site**. It shares no code, markup, styling or
> assets with the existing portfolio at
> [ayushchangedia.github.io/AyushChangedia](https://ayushchangedia.github.io/AyushChangedia/),
> which lives in a different repository and was used **read-only**, purely as
> the source of factual content. Nothing there was modified.

## Two rules the design answers to

**Everything you read sits on an opaque surface.** No text floats over the 3D
scene — not the panels, not the HUD chips, not even the signs above the
structures, which are drawn as dark text on a solid plate. Every text colour
clears WCAG AA (4.5:1) against its own background.

**Exploring is optional.** The world is one way in. The other is the page: a
button in the corner, the first thing in the tab order, and the automatic
choice when WebGL is unavailable or the visitor prefers reduced motion. Both
views render from the same content, so choosing to read costs you nothing.

## Running it

```bash
npm install
npm run dev        # development server
npm run build      # typecheck, then production build to dist/
npm run preview    # serve the production build
```

Requires Node 20.19+ or 22.12+.

## Deploying

`vite.config.ts` sets `base: './'`, so `dist/` works unchanged at a domain root
and at a subpath like `/port/`. A GitHub Actions workflow in
`.github/workflows/deploy.yml` publishes to Pages; it needs Pages switched on
once under **Settings → Pages → Source: GitHub Actions**.

## Getting around

| Input | Does |
| --- | --- |
| `W` `A` `S` `D` / arrows | Walk and turn |
| `Shift` | Run |
| `Space` | Jump |
| Drag | Look around |
| Click or tap a structure | Walk there, then open it |
| Click or tap the ground | Walk to that spot |
| `E` / Enter | Open whatever you are standing at |
| `M` | Open the directory of places |
| Click the minimap | Travel |
| `Esc` | Close whatever is open |

The directory is the keyboard path: one keystroke, focus lands on the first
place, Enter opens it. Nobody has to steer anything to reach the content.

## Where the content lives

All facts sit in `src/data/`, separate from anything that draws them:

| File | Holds |
| --- | --- |
| `profile.ts` | Name, role, bio, education, verified metrics, certifications |
| `projects.ts` | The four projects: copy, technologies, results, links |
| `experience.ts` | Internships and leadership roles |
| `skills.ts` | Technologies, and which projects each is actually used in |
| `socials.ts` | Email, GitHub, LinkedIn, résumé |
| `world.ts` | Where each place stands, how close you must get, how solid it is |

Every field traces to Ayush's own material — the live portfolio and the LaTeX
résumé. Nothing is invented: no fabricated clients, awards, statistics or
links. Projects with no public repository say so rather than linking somewhere
that does not exist.

## How it is built

```
src/
  world/     engine.ts    (camera, movement, collision, picking)
             build.ts     (the structures and the reflecting plaza)
             scenery.ts   (skyline, planting, lamps, benches, birds)
             materials.ts (the shared PBR material set)
             sky.ts       (gradient dome with a sun glow)
             labels.ts    (the signs, drawn to canvas)
  panels/    content.tsx — what each place says, used by both views
  components/ Panel, Hud, Minimap, Directory, ReadableSite
  data/      all factual content, including the world layout
```

**The structures are the wayfinding.** Each has a distinct silhouette so you
navigate by landmark rather than by reading: Git City is a city of towers, the
backtester is a row of bars stepping out of a marked range, contact is a gate.
All of it is box and cylinder geometry over two shared materials, which keeps
the scene cheap enough for a phone.

**Movement is a circle sliding on a plane** — no physics engine, just
acceleration, damping, and a push-out against each structure's radius. Clicking
raycasts against the structures; a miss falls through to the ground plane and
walks you there, because the arches have gaps people will click straight
through.

**Reflections come from an environment probe.** `RoomEnvironment` is rendered
once through a `PMREMGenerator` and used as the scene's environment map, which
is what makes the glazing and the metalwork read as glass and metal rather than
as flat colour. The plaza itself is a real mirror (`Reflector`) on capable
devices and a glossy floor everywhere else.

**Everything outside the plaza is instanced.** The skyline, the planting, the
lamps, the benches and the birds are seven `InstancedMesh` draws in total. A
plaza with nine objects on it reads as a test scene; the horizon is what makes
it read as somewhere.

## Performance and fallbacks

- three.js is a dynamic import in its own chunk — a device that cannot use
  WebGL never downloads it.
- Shadows, antialiasing and pixel ratio step down on low-tier devices.
- **Adaptive resolution.** The scene is fill-rate bound, so when frames run
  long the renderer sheds pixels (down to 55%) rather than geometry, and takes
  them back when there is headroom. The world stays intact either way.
- The glazing deliberately avoids `transmission`. Real refraction forces an
  extra full scene render every frame; clearcoat over a reflective base costs
  nothing like it and looks near-identical at these sizes.
- Vertical field of view narrows on portrait screens, so a phone does not spend
  half its frame on empty floor.
- If the WebGL context fails at any point, the page view takes over.
- The world pauses whenever a panel or the directory is open.

## Accessibility

- Semantic landmarks, a skip link that goes straight to the page view, and
  visible focus on everything focusable.
- Panels and the directory trap Tab, close on `Esc`, and restore focus.
- `prefers-reduced-motion` opens the page view by default, removes the walking
  bob, and can still be overridden by anyone who wants the world.
- Without JavaScript, the page states who Ayush is and links to the résumé,
  GitHub, LinkedIn and email.
