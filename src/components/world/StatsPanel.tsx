"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import type { EngineStats } from "./types";

interface Props {
  stats: EngineStats | null;
  paused: boolean;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

function fmtTime(s: number): string {
  if (s < 60) return s.toFixed(1) + "s";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function StatsPanel({ stats, paused }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="pointer-events-auto w-[260px] border border-white/10 bg-black/60 backdrop-blur-md">
      <div className="px-4 py-3 font-mono text-[11px] leading-relaxed text-white/80">
        <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Observation
          </span>
          <span className={`flex items-center gap-1 text-[10px] ${paused ? "text-amber-400" : "text-emerald-400"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${paused ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`} />
            {paused ? "PAUSED" : "LIVE"}
          </span>
        </div>
        <Row label="Agents" value={stats ? fmtNum(stats.agents) : "—"} />
        <Row label="Texture" value={stats ? `${stats.texSize}²` : "—"} />
        <Row label="FPS" value={stats ? stats.fps.toFixed(1) : "—"} />
        <Row label="Compute" value={stats ? `${stats.computeMs.toFixed(2)}ms` : "—"} />
        <Row label="Render" value={stats ? `${stats.renderMs.toFixed(2)}ms` : "—"} />
        <Row label="Frame" value={stats ? `${stats.frameMs.toFixed(2)}ms` : "—"} />
        <Row label="Sim time" value={stats ? fmtTime(stats.simTime) : "—"} />
        <Row label="Frames" value={stats ? fmtNum(stats.frameCount) : "—"} />
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-white/40">{label}</span>
      <span className="text-white/90 tabular-nums">{value}</span>
    </div>
  );
}
