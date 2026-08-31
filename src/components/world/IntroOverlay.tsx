"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Sparkles } from "lucide-react";

export function IntroOverlay({ onClose }: { onClose: () => void }) {
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return true;
    return !localStorage.getItem("1m-intro-seen");
  });

  useEffect(() => {
    // No-op: state initialized from localStorage in useState initializer above.
    // This effect exists so future side-effects (e.g. analytics) can attach here.
  }, []);

  if (!show) return null;

  const close = () => {
    localStorage.setItem("1m-intro-seen", "1");
    setShow(false);
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

export function IntroCloseButton() {
  return <X className="h-3 w-3" />;
}
