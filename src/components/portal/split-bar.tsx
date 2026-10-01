import { francs } from "@/lib/format"

/** "L'IPM paie / Vous payez" — the one figure people actually want from a bon. */
export function SplitBar({ insurer, member, rate }: { insurer: number; member: number; rate: number }) {
  const pct = Math.round(rate * 100)
  return (
    <div className="space-y-2.5">
      <div className="flex h-3 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-mint" style={{ width: `${pct}%` }} />
        <div
          className="h-full flex-1"
          style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 5px, rgba(13,42,48,.16) 5px 7px)" }}
        />
      </div>
      <div className="flex justify-between gap-4">
        <div>
          <p className="text-sm text-ink-2">L&apos;IPM paie {pct} %</p>
          <p className="figure text-2xl font-semibold text-teal-deep">{francs(insurer)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-ink-2">Votre part {100 - pct} %</p>
          <p className="figure text-2xl font-semibold text-ink">{francs(member)}</p>
        </div>
      </div>
    </div>
  )
}
