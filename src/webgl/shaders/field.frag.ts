export const fieldFragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uInk;
uniform vec3 uSignal;
uniform vec3 uGround;

varying float vAlpha;
varying float vAccent;
varying float vDepth;

void main() {
  // Round, soft-edged points. Squares read as pixels; discs read as matter.
  vec2 uv = gl_PointCoord - 0.5;
  float d = dot(uv, uv);
  float mask = smoothstep(0.25, 0.055, d);
  if (mask <= 0.001) discard;

  // The accent is rationed: a few points per thousand carry it, so the
  // colour stays a signal instead of becoming a wash.
  vec3 color = mix(uInk, uSignal, clamp(vAccent, 0.0, 1.0));

  // Atmospheric depth — distant points recede into the ground colour
  // rather than simply dimming, which keeps the space feeling like air.
  color = mix(color, uGround, vDepth * 0.65);

  gl_FragColor = vec4(color, mask * vAlpha);
}
`;
