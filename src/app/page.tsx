"use client";

import dynamic from "next/dynamic";

// AgentWorld uses WebGL2, WebGL2 contexts, `window`/`canvas` APIs, and Radix
// Select triggers that generate IDs via `useId`. Rendering any of these on
// the server leads to hydration mismatches (Radix `aria-controls` IDs differ
// between server and client; the canvas's intrinsic client-only APIs aren't
// available on the server).
//
// The world-class solution: opt the whole interactive tree out of SSR via
// `next/dynamic` with `ssr: false`. Next.js will emit only the loading
// placeholder during SSR, and the full AgentWorld will mount on the client
// after hydration — no mismatch possible.
//
// In Next.js 16, `ssr: false` is only allowed in Client Components, so this
// page.tsx is marked `'use client'`. The dynamic import is still resolved by
// the bundler — no server roundtrip happens for the AgentWorld chunk.
const AgentWorld = dynamic(
  () => import("@/components/world/AgentWorld").then((m) => m.AgentWorld),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-cyan-400" />
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
            Spinning up phase space…
          </p>
        </div>
      </div>
    ),
  }
);

export default function Home() {
  return <AgentWorld />;
}
