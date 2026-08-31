/**
 * Types shared between the engine and the React layer.
 */

export type ColorMode = 0 | 1 | 2; // species | speed | mono
export type InitMode = 0 | 1 | 2;   // cloud | blob | ring
export type BoundaryMode = 0 | 1;  // wrap | clamp

export interface EngineConfig {
  /** Texture side length. Agent count = size * size. */
  texSize: number;
  initMode: InitMode;
  boundary: BoundaryMode;
}

export interface EngineParams {
  dt: number;
  timeScale: number;
  field: [number, number, number, number]; // scale, strength, evolve, swirl
  species: [number, number, number, number]; // per-species gains
  jitter: number;
  pointSize: number;
  intensity: number;
  exposure: number;
  bloom: number;
  colorMode: ColorMode;
  showGrid: boolean;
  viewScale: number;
  viewShift: [number, number];
}

export interface EngineStats {
  fps: number;
  computeMs: number;
  renderMs: number;
  frameMs: number;
  agents: number;
  texSize: number;
  simTime: number;
  frameCount: number;
}

export const DEFAULT_PARAMS: EngineParams = {
  dt: 0.016,
  timeScale: 1.2,
  field: [3.0, 1.4, 0.18, 0.4],
  species: [0.28, 0.22, 0.24, 0.18],
  jitter: 0.003,
  pointSize: 1.6,
  intensity: 1.1,
  exposure: 1.8,
  bloom: 0.85,
  colorMode: 0,
  showGrid: false,
  // viewScale = 1.0 means the visible screen exactly matches the finite
  // world bounds [-1, 1]. Agents bouncing off the world edge bounce off
  // the visible frame — there is nothing "outside" to leak into.
  viewScale: 1.0,
  viewShift: [0, 0],
};

export const DEFAULT_CONFIG: EngineConfig = {
  texSize: 1024,
  initMode: 1, // 0 = uniform cloud, 1 = centered blob, 2 = ring
  // boundary = 1 means clamp + reflect: agents bounce off the edges of the
  // finite world and can never leave. This is the "finite container" mode
  // requested by the observer.
  boundary: 1,
};

/**
 * Texture size presets the UI exposes. We resolve down to whatever the
 * GPU actually supports at runtime, so the user can crank past the safe
 * limit on capable hardware.
 */
export const TEX_PRESETS: { label: string; size: number; agents: string }[] = [
  { label: "1K²", size: 1024, agents: "1.05M" },
  { label: "2K²", size: 2048, agents: "4.19M" },
  { label: "4K²", size: 4096, agents: "16.78M" },
  { label: "8K²", size: 8192, agents: "67.11M" },
];
