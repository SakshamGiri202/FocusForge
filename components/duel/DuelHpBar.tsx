// DuelHpBar.tsx — a hero's 100-scale vitality, diegetically (no numbers above the bar's label).
"use client";

const SEGMENTS = 20;

export function DuelHpBar({
  name,
  roleLabel,
  hp,
  align = "left",
}: {
  name: string;
  roleLabel: string;
  hp: number;
  align?: "left" | "right";
}) {
  const pct = Math.max(0, Math.min(1, hp / 100));
  const filled = Math.round(pct * SEGMENTS);
  const dead = hp <= 0;

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        dead ? "border-blood-500/40 bg-ink-900/50" : "border-ink-600/50 bg-ink-900/70"
      } ${align === "right" ? "text-right" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display truncate text-parchment">{name}</p>
          <p className="hand text-xs italic text-parchment-dim">{roleLabel}</p>
        </div>
        <span className={`hand text-sm ${dead ? "text-blood-300" : "text-moss-300"}`}>
          {dead ? "fallen" : pct > 0.6 ? "swift" : pct > 0.3 ? "wounded" : "at the edge"}
        </span>
      </div>
      <div
        className={`mt-2 grid gap-[3px]`}
        style={{ gridTemplateColumns: `repeat(${SEGMENTS}, minmax(0,1fr))` }}
      >
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const lit = align === "right" ? i >= SEGMENTS - filled : i < filled;
          return (
            <div
              key={i}
              className={`h-2 rounded-sm transition-colors duration-300 ${
                dead ? "bg-blood-500/40" : lit ? "bg-gold-400/90" : "bg-ink-700"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}