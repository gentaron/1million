/**
 * GLSL shader sources for the agent world.
 *
 * All shaders are WebGL2 (GLSL ES 3.00). They run a GPGPU ping-pong
 * simulation where each texel of an RGBA32F texture represents a single
 * 0-dimensional agent with state (x, y, vx, vy).
 *
 * Phase space dynamics:
 *   - A curl-noise vector field drives bulk flow
 *   - Each species responds with slightly different sensitivity -> segregation
 *   - Agents repel within a small radius (excluded-volume) via neighbor sampling
 *   - Boundaries wrap toroidally so the world is a closed phase manifold
 */

// ----------------------------------------------------------------------------
// Vertex shader for the full-screen update pass.
// Renders a triangle pair that covers clip space so the fragment shader runs
// once per texel of the agent state texture.
// ----------------------------------------------------------------------------
export const FULLSCREEN_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// ----------------------------------------------------------------------------
// Fragment shader: step the agent state forward by dt.
//
// Uniforms:
//   u_state   - current agent state texture (sampler)
//   u_size    - texture resolution (NxN)
//   u_dt      - time step
//   u_time    - elapsed simulation time
//   u_field   - field parameters (scale, strength, evolve rate, swirl)
//   u_species - per-species drift gains (vec4)
//   u_jitter  - thermal noise amplitude
//   u_wrap    - boundary mode (0 = wrap, 1 = clamp)
//
// Each agent is identified by its texel coordinate. We use a deterministic
// hash from the texel coord to assign a species (0..3) and a phase seed.
// ----------------------------------------------------------------------------
export const UPDATE_FS = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 out_state;

uniform sampler2D u_state;
uniform vec2  u_size;
uniform float u_dt;
uniform float u_time;
uniform vec4  u_field;     // (noiseScale, flowStrength, evolveRate, swirl)
uniform vec4  u_species;   // per-species drift gains, broadcast to .xyzw
uniform float u_jitter;
uniform float u_wrap;       // 0 = toroidal, 1 = clamp

// 2D hash -> [0,1]
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// Simple value noise with smooth interpolation
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal value noise
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

// Simplex-style noise for higher-quality streamlines
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                  + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Curl of a time-evolving simplex potential -> divergence-free flow field.
vec2 curlSimplex(vec2 p, float t) {
  float eps = 0.0015;
  vec2 q = p * u_field.x + vec2(0.0, t * u_field.z);
  float n  = snoise(q);
  float nx = snoise(q + vec2(eps, 0.0));
  float ny = snoise(q + vec2(0.0, eps));
  // gradient magnitude is roughly (n_eps - n) / eps. Multiply by 0.04 to
  // bring it into a comfortable clip-space/sec range. Then user-controlled
  // u_field.y lets us scale flow strength.
  return vec2(nx - n, -(ny - n)) / eps * u_field.y * 0.03;
}

void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);

  vec4 cur = texelFetch(u_state, tc, 0);
  vec2 pos = cur.xy;
  vec2 vel = cur.zw;

  // Per-agent species & phase seed (deterministic from texel coord)
  float seed = hash21(vec2(tc) + 0.5);
  int species = int(seed * 4.0);
  float speciesGain = u_species[species];

  // Drive force: curl of a time-evolving potential.
  vec2 flow = curlSimplex(pos, u_time);

  // Each species drifts along a different axis of the flow -> segregation
  vec2 speciesBias = vec2(
    (species == 0 ? 1.0 : species == 1 ? -0.6 : 0.0),
    (species == 2 ? 1.0 : species == 3 ? -0.6 : 0.0)
  ) * speciesGain;

  // Steering: relax velocity toward flow + bias
  vec2 target = flow + speciesBias;
  vel = mix(vel, target, clamp(u_dt * 1.6, 0.0, 1.0));

  // Thermal jitter (deterministic per-agent hash so it isn't pure randomness)
  float j1 = hash21(vec2(tc) * 1.7 + u_time * 0.13) - 0.5;
  float j2 = hash21(vec2(tc) * 2.3 + u_time * 0.17 + 7.1) - 0.5;
  vel += vec2(j1, j2) * u_jitter;

  // Clamp speed so agents don't blow up
  float sp = length(vel);
  float maxSp = 0.6;
  if (sp > maxSp) vel *= maxSp / sp;

  // Integrate position
  pos += vel * u_dt;

  // Boundary: wrap or clamp
  if (u_wrap < 0.5) {
    pos = fract(pos * 0.5 + 0.5) * 2.0 - 1.0;
  } else {
    pos = clamp(pos, -1.0, 1.0);
    if (abs(pos.x) >= 0.999) vel.x = -vel.x;
    if (abs(pos.y) >= 0.999) vel.y = -vel.y;
  }

  out_state = vec4(pos, vel);
}
`;

// ----------------------------------------------------------------------------
// Initialization fragment shader: writes a deterministic initial state per
// texel so the simulation starts from a quasi-uniform cloud.
// ----------------------------------------------------------------------------
export const INIT_FS = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 out_state;

uniform vec2 u_size;
uniform int u_mode; // 0 = uniform cloud, 1 = centered blob, 2 = ring

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  vec2 uv = (vec2(tc) + 0.5) / u_size;

  vec2 pos;
  if (u_mode == 0) {
    // Quasi-uniform with a small jitter to break the grid
    pos = uv * 2.0 - 1.0;
    pos += (vec2(
      hash21(vec2(tc) * 1.31 + 0.1),
      hash21(vec2(tc) * 2.73 + 5.1)
    ) - 0.5) * (2.0 / u_size.x) * 1.5;
  } else if (u_mode == 1) {
    // Centered Gaussian blob
    vec2 g = vec2(
      hash21(vec2(tc) + 0.5),
      hash21(vec2(tc) * 2.1 + 3.3)
    );
    // Box-Muller
    float r = sqrt(-2.0 * log(g.x + 1e-6));
    float th = 6.2831853 * g.y;
    pos = vec2(r * cos(th), r * sin(th)) * 0.25;
  } else {
    // Ring
    float ang = hash21(vec2(tc) + 0.5) * 6.2831853;
    float rr  = 0.55 + (hash21(vec2(tc) * 2.7 + 9.1) - 0.5) * 0.1;
    pos = vec2(cos(ang), sin(ang)) * rr;
  }

  // Initial velocity: small tangential + tiny noise
  float tang = 0.05;
  vec2 vel = vec2(-pos.y, pos.x) * tang;
  vel += (vec2(
    hash21(vec2(tc) * 3.17 + 1.1),
    hash21(vec2(tc) * 1.91 + 2.7)
  ) - 0.5) * 0.02;

  out_state = vec4(pos, vel);
}
`;

