"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TEX_PRESETS,
  type ColorMode,
  type EngineParams,
  type InitMode,
} from "./types";
import {
  Pause,
  Play,
  RotateCcw,
  Crosshair,
  Eye,
  Settings2,
} from "lucide-react";

interface Props {
  params: EngineParams;
  paused: boolean;
  texSize: number;
  maxTexSize: number;
  onParams: (p: EngineParams) => void;
  onTogglePause: () => void;
  onReset: (mode: InitMode) => void;
  onTexSize: (size: number) => void;
}

export function ControlsPanel({
  params,
  paused,
  texSize,
  maxTexSize,
  onParams,
  onTogglePause,
  onReset,
  onTexSize,
}: Props) {
  const set = <K extends keyof EngineParams>(k: K, v: EngineParams[K]) =>
    onParams({ ...params, [k]: v });

  return (
    <Card className="pointer-events-auto w-[320px] border border-white/10 bg-black/60 backdrop-blur-md">
      <div className="px-4 py-3">
        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
            <Settings2 className="h-3 w-3" />
            Control
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onTogglePause}
              className="h-7 px-2 text-[11px] text-white/70 hover:bg-white/10 hover:text-white"
            >
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {paused ? "Resume" : "Pause"}
            </Button>
          </div>
        </div>

        {/* Population */}
        <Section title="Population">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-white/40">Texture size</Label>
            <span className="text-[10px] font-mono text-white/60">
              {(texSize * texSize / 1e6).toFixed(2)}M agents
            </span>
          </div>
          <Select
            value={String(texSize)}
            onValueChange={(v) => onTexSize(Number(v))}
          >
            <SelectTrigger className="h-8 border-white/10 bg-white/5 text-[11px] text-white/80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-black/90 text-white/80">
              {TEX_PRESETS.map((p) => {
                const disabled = p.size > maxTexSize;
                return (
                  <SelectItem
                    key={p.size}
                    value={String(p.size)}
                    disabled={disabled}
                    className="text-[11px]"
                  >
                    {p.label} — {p.agents}
                    {disabled && " (unsupported)"}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            {([0, 1, 2] as InitMode[]).map((m) => (
              <Button
                key={m}
                size="sm"
                variant="ghost"
                onClick={() => onReset(m)}
                className="h-7 flex-1 border border-white/10 text-[10px] text-white/60 hover:bg-white/10 hover:text-white"
              >
                {m === 0 ? "Cloud" : m === 1 ? "Blob" : "Ring"}
                <RotateCcw className="ml-1 h-2.5 w-2.5" />
              </Button>
            ))}
          </div>
        </Section>

        {/* Dynamics */}
        <Section title="Phase space">
          <SliderRow
            label="Time scale"
            value={params.timeScale}
            min={0}
            max={4}
            step={0.05}
            onValue={(v) => set("timeScale", v)}
            fmt={(v) => v.toFixed(2) + "x"}
          />
          <SliderRow
            label="Noise scale"
            value={params.field[0]}
            min={0.5}
            max={8}
            step={0.1}
            onValue={(v) => set("field", [v, params.field[1], params.field[2], params.field[3]])}
            fmt={(v) => v.toFixed(1)}
          />
          <SliderRow
            label="Flow strength"
            value={params.field[1]}
            min={0}
            max={3}
            step={0.05}
            onValue={(v) => set("field", [params.field[0], v, params.field[2], params.field[3]])}
            fmt={(v) => v.toFixed(2)}
          />
          <SliderRow
            label="Evolve rate"
            value={params.field[2]}
            min={0}
            max={1}
            step={0.01}
            onValue={(v) => set("field", [params.field[0], params.field[1], v, params.field[3]])}
            fmt={(v) => v.toFixed(2)}
          />
          <SliderRow
            label="Swirl"
            value={params.field[3]}
            min={0}
            max={2}
            step={0.05}
            onValue={(v) => set("field", [params.field[0], params.field[1], params.field[2], v])}
            fmt={(v) => v.toFixed(2)}
          />
          <SliderRow
            label="Thermal jitter"
            value={params.jitter}
            min={0}
            max={0.05}
            step={0.001}
            onValue={(v) => set("jitter", v)}
            fmt={(v) => (v * 1000).toFixed(1) + "m"}
          />
        </Section>

        {/* Species */}
        <Section title="Species bias">
          {(["α", "β", "γ", "δ"] as const).map((sym, i) => (
            <SliderRow
              key={sym}
              label={`Species ${sym}`}
              value={params.species[i]}
              min={0}
              max={1}
              step={0.01}
              onValue={(v) => {
                const sp = [...params.species] as [number, number, number, number];
                sp[i] = v;
                set("species", sp);
              }}
              fmt={(v) => v.toFixed(2)}
            />
          ))}
        </Section>

        {/* Rendering */}
        <Section title="Render">
          <SliderRow
            label="Point size"
            value={params.pointSize}
            min={0.5}
            max={6}
            step={0.1}
            onValue={(v) => set("pointSize", v)}
            fmt={(v) => v.toFixed(1) + "px"}
          />
          <SliderRow
            label="Intensity"
            value={params.intensity}
            min={0}
            max={2}
            step={0.01}
            onValue={(v) => set("intensity", v)}
            fmt={(v) => v.toFixed(2)}
          />
          <SliderRow
            label="Exposure"
            value={params.exposure}
            min={0}
            max={4}
            step={0.05}
            onValue={(v) => set("exposure", v)}
            fmt={(v) => v.toFixed(2)}
          />
          <SliderRow
            label="Bloom"
            value={params.bloom}
            min={0}
            max={2}
            step={0.05}
            onValue={(v) => set("bloom", v)}
            fmt={(v) => v.toFixed(2)}
          />
          <SliderRow
            label="Zoom"
            value={params.viewScale}
            min={0.25}
            max={4}
            step={0.05}
            onValue={(v) => set("viewScale", v)}
            fmt={(v) => v.toFixed(2) + "x"}
          />

          <div className="mt-2 flex items-center justify-between">
            <Label className="flex items-center gap-1 text-[10px] text-white/40">
              <Eye className="h-2.5 w-2.5" /> Color mode
            </Label>
            <Select
              value={String(params.colorMode)}
              onValueChange={(v) => set("colorMode", Number(v) as ColorMode)}
            >
              <SelectTrigger className="h-7 w-[120px] border-white/10 bg-white/5 text-[10px] text-white/80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-black/90 text-white/80">
                <SelectItem value="0" className="text-[11px]">Species</SelectItem>
                <SelectItem value="1" className="text-[11px]">Speed</SelectItem>
                <SelectItem value="2" className="text-[11px]">Monochrome</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <Label className="flex items-center gap-1 text-[10px] text-white/40">
              <Crosshair className="h-2.5 w-2.5" /> Grid overlay
            </Label>
            <Switch
              checked={params.showGrid}
              onCheckedChange={(v) => set("showGrid", v)}
            />
          </div>
        </Section>
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
      <div className="mb-2 text-[9px] uppercase tracking-[0.25em] text-white/30">
        {title}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onValue,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValue: (v: number) => void;
  fmt: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-white/40">{label}</Label>
        <span className="font-mono text-[10px] text-white/70 tabular-nums">
          {fmt(value)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onValue(v[0])}
        className="mt-1 h-1.5"
      />
    </div>
  );
}
