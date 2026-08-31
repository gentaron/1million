/**
 * AgentWorldEngine — WebGL2 GPGPU engine that simulates and renders up to
 * ~100 million 0-dimensional agents in a simple phase space.
 *
 * Pipeline (per frame):
 *   1. UPDATE  — full-screen fragment shader steps every agent forward by dt
 *   2. RENDER  — POINTS draw scatters each agent into a density FBO with
 *                additive blending
 *   3. COMPOSITE — full-screen fragment shader tonemaps density + bloom + grid
 *
 * State is ping-ponged between two RGBA32F textures of size texSize × texSize.
 *
 * All shaders use `layout(location = 0)` for their vertex input, so a single
 * VAO works for every program.
 */

import {
  FULLSCREEN_VS,
  UPDATE_FS,
  INIT_FS,
  DENSITY_VS,
  DENSITY_FS,
  COMPOSITE_FS,
} from "./shaders";
import {
  type EngineConfig,
  type EngineParams,
  type EngineStats,
} from "./types";

// ---- GL helpers ------------------------------------------------------------

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}\n--- source ---\n${src}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`Program link failed: ${log}`);
  }
  return p;
}

function createFloatTexture(
  gl: WebGL2RenderingContext,
  size: number,
  data?: Float32Array,
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    size,
    size,
    0,
    gl.RGBA,
    gl.FLOAT,
    data ?? null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createFBO(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return fbo;
}

// ---- Engine ---------------------------------------------------------------

export class AgentWorldEngine {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;

  // Programs
  private progUpdate: WebGLProgram;
  private progInit: WebGLProgram;
  private progDensity: WebGLProgram;
  private progComposite: WebGLProgram;

  // Geometry
  private vboQuad: WebGLBuffer;
  private vaoQuad: WebGLVertexArrayObject;
  private vboIndex: WebGLBuffer;
  private vaoDensity: WebGLVertexArrayObject;

  // State textures (ping-pong)
  private texStateA: WebGLTexture;
  private texStateB: WebGLTexture;
  private fboStateA: WebGLFramebuffer;
  private fboStateB: WebGLFramebuffer;
  private readIsA = true;

  // Density target
  private texDensity: WebGLTexture;
  private fboDensity: WebGLFramebuffer;

  // Config
  private config: EngineConfig;
  private params: EngineParams;

  // Cached uniform locations
  private uUpdate: Record<string, WebGLUniformLocation | null> = {};
  private uInit: Record<string, WebGLUniformLocation | null> = {};
  private uDensity: Record<string, WebGLUniformLocation | null> = {};
  private uComposite: Record<string, WebGLUniformLocation | null> = {};

  // Timing
  private simTime = 0;
  private frameCount = 0;
  private lastFrameAt = performance.now();
  private fpsEMA = 60;
  private computeMsEMA = 0;
  private renderMsEMA = 0;
  private frameMsEMA = 0;
  private densityWidth = 0;
  private densityHeight = 0;
  private disposed = false;

  public onStats?: (stats: EngineStats) => void;

  constructor(canvas: HTMLCanvasElement, config: EngineConfig, params: EngineParams) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      alpha: false,
    });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;

    this.config = config;
    this.params = { ...params };

    // Required extensions for RGBA32F rendering targets
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error("EXT_color_buffer_float is not available; cannot render to RGBA32F textures.");
    }
    // Optional but desirable
    gl.getExtension("OES_texture_float_linear");

    // Programs
    const vsFS = compile(gl, gl.VERTEX_SHADER, FULLSCREEN_VS);
    this.progUpdate = link(gl, vsFS, compile(gl, gl.FRAGMENT_SHADER, UPDATE_FS));
    this.progInit = link(gl, vsFS, compile(gl, gl.FRAGMENT_SHADER, INIT_FS));
    this.progDensity = link(gl, compile(gl, gl.VERTEX_SHADER, DENSITY_VS), compile(gl, gl.FRAGMENT_SHADER, DENSITY_FS));
    this.progComposite = link(gl, vsFS, compile(gl, gl.FRAGMENT_SHADER, COMPOSITE_FS));

    // Full-screen quad VAO (a_pos at location 0)
    this.vboQuad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboQuad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    this.vaoQuad = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoQuad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Index buffer for density pass: 0..N-1 as floats.
    const N = config.texSize * config.texSize;
    this.vboIndex = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboIndex);
    const indices = new Float32Array(N);
    for (let i = 0; i < N; i++) indices[i] = i;
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.vaoDensity = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoDensity);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // State textures
    this.texStateA = createFloatTexture(gl, config.texSize);
    this.texStateB = createFloatTexture(gl, config.texSize);
    this.fboStateA = createFBO(gl, this.texStateA);
    this.fboStateB = createFBO(gl, this.texStateB);

    // Density render target
    this.reallocateDensityTarget();

    // Cache uniform locations
    this.cacheUniforms();

    // Init state
    this.runInit();

    // Set up viewport
    this.resize();
  }

  private cacheUniforms() {
    const gl = this.gl;
    const pick = (prog: WebGLProgram, names: string[]) => {
      const m: Record<string, WebGLUniformLocation | null> = {};
      for (const n of names) m[n] = gl.getUniformLocation(prog, n);
      return m;
    };
    this.uUpdate = pick(this.progUpdate, [
      "u_state", "u_size", "u_dt", "u_time",
      "u_field", "u_species", "u_jitter", "u_wrap",
    ]);
    this.uInit = pick(this.progInit, ["u_size", "u_mode"]);
    this.uDensity = pick(this.progDensity, [
      "u_state", "u_size", "u_pointSize", "u_viewScale", "u_viewShift",
      "u_intensity", "u_colorMode",
    ]);
    this.uComposite = pick(this.progComposite, [
      "u_density", "u_resolution", "u_exposure", "u_bloom",
      "u_time", "u_showGrid",
    ]);
  }

  private reallocateDensityTarget() {
    const gl = this.gl;
    const w = this.canvas.clientWidth || 1280;
    const h = this.canvas.clientHeight || 720;
    // Render density at display resolution (capped to GPU max).
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const dw = Math.min(w, maxTex);
    const dh = Math.min(h, maxTex);
    this.densityWidth = dw;
    this.densityHeight = dh;
    if (this.texDensity) gl.deleteTexture(this.texDensity);
    if (this.fboDensity) gl.deleteFramebuffer(this.fboDensity);
    this.texDensity = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texDensity);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, dw, dh, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fboDensity = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboDensity);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texDensity, 0);
  }

  /** Re-initialize agent state from scratch. */
  public reset(initMode?: 0 | 1 | 2) {
    if (initMode != null) this.config = { ...this.config, initMode };
    this.runInit();
    this.simTime = 0;
    this.frameCount = 0;
  }

  private runInit() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboStateA);
    gl.viewport(0, 0, this.config.texSize, this.config.texSize);
    gl.disable(gl.BLEND);
    gl.useProgram(this.progInit);
    gl.uniform2f(this.uInit.u_size, this.config.texSize, this.config.texSize);
    gl.uniform1i(this.uInit.u_mode, this.config.initMode);
    this.drawFullscreen();
    // Mirror to the other texture so both states start identical.
    this.readIsA = true;
    this.copyReadToWrite();
  }

  private copyReadToWrite() {
    const gl = this.gl;
    const read = this.readIsA ? this.fboStateA : this.fboStateB;
    const write = this.readIsA ? this.fboStateB : this.fboStateA;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, write);
    gl.blitFramebuffer(
      0, 0, this.config.texSize, this.config.texSize,
      0, 0, this.config.texSize, this.config.texSize,
      gl.COLOR_BUFFER_BIT, gl.NEAREST,
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }

  private drawFullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.vaoQuad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** Resize canvas backing store to match CSS pixels × devicePixelRatio. */
  public resize() {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.reallocateDensityTarget();
    gl.viewport(0, 0, w, h);
  }

  public setParams(p: EngineParams) {
    this.params = { ...p };
  }

  public getParams(): EngineParams {
    return { ...this.params };
  }

  public getConfig(): EngineConfig {
    return { ...this.config };
  }

  /** Tear down and rebuild state textures at a new size. */
  public async reconfigure(config: Partial<EngineConfig>) {
    const gl = this.gl;
    const newConfig: EngineConfig = { ...this.config, ...config };
    if (newConfig.texSize === this.config.texSize &&
        newConfig.boundary === this.config.boundary) {
      this.config = newConfig;
      if (config.initMode != null) this.reset();
      return;
    }

    // Rebuild index buffer for new texSize
    const N = newConfig.texSize * newConfig.texSize;
    const indices = new Float32Array(N);
    for (let i = 0; i < N; i++) indices[i] = i;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboIndex);
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Free old textures
    gl.deleteTexture(this.texStateA);
    gl.deleteTexture(this.texStateB);
    gl.deleteFramebuffer(this.fboStateA);
    gl.deleteFramebuffer(this.fboStateB);

    this.config = newConfig;
    this.texStateA = createFloatTexture(gl, newConfig.texSize);
    this.texStateB = createFloatTexture(gl, newConfig.texSize);
    this.fboStateA = createFBO(gl, this.texStateA);
    this.fboStateB = createFBO(gl, this.texStateB);

    this.runInit();
    this.simTime = 0;
    this.frameCount = 0;
  }

  /** Run one full simulation + render frame. */
  public frame() {
    if (this.disposed) return;
    const gl = this.gl;
    const t0 = performance.now();

    // --- 1. UPDATE ---
    const readTex = this.readIsA ? this.texStateA : this.texStateB;
    const writeFbo = this.readIsA ? this.fboStateB : this.fboStateA;

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
    gl.viewport(0, 0, this.config.texSize, this.config.texSize);
    gl.disable(gl.BLEND);
    gl.useProgram(this.progUpdate);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.uniform1i(this.uUpdate.u_state, 0);
    gl.uniform2f(this.uUpdate.u_size, this.config.texSize, this.config.texSize);
    gl.uniform1f(this.uUpdate.u_dt, this.params.dt * this.params.timeScale);
    gl.uniform1f(this.uUpdate.u_time, this.simTime);
    gl.uniform4f(this.uUpdate.u_field, ...this.params.field);
    gl.uniform4f(this.uUpdate.u_species, ...this.params.species);
    gl.uniform1f(this.uUpdate.u_jitter, this.params.jitter);
    gl.uniform1f(this.uUpdate.u_wrap, this.config.boundary);

    gl.bindVertexArray(this.vaoQuad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    this.readIsA = !this.readIsA;
    this.simTime += this.params.dt * this.params.timeScale;

    const t1 = performance.now();

    // --- 2. DENSITY ---
    const curTex = this.readIsA ? this.texStateA : this.texStateB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboDensity);
    gl.viewport(0, 0, this.densityWidth, this.densityHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive
    gl.useProgram(this.progDensity);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, curTex);
    gl.uniform1i(this.uDensity.u_state, 0);
    gl.uniform2f(this.uDensity.u_size, this.config.texSize, this.config.texSize);
    gl.uniform1f(this.uDensity.u_pointSize, this.params.pointSize);
    gl.uniform2f(this.uDensity.u_viewScale, this.params.viewScale, this.params.viewScale);
    gl.uniform2f(this.uDensity.u_viewShift, ...this.params.viewShift);
    gl.uniform1f(this.uDensity.u_intensity, this.params.intensity);
    gl.uniform1i(this.uDensity.u_colorMode, this.params.colorMode);

    gl.bindVertexArray(this.vaoDensity);
    const N = this.config.texSize * this.config.texSize;
    gl.drawArrays(gl.POINTS, 0, N);
    gl.bindVertexArray(null);

    gl.disable(gl.BLEND);

    const t2 = performance.now();

    // --- 3. COMPOSITE ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.progComposite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texDensity);
    gl.uniform1i(this.uComposite.u_density, 0);
    gl.uniform2f(this.uComposite.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uComposite.u_exposure, this.params.exposure);
    gl.uniform1f(this.uComposite.u_bloom, this.params.bloom);
    gl.uniform1f(this.uComposite.u_time, this.simTime);
    gl.uniform1f(this.uComposite.u_showGrid, this.params.showGrid ? 1 : 0);

    gl.bindVertexArray(this.vaoQuad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    const t3 = performance.now();

    // Stats (exponential moving average)
    const now = t3;
    const frameMs = now - this.lastFrameAt;
    this.lastFrameAt = now;
    const alpha = 0.1;
    this.fpsEMA = this.fpsEMA * (1 - alpha) + (1000 / Math.max(1, frameMs)) * alpha;
    this.computeMsEMA = this.computeMsEMA * (1 - alpha) + (t1 - t0) * alpha;
    this.renderMsEMA = this.renderMsEMA * (1 - alpha) + ((t2 - t1) + (t3 - t2)) * alpha;
    this.frameMsEMA = this.frameMsEMA * (1 - alpha) + frameMs * alpha;
    this.frameCount++;

    this.onStats?.({
      fps: this.fpsEMA,
      computeMs: this.computeMsEMA,
      renderMs: this.renderMsEMA,
      frameMs: this.frameMsEMA,
      agents: this.config.texSize * this.config.texSize,
      texSize: this.config.texSize,
      simTime: this.simTime,
      frameCount: this.frameCount,
    });
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteTexture(this.texStateA);
    gl.deleteTexture(this.texStateB);
    gl.deleteTexture(this.texDensity);
    gl.deleteFramebuffer(this.fboStateA);
    gl.deleteFramebuffer(this.fboStateB);
    gl.deleteFramebuffer(this.fboDensity);
    gl.deleteBuffer(this.vboQuad);
    gl.deleteBuffer(this.vboIndex);
    gl.deleteVertexArray(this.vaoQuad);
    gl.deleteVertexArray(this.vaoDensity);
    gl.deleteProgram(this.progUpdate);
    gl.deleteProgram(this.progInit);
    gl.deleteProgram(this.progDensity);
    gl.deleteProgram(this.progComposite);
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
  }
}
