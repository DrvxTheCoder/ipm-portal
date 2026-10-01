"use client"

import { cn } from "@/lib/utils"

/**
 * Large number pad. Many participants are at ease with figures and not with
 * text; a pad the size of a thumb, with no keyboard switching, is the
 * difference between "I can do this" and "I'll call Rokhaya".
 */
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "del"] as const

export function AmountPad({ value, onChange, max = 99_999_999 }: { value: number; onChange: (v: number) => void; max?: number }) {
  function press(key: (typeof KEYS)[number]) {
    if (key === "del") return onChange(Math.floor(value / 10))
    const next = Number(`${value || ""}${key}`)
    if (Number.isFinite(next) && next <= max) onChange(next)
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          aria-label={key === "del" ? "Effacer" : key}
          className={cn(
            "figure flex h-16 items-center justify-center rounded-2xl bg-surface text-[1.9rem] font-semibold text-ink ring-1 ring-line transition-colors active:bg-mint-wash",
            key === "000" && "text-2xl text-ink-2",
            key === "del" && "text-ink-2"
          )}
        >
          {key === "del" ? (
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7z" />
              <path d="M13 10l4 4M17 10l-4 4" />
            </svg>
          ) : (
            key
          )}
        </button>
      ))}
    </div>
  )
}
