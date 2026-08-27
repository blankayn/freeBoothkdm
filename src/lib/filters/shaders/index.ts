import type { FilterId } from '../../../types/filters';

/**
 * One quad, one vertex shader. `v_uv` is authored so that (0,0) is the TOP-LEFT
 * of the *frame*, which lines up with 2D canvas coordinates and with MediaPipe's
 * normalised landmarks — no mental flipping anywhere downstream.
 *
 * Frame space is deliberately not texture space: the camera hands us whatever
 * aspect it feels like, and the booth always shoots 4:5. Fragment shaders do all
 * their maths in the clean 0..1 frame box and call `sampleFrame()`, which applies
 * the cover-crop into the real texture at the last moment.
 */
export const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_uv;
uniform float u_mirror;

void main() {
  vec2 uv = vec2((a_pos.x + 1.0) * 0.5, (1.0 - a_pos.y) * 0.5);
  uv.x = mix(uv.x, 1.0 - uv.x, u_mirror);
  v_uv = uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const HEADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_intensity;
uniform float u_time;
uniform vec2 u_center;
uniform float u_aspect;
uniform float u_radius;
uniform vec2 u_srcOffset;
uniform vec2 u_srcScale;

const float PI = 3.14159265359;

vec4 sampleFrame(vec2 uv) {
  return texture2D(u_texture, u_srcOffset + clamp(uv, 0.0, 1.0) * u_srcScale);
}

/* Radial helpers work in "height units": x is multiplied by the frame aspect so
   a circle stays a circle regardless of how wide the frame is. */
vec2 toRadial(vec2 uv, vec2 center, float aspect) {
  vec2 d = uv - center;
  d.x *= aspect;
  return d;
}

vec2 fromRadial(vec2 d, vec2 center, float aspect) {
  d.x /= aspect;
  return center + d;
}
`;

const ORIGINAL = `${HEADER}
void main() {
  gl_FragColor = sampleFrame(v_uv);
}
`;

/**
 * True spherical lens. Remapping r -> 2*asin(r)/PI is the projection of a flat
 * disc onto a hemisphere, so the middle of the frame reads as pushed out toward
 * the viewer. The mapping is exactly 1:1 at the rim, which means the effect
 * dissolves into the untouched image with no visible seam.
 */
const SPHERIZE = `${HEADER}
void main() {
  vec2 d = toRadial(v_uv, u_center, u_aspect);
  float r = length(d) / u_radius;
  if (r < 1.0 && r > 0.0001) {
    float sphere = 2.0 * asin(clamp(r, 0.0, 1.0)) / PI;
    d *= mix(1.0, sphere / r, u_intensity);
  }
  gl_FragColor = sampleFrame(fromRadial(d, u_center, u_aspect));
}
`;

const BULGE = `${HEADER}
void main() {
  vec2 d = toRadial(v_uv, u_center, u_aspect);
  float r = length(d) / u_radius;
  if (r < 1.0 && r > 0.0001) {
    float warped = pow(r, 1.0 + u_intensity * 2.2);
    d *= warped / r;
  }
  gl_FragColor = sampleFrame(fromRadial(d, u_center, u_aspect));
}
`;

const PINCH = `${HEADER}
void main() {
  vec2 d = toRadial(v_uv, u_center, u_aspect);
  float r = length(d) / u_radius;
  if (r < 1.0 && r > 0.0001) {
    float warped = pow(r, 1.0 / (1.0 + u_intensity * 1.8));
    d *= warped / r;
  }
  gl_FragColor = sampleFrame(fromRadial(d, u_center, u_aspect));
}
`;

const WAVE = `${HEADER}
void main() {
  vec2 uv = v_uv;
  float amp = u_intensity * 0.035;
  uv.x += sin(uv.y * 14.0 + u_time * 2.2) * amp;
  uv.y += cos(uv.x * 11.0 + u_time * 1.7) * amp * 0.55;
  gl_FragColor = sampleFrame(uv);
}
`;

/* Blends colour rather than coordinates, so partial intensity is a real
   cross-fade into the symmetrical version instead of a horizontal squash. */
const MIRROR = `${HEADER}
void main() {
  vec3 straight = sampleFrame(v_uv).rgb;
  vec3 mirrored = sampleFrame(vec2(min(v_uv.x, 1.0 - v_uv.x), v_uv.y)).rgb;
  gl_FragColor = vec4(mix(straight, mirrored, u_intensity), 1.0);
}
`;

const RGB_SHIFT = `${HEADER}
float hash(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
  vec2 uv = v_uv;

  // Occasional one-scanline tear, the way a worn tape drops tracking.
  float row = floor(uv.y * 90.0);
  float glitch = step(0.97, hash(row + floor(u_time * 8.0)));
  uv.x += (hash(row) - 0.5) * glitch * u_intensity * 0.06;

  vec2 dir = uv - vec2(0.5);
  float wobble = 0.65 + 0.35 * sin(u_time * 3.1);
  float amount = u_intensity * 0.018 * wobble;
  vec2 offset = vec2(amount, 0.0) + dir * amount * 0.7;

  vec3 col = vec3(
    sampleFrame(uv + offset).r,
    sampleFrame(uv).g,
    sampleFrame(uv - offset).b
  );

  float scan = 1.0 - u_intensity * 0.12 * step(0.5, fract(uv.y * 240.0));
  gl_FragColor = vec4(col * scan, 1.0);
}
`;

/* Whole-frame barrel. Dividing by (1 + k) pins the rim in place so the corners
   never sample outside the frame and smear. */
const FISHEYE = `${HEADER}
void main() {
  vec2 d = toRadial(v_uv, vec2(0.5), u_aspect);
  float maxR = length(vec2(0.5 * u_aspect, 0.5));
  float rn = length(d) / maxR;
  float k = u_intensity * 1.3;
  d *= (1.0 + k * rn * rn) / (1.0 + k);
  gl_FragColor = sampleFrame(fromRadial(d, vec2(0.5), u_aspect));
}
`;

const PIXEL = `${HEADER}
void main() {
  float blocks = mix(240.0, 16.0, u_intensity);
  vec2 grid = vec2(blocks, max(1.0, blocks / u_aspect));
  vec2 uv = (floor(v_uv * grid) + 0.5) / grid;
  vec3 col = sampleFrame(uv).rgb;
  float levels = mix(255.0, 7.0, u_intensity);
  col = floor(col * levels + 0.5) / levels;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* Swirl + bulge anchored to a tracked hand. The falloff is squared so the warp
   dies out well before the rim and the rest of the frame stays readable. */
const HAND_WARP = `${HEADER}
void main() {
  vec2 d = toRadial(v_uv, u_center, u_aspect);
  float r = length(d) / u_radius;
  if (r < 1.0) {
    float falloff = 1.0 - r * r;
    float angle = falloff * falloff * u_intensity * 2.6;
    float s = sin(angle);
    float c = cos(angle);
    d = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
    if (r > 0.0001) {
      float warped = pow(r, 1.0 + u_intensity * 1.4 * falloff);
      d *= mix(1.0, warped / r, falloff);
    }
  }
  gl_FragColor = sampleFrame(fromRadial(d, u_center, u_aspect));
}
`;

export const FRAGMENT_SHADERS: Record<FilterId, string> = {
  original: ORIGINAL,
  spherize: SPHERIZE,
  bulge: BULGE,
  pinch: PINCH,
  wave: WAVE,
  mirror: MIRROR,
  rgbshift: RGB_SHIFT,
  fisheye: FISHEYE,
  pixel: PIXEL,
  handwarp: HAND_WARP,
};

/** Radius of the affected disc, in frame-height units. Ignored by full-frame filters. */
export const FILTER_RADIUS: Partial<Record<FilterId, number>> = {
  spherize: 0.62,
  bulge: 0.5,
  pinch: 0.55,
  handwarp: 0.42,
};
