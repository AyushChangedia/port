/**
 * The environment field.
 *
 * One point cloud for the entire site. Rather than a separate scene per
 * section, every point knows five possible positions and the vertex shader
 * blends between them along `uPhase`. That is what makes the site read as one
 * continuous space: the environment never cuts, it transforms.
 *
 *   0  FIELD        a dense city of columns, seen obliquely
 *   1  HORIZON      the city settles flat into a calm plane
 *   2  CORRIDOR     the plane wraps into a tunnel you travel through
 *   3  CONSTELLATION the tunnel breaks into clustered nodes
 *   4  ASCENT       the nodes converge into a single rising column
 */
export const fieldVertexShader = /* glsl */ `
precision highp float;

attribute vec4 aSeed;    // four independent randoms per point
attribute vec2 aColumn;  // grid coordinate, -1..1
attribute float aStack;  // 0..1 position within its column

uniform float uTime;
uniform float uPhase;
uniform float uReveal;
uniform float uIntensity;
uniform float uPresence;
uniform float uVelocity;
uniform vec3  uPointer;
uniform float uPointerStrength;
uniform float uSize;
uniform float uPixelRatio;

varying float vAlpha;
varying float vAccent;
varying float vDepth;

const float TAU = 6.28318530718;
const float SPREAD = 26.0;
const float NODES = 12.0;

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Cheap value noise — enough character for a skyline, a fraction of the cost
// of simplex at this point count.
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float ridges(vec2 p) {
  return valueNoise(p) * 0.62 + valueNoise(p * 2.3) * 0.26 + valueNoise(p * 4.7) * 0.12;
}

// 0 — FIELD. A city of dotted columns: districts, streets and a skyline.
// Deliberately built from coherent vertical stacks rather than scattered
// points — the difference between architecture and dust.
vec4 layoutField(float t) {
  // Ridged noise gives a few tall districts and many low ones, the way line
  // counts actually distribute across a repository.
  float h = pow(ridges(aColumn * 1.9 + 7.0), 2.4);

  // Streets: wide gaps carved on both axes so districts read as blocks.
  float streetX = smoothstep(0.06, 0.22, abs(fract(aColumn.x * 4.0) - 0.5));
  float streetZ = smoothstep(0.06, 0.22, abs(fract(aColumn.y * 4.0) - 0.5));
  float plot = streetX * streetZ;

  // Columns keep their footprint exactly: any jitter here turns the grid back
  // into noise. The only offset is per-column, never per-point.
  float jitter = hash21(aColumn * 37.0) - 0.5;
  vec3 p = vec3(
    // Offset to one side: the city is composed against the typography rather
    // than centred behind it, which leaves the reading column clear.
    aColumn.x * SPREAD * 0.85 + 9.0 + jitter * 0.22,
    aStack * h * 7.0 * plot,
    aColumn.y * SPREAD + jitter * 0.18
  );

  // The whole city sits well below eyeline, so the headline stays clean.
  p.y -= 5.6;

  // Empty plots collapse to the ground rather than floating.
  float alpha = mix(0.12, 1.0, plot) * (0.35 + h * 0.9);
  return vec4(p, alpha);
}

// 1 — HORIZON. Everything lies down. Stillness, after the density.
vec4 layoutHorizon(float t) {
  vec3 p = vec3(aColumn.x * SPREAD * 1.7, 0.0, aColumn.y * SPREAD * 1.55);
  p.y =
    sin(p.x * 0.09 + t * 0.22) * 0.75 +
    sin(p.z * 0.13 - t * 0.17) * 0.55 +
    (aSeed.z - 0.5) * 0.12;
  return vec4(p, 1.0);
}

// 2 — CORRIDOR. The plane rolls into a tunnel. Depth, and a direction to move.
vec4 layoutCorridor(float t) {
  float a = aSeed.x * TAU + t * 0.05;
  // Held wide and hollow: the centre of the frame is where the reading
  // happens, so nothing is allowed to drift into it.
  float r = 12.0 + pow(aSeed.y, 1.6) * 9.0;
  float z = (aSeed.z - 0.5) * 96.0;
  vec3 p = vec3(cos(a) * r, sin(a) * r * 0.66, z);
  p += (aSeed.xyz - 0.5) * 0.5;
  return vec4(p, 0.55);
}

// 3 — CONSTELLATION. Points collapse into discrete clusters: the technology
// system, before the DOM layer names any of it.
vec4 layoutConstellation(float t) {
  float n = floor(aSeed.w * NODES);
  float ax = hash11(n * 3.1 + 1.0);
  float ay = hash11(n * 7.7 + 2.0);
  float az = hash11(n * 5.3 + 3.0);
  vec3 center = vec3((ax - 0.5) * 30.0, (ay - 0.5) * 14.0, (az - 0.5) * 20.0);
  center.y += sin(t * 0.4 + n) * 0.5;

  vec3 offset = normalize(aSeed.xyz - 0.5 + 0.001) * pow(hash11(aSeed.w * 91.0), 0.55) * 2.3;
  return vec4(center + offset, 1.0);
}

// 4 — ASCENT. A single column, rising and dispersing. The closing state.
vec4 layoutAscent(float t) {
  float a = aSeed.x * TAU;
  // Wide and thin. A tight column here becomes a pillar of dust straight
  // through the closing statement, which is the opposite of the intent.
  float r = 4.0 + pow(aSeed.y, 1.1) * 17.0;
  float rise = mod(aSeed.z * 44.0 + t * 1.5, 44.0) - 16.0;
  vec3 p = vec3(cos(a) * r + 7.0, rise, sin(a) * r);
  float fade = (1.0 - smoothstep(6.0, 20.0, rise)) * smoothstep(4.0, 9.0, r) * 0.5;
  return vec4(p, fade);
}

vec4 layoutAt(int index, float t) {
  if (index <= 0) return layoutField(t);
  if (index == 1) return layoutHorizon(t);
  if (index == 2) return layoutCorridor(t);
  if (index == 3) return layoutConstellation(t);
  return layoutAscent(t);
}

void main() {
  float t = uTime;
  float phase = clamp(uPhase, 0.0, 4.0);
  int i = int(floor(phase));
  float f = fract(phase);

  // Points cross between states on slightly different schedules, so the
  // environment dissolves rather than snapping as a single sheet.
  float stagger = (aSeed.w - 0.5) * 0.22;
  float k = clamp((f - stagger) / max(0.0001, 1.0 - abs(stagger)), 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);

  vec4 a = layoutAt(i, t);
  vec4 b = layoutAt(i + 1, t);
  vec4 blended = mix(a, b, k);
  vec3 pos = blended.xyz;
  float alpha = blended.w;

  // Pointer: a physical push through the field, falling off with distance.
  float pd = length(pos.xz - uPointer.xz);
  float influence = uPointerStrength * exp(-pd * pd * 0.011);
  pos.y += influence * 3.4;
  vec2 away = pos.xz - uPointer.xz;
  pos.xz += normalize(away + vec2(0.0001)) * influence * 1.6;

  // Scroll velocity turbulence. Still when the visitor is still.
  float turbulence = uIntensity * 1.35;
  pos.y += sin(pos.x * 0.22 + t * 2.3 + aSeed.x * 6.0) * turbulence;
  pos.x += cos(pos.z * 0.18 - t * 1.7) * turbulence * 0.5;
  pos.z -= uVelocity * 1.4;

  // Intro reveal: the field assembles from below.
  pos.y -= (1.0 - uReveal) * 26.0 * (0.4 + aSeed.y);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = -mv.z;
  vDepth = clamp(dist / 78.0, 0.0, 1.0);

  float size = uSize * (0.78 + aSeed.y * 0.34);
  size *= 1.0 + uIntensity * 0.55;
  gl_PointSize = clamp(size * uPixelRatio * (34.0 / max(dist, 1.0)), 0.6, 9.0);

  vAccent = step(0.955, aSeed.w) + step(0.988, aSeed.x) * 0.6;
  vAlpha = alpha * uReveal * uPresence * (1.0 - vDepth * 0.9) * 0.58 * smoothstep(0.0, 0.11, vDepth);
}
`;
