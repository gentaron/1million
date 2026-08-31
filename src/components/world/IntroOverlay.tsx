"use client";

import { useSyncExternalStore, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

// ---------------------------------------------------------------------------
// SSR-safe localStorage probe.
//
// `useSyncExternalStore` is the React team's official escape hatch for reading
// browser-only state without triggering hydration mismatches. React always
// uses the server snapshot (false) during hydration, then reconciles to the
// client snapshot in a follow-up render — no hydration error.
// ---------------------------------------------------------------------------
function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getClientSnapshot(): boolean {
  // After hydration, return whether the intro has been dismissed before.
  return typeof window !== "undefined" && !!localStorage.getItem("1m-intro-seen");
}

function getServerSnapshot(): boolean {
  // During SSR and initial hydration: never consider it "seen",
  // so the rendered tree is identical on server and client.
  return false;
}

export function IntroOverlay({ onClose }: { onClose: () => void }) {
  // seen === true  -> previously dismissed -> render nothing
  // seen === false -> first visit -> render the overlay
  // Critically: this returns the SAME value during SSR and the initial client
  // render (false / not seen), so React's `useId` ordering is stable and
  // downstream Radix `aria-controls` IDs stay aligned.
  const seen = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);

  const visible = !seen && !dismissed;
  if (!visible) return null;

  const close = () => {
    try {
      localStorage.setItem("1m-intro-seen", "1");
    } catch {
      // localStorage may be unavailable (private mode, etc.) — that's fine.
    }
    setDismissed(true);
    onClose();
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="max-w-xl rounded-xl border border-white/10 bg-zinc-950/95 p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
            Observer's Manual
          </span>
        </div>
        <h2 className="mb-3 font-mono text-2xl text-white">
          1億の観測者
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-white/70">
          このサイトは、最大 <span className="text-cyan-300">1 億体</span> の
          0 次元エージェントが生成する世界を観測するための装置です。
          各エージェントは点として存在し、共通の curl-noise 流れ場に沿って運動します。
          種ごとに流れへの感受性が異なるため、自発的に <span className="text-amber-300">群れ・レーン・分離</span> が創発します。
        </p>
        <p className="mb-4 text-xs leading-relaxed text-white/50">
          観測者として、あなたは <kbd className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white/80">ドラッグ</kbd> で平行移動、
          <kbd className="ml-1 rounded bg-white/10 px-1 py-0.5 text-[10px] text-white/80">ホイール</kbd> でズーム、
          右下の <span className="text-white/80">Control</span> パネルでパラメータを実時間調整できます。
          統計は左上。観測を始めてください。
        </p>
        <div className="flex justify-end gap-2">
          <Button
            onClick={close}
            size="sm"
            className="bg-cyan-500 text-black hover:bg-cyan-400"
          >
            観測を始める
          </Button>
        </div>
      </div>
    </div>
  );
}
