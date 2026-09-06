// SceneDivider.tsx — an in-book scene break: ✧ ─── ❦ ─── ✧
"use client";

export function SceneDivider() {
  return (
    <div className="scene-edge flex items-center justify-center gap-3 py-2 select-none" aria-hidden>
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-gold-600/70" />
      <span className="text-sm">✧</span>
      <span className="font-display text-xs text-gold-500">❦</span>
      <span className="text-sm">✧</span>
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-gold-600/70" />
    </div>
  );
}