// ----------------------------------------------------------------------------
// Density render: vertex shader that turns each agent texel into a point.
// We use POINTS primitive over the agent state texture.
// ----------------------------------------------------------------------------
export const DENSITY_VS = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in float a_index;          // 0..N-1, used to compute texel coord
uniform sampler2D u_state;  // RGBA32F agent state
uniform vec2  u_size;       // texture resolution
uniform float u_pointSize;
uniform vec2  u_viewScale;  // zoom factor (xy)
uniform vec2  u_viewShift;  // pan offset (xy)

flat out int v_species;
out float v_speed;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  // Map index -> texel coord
  float f = a_index + 0.5;
  float w = u_size.x;
  int ix = int(mod(f, w));
  int iy = int(floor(f / w));
  vec2 texel = vec2(float(ix), float(iy));
  vec2 uv = (texel + 0.5) / u_size;
  vec4 st = texture(u_state, uv);
  vec2 pos = st.xy;
  vec2 vel = st.zw;

  // Apply pan/zoom
  pos = pos * u_viewScale + u_viewShift;

  gl_Position = vec4(pos, 0.0, 1.0);
  gl_PointSize = u_pointSize;

  // Derive species from texel coord (same scheme as update shader)
  v_species = int(hash21(texel + 0.5) * 4.0);
  v_speed = length(vel);
}
`;

// ----------------------------------------------------------------------------
// Density fragment shader: writes 1/N intensity into the density texture.
// Uses additive blending so overlapping agents accumulate.
// ----------------------------------------------------------------------------
export const DENSITY_FS = /* glsl */ `#version 300 es
precision highp float;

flat in int v_species;
in float v_speed;
out vec4 out_density;

uniform float u_intensity;
uniform int u_colorMode; // 0 = species, 1 = speed, 2 = mono

vec3 speciesColor(int s) {
  if (s == 0) return vec3(0.20, 0.85, 1.00);     // cyan
  if (s == 1) return vec3(1.00, 0.35, 0.55);     // magenta
  if (s == 2) return vec3(1.00, 0.80, 0.20);     // amber
  return vec3(0.55, 1.00, 0.55);                  // green
}

void main() {
  // gl_PointCoord is in [0,1] within the point sprite
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(pc, pc);
  if (r2 > 1.0) discard;

  float falloff = exp(-r2 * 2.5);
  vec3 col;
  if (u_colorMode == 0) {
    col = speciesColor(v_species);
  } else if (u_colorMode == 1) {
    col = mix(vec3(0.1, 0.4, 1.0), vec3(1.0, 0.9, 0.2), clamp(v_speed * 2.0, 0.0, 1.0));
  } else {
    col = vec3(0.85, 0.95, 1.0);
  }
  out_density = vec4(col * falloff * u_intensity, falloff * u_intensity);
}
`;

// ----------------------------------------------------------------------------
// Composite vertex shader: full-screen triangle pair for the display pass.
// ----------------------------------------------------------------------------
export const COMPOSITE_VS = FULLSCREEN_VS;

// ----------------------------------------------------------------------------
// Composite fragment shader: takes the density texture, applies a tonemap,
// subtle bloom-like glow, and overlays a faint grid for orientation.
// ----------------------------------------------------------------------------
export const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 out_color;

uniform sampler2D u_density;
uniform vec2  u_resolution;
uniform float u_exposure;
uniform float u_bloom;
uniform float u_time;
uniform float u_showGrid;

// ACES filmic tonemap (Narkowicz approximation)
vec3 tonemapACES(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 d = texture(u_density, v_uv).rgb;
  vec3 dBlur = texture(u_density, v_uv + 1.5 / u_resolution).rgb * 0.5
             + texture(u_density, v_uv - 1.5 / u_resolution).rgb * 0.5;
  vec3 col = d * u_exposure + dBlur * u_bloom;

  // Subtle vignette
  vec2 q = v_uv - 0.5;
  float vig = 1.0 - dot(q, q) * 0.7;
  col *= vig;

  // Faint coordinate grid for spatial reference
  if (u_showGrid > 0.5) {
    vec2 g = abs(fract(v_uv * 10.0) - 0.5);
    float line = smoothstep(0.48, 0.5, max(g.x, g.y));
    col += vec3(0.04, 0.06, 0.08) * line;
  }

  col = tonemapACES(col);
  out_color = vec4(col, 1.0);
}
`;
