"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentWorld } from "./useAgentWorld";
import { StatsPanel } from "./StatsPanel";
import { ControlsPanel } from "./ControlsPanel";
import { IntroOverlay } from "./IntroOverlay";
import {
  DEFAULT_CONFIG,
  DEFAULT_PARAMS,
  type EngineConfig,
  type EngineParams,
  type EngineStats,
} from "./types";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Activity,
  Pause,
  Play,
  Maximize2,
} from "lucide-react";

export function AgentWorld() {
  const [params, setParams] = useState<EngineParams>(DEFAULT_PARAMS);
  const [config, setConfig] = useState<EngineConfig>(DEFAULT_CONFIG);
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [showStats, setShowStats] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [maxTexSize, setMaxTexSize] = useState(8192);

  // Pan / zoom view transform state (separate from engine params for smoothness)
  const dragRef = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const viewShiftRef = useRef<[number, number]>([0, 0]);
  const viewScaleRef = useRef<number>(1);

  const onStats = useCallback((s: EngineStats) => {
    setStats(s);
  }, []);

  const { canvasRef, error, ready, reconfigure, reset, setParams: engineSetParams } =
    useAgentWorld({ onStats, paused });

  // Push param changes (including pan/zoom) to engine on every change.
  useEffect(() => {
    engineSetParams({
      ...params,
      viewScale: viewScaleRef.current,
      viewShift: viewShiftRef.current,
    });
  }, [params, engineSetParams]);

  // Probe the GPU's MAX_TEXTURE_SIZE once the engine is ready.
  useEffect(() => {
    if (!ready) return;
    const gl = canvasRef.current?.getContext("webgl2") as WebGL2RenderingContext | null;
    if (gl) {
      const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      queueMicrotask(() => setMaxTexSize(max));
      // If the default texSize exceeds what the GPU supports, drop to 4096.
      if (max < DEFAULT_CONFIG.texSize) {
        const safe = max >= 4096 ? 4096 : max >= 2048 ? 2048 : 1024;
        queueMicrotask(() => setConfig((c) => ({ ...c, texSize: safe })));
        reconfigure({ texSize: safe });
      }
    }
  }, [ready, canvasRef, reconfigure]);

  // Sync params on initial mount too (after engine is ready).
  useEffect(() => {
    if (ready) {
      engineSetParams({
        ...params,
        viewScale: viewScaleRef.current,
        viewShift: viewShiftRef.current,
      });
    }
  }, [ready, engineSetParams, params]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " ") { e.preventDefault(); setPaused(p => !p); }
      if (e.key === "r" || e.key === "R") reset();
      if (e.key === "h" || e.key === "H") { setShowStats(s => !s); setShowControls(s => !s); }
      if (e.key === "g" || e.key === "G") setParams(p => ({ ...p, showGrid: !p.showGrid }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset]);

  // Pan & zoom handlers (pointer events)
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      sx: viewShiftRef.current[0],
      sy: viewShiftRef.current[1],
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.x) / e.currentTarget.clientWidth;
    const dy = (e.clientY - dragRef.current.y) / e.currentTarget.clientHeight;
    const scale = 2.0 / viewScaleRef.current; // shift is in clip space
    viewShiftRef.current = [
      dragRef.current.sx + dx * scale,
      dragRef.current.sy - dy * scale, // flip Y
    ];
    engineSetParams({
      ...params,
      viewScale: viewScaleRef.current,
      viewShift: viewShiftRef.current,
    });
  }, [params, engineSetParams]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    viewScaleRef.current = Math.max(0.1, Math.min(20, viewScaleRef.current * factor));
    engineSetParams({
      ...params,
      viewScale: viewScaleRef.current,
      viewShift: viewShiftRef.current,
    });
  }, [params, engineSetParams]);

  // Re-center view
  const recenter = useCallback(() => {
    viewShiftRef.current = [0, 0];
    viewScaleRef.current = 1;
    engineSetParams({
      ...params,
      viewScale: 1,
      viewShift: [0, 0],
    });
  }, [params, engineSetParams]);

  // Tex size change
  const onTexSize = useCallback((size: number) => {
    setConfig(c => ({ ...c, texSize: size }));
    reconfigure({ texSize: size });
  }, [reconfigure]);

  // Boundary mode change (no need to rebuild textures; just flip the flag)
  const onBoundary = useCallback((mode: 0 | 1) => {
    setConfig(c => ({ ...c, boundary: mode }));
    reconfigure({ boundary: mode });
  }, [reconfigure]);

  // Reset (re-init)
  const onReset = useCallback((mode: 0 | 1 | 2) => {
    setConfig(c => ({ ...c, initMode: mode }));
    reset(mode);
  }, [reset]);

  // Fullscreen
  const onFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      el.requestFullscreen?.();
    }
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {/* WebGL canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing"
        style={{ display: "block" }}
      />

      {/* Top-left: title + stats */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 flex flex-col gap-3">
        <div className="pointer-events-auto">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/40">
            Agent Observer
          </h1>
          <h2 className="mt-0.5 font-mono text-lg font-light text-white/90">
            1億の観測者
          </h2>
          <p className="mt-0.5 max-w-[260px] text-[10px] leading-relaxed text-white/30">
            0 次元の点エージェントが curl-noise 位相空間で創発する世界を観測する
          </p>
        </div>
        {showStats && <StatsPanel stats={stats} paused={paused} />}
      </div>

      {/* Top-right: view tools */}
      <div className="pointer-events-auto absolute right-4 top-4 z-30 flex flex-col gap-2">
        <ViewButton onClick={() => setPaused(p => !p)} title={paused ? "Resume (Space)" : "Pause (Space)"}>
          {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        </ViewButton>
        <ViewButton onClick={recenter} title="Recenter view">
          <Maximize2 className="h-3 w-3" />
        </ViewButton>
        <ViewButton onClick={() => setShowStats(s => !s)} title="Toggle stats (H)" active={showStats}>
          <Activity className="h-3 w-3" />
        </ViewButton>
        <ViewButton onClick={() => setShowControls(s => !s)} title="Toggle controls (H)" active={showControls}>
          <Eye className="h-3 w-3" />
        </ViewButton>
        <ViewButton onClick={onFullscreen} title="Fullscreen">
          <Maximize2 className="h-3 w-3" />
        </ViewButton>
      </div>

      {/* Bottom-center: controls panel */}
      {showControls && (
        <div className="pointer-events-auto absolute bottom-4 right-4 z-30 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <ControlsPanel
            params={params}
            paused={paused}
            texSize={config.texSize}
            boundary={config.boundary}
            maxTexSize={maxTexSize}
            onParams={setParams}
            onTogglePause={() => setPaused(p => !p)}
            onReset={onReset}
            onTexSize={onTexSize}
            onBoundary={onBoundary}
          />
        </div>
      )}

      {/* Collapsed controls toggle */}
      {!showControls && (
        <Button
          onClick={() => setShowControls(true)}
          variant="ghost"
          className="pointer-events-auto absolute bottom-4 right-4 z-30 border border-white/10 bg-black/60 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-3 w-3" /> Control
        </Button>
      )}

      {/* Hint bar */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-full border border-white/5 bg-black/40 px-4 py-1.5 text-[10px] text-white/40 backdrop-blur-sm">
          <span><kbd className="rounded bg-white/10 px-1 text-[9px] text-white/70">drag</kbd> pan</span>
          <span className="text-white/15">·</span>
          <span><kbd className="rounded bg-white/10 px-1 text-[9px] text-white/70">wheel</kbd> zoom</span>
          <span className="text-white/15">·</span>
          <span><kbd className="rounded bg-white/10 px-1 text-[9px] text-white/70">space</kbd> pause</span>
          <span className="text-white/15">·</span>
          <span><kbd className="rounded bg-white/10 px-1 text-[9px] text-white/70">R</kbd> reset</span>
          <span className="text-white/15">·</span>
          <span><kbd className="rounded bg-white/10 px-1 text-[9px] text-white/70">G</kbd> grid</span>
        </div>
      </div>

      {/* Error overlay */}
      {error && (
        <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-6">
          <div className="max-w-md rounded-xl border border-red-500/30 bg-zinc-950 p-6">
            <h2 className="mb-2 text-sm uppercase tracking-widest text-red-400">
              Initialization failed
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-white/70">
              このブラウザ / GPU 環境では、1 億エージェントの観測に必要な
              WebGL2 と <code className="text-cyan-300">EXT_color_buffer_float</code> が利用できません。
            </p>
            <pre className="overflow-auto rounded bg-black/60 p-3 text-[11px] text-red-300">
{error}
            </pre>
            <p className="mt-3 text-[11px] text-white/50">
              対応ブラウザ: Chrome / Edge / Firefox 最新版。モバイル Safari は一部制限があります。
            </p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black">
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-cyan-400" />
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
              Spinning up phase space…
            </p>
          </div>
        </div>
      )}

      {/* Intro modal */}
      <IntroOverlay onClose={() => {}} />

      {/* Bottom right small link */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-20 hidden md:block">
        <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/20">
          GPGPU · WebGL2 · Curl-noise manifold
        </p>
      </div>
    </div>
  );
}

function ViewButton({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-md border text-white/60 backdrop-blur-md transition hover:bg-white/10 hover:text-white ${
        active ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : "border-white/10 bg-black/50"
      }`}
    >
      {children}
    </button>
  );
}
