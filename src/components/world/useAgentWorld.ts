"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentWorldEngine } from "./engine";
import { DEFAULT_CONFIG, DEFAULT_PARAMS, type EngineConfig, type EngineParams, type EngineStats } from "./types";

export interface UseAgentWorldOptions {
  initialConfig?: EngineConfig;
  initialParams?: EngineParams;
  paused?: boolean;
  onStats?: (s: EngineStats) => void;
}

export interface UseAgentWorldResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  engineRef: React.MutableRefObject<AgentWorldEngine | null>;
  error: string | null;
  ready: boolean;
  reconfigure: (config: Partial<EngineConfig>) => Promise<void>;
  reset: (initMode?: 0 | 1 | 2) => void;
  setParams: (p: EngineParams) => void;
  resize: () => void;
}

export function useAgentWorld(opts: UseAgentWorldOptions = {}): UseAgentWorldResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AgentWorldEngine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const pausedRef = useRef(opts.paused ?? false);
  const rafRef = useRef<number | null>(null);
  const statsCallbackRef = useRef(opts.onStats);
  const lastStatsEmitRef = useRef(0);

  // Keep stats callback ref fresh
  useEffect(() => {
    statsCallbackRef.current = opts.onStats;
  }, [opts.onStats]);

  // Keep pausedRef in sync without re-creating the loop
  useEffect(() => {
    pausedRef.current = opts.paused ?? false;
  }, [opts.paused]);

  // Init engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: AgentWorldEngine;
    try {
      engine = new AgentWorldEngine(
        canvas,
        opts.initialConfig ?? DEFAULT_CONFIG,
        opts.initialParams ?? DEFAULT_PARAMS,
      );
    } catch (e) {
      queueMicrotask(() => setError(e instanceof Error ? e.message : String(e)));
      return;
    }

    // Stats are throttled: only emit at most every ~200ms to avoid flooding
    // React with state updates on every frame.
    engine.onStats = (s) => {
      const now = performance.now();
      if (now - lastStatsEmitRef.current >= 200) {
        lastStatsEmitRef.current = now;
        statsCallbackRef.current?.(s);
      }
    };

    engineRef.current = engine;
    queueMicrotask(() => setReady(true));

    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas);
    engine.resize();

    const loop = () => {
      if (!pausedRef.current) engine.frame();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
      queueMicrotask(() => setReady(false));
    };
  }, []);

  const reconfigure = useCallback(async (config: Partial<EngineConfig>) => {
    if (engineRef.current) await engineRef.current.reconfigure(config);
  }, []);

  const reset = useCallback((initMode?: 0 | 1 | 2) => {
    engineRef.current?.reset(initMode);
  }, []);

  const setParams = useCallback((p: EngineParams) => {
    engineRef.current?.setParams(p);
  }, []);

  const resize = useCallback(() => {
    engineRef.current?.resize();
  }, []);

  return { canvasRef, engineRef, error, ready, reconfigure, reset, setParams, resize };
}
