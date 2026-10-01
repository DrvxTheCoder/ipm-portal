"use client"

import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { francs, grouped } from "@/lib/format"

gsap.registerPlugin(useGSAP)

/**
 * "Il vous reste X F" — the monthly ceiling made concrete. The figure is the
 * IPM's remaining share (ceilings cap the insurer share, not the bill), and
 * says so. The balance is the household's, shared by every dependent. When the
 * category changes, the number runs to its new value and the bar follows: the
 * one animated moment on the home screen.
 */
export function Envelope({
  remaining,
  ceiling,
  label,
  personKey,
  period = "mois",
}: {
  remaining: number
  ceiling: number
  label: string
  personKey: string
  /** What the ceiling is counted over: monthly for most care, yearly for glasses. */
  period?: "mois" | "an"
}) {
  const scope = useRef<HTMLDivElement>(null)
  const figure = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const shown = useRef({ value: 0 })
  const used = ceiling > 0 ? Math.min(1, (ceiling - remaining) / ceiling) : 0

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      gsap.to(shown.current, {
        value: remaining,
        duration: reduce ? 0 : 1.1,
        ease: "power3.out",
        onUpdate: () => {
          if (figure.current) figure.current.textContent = grouped(shown.current.value)
        },
      })
      gsap.fromTo(
        bar.current,
        { scaleX: 0 },
        { scaleX: 1 - used, duration: reduce ? 0 : 1.1, ease: "power3.out", transformOrigin: "left center" }
      )
    },
    { scope, dependencies: [personKey, remaining, ceiling] }
  )

  const low = remaining < ceiling * 0.2

  return (
    <div ref={scope}>
      <p className="text-[0.95rem] text-ink-2">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span ref={figure} className={`figure text-[3.4rem] leading-none font-bold ${low ? "text-amber" : "text-teal-deep"}`}>
          {grouped(remaining)}
        </span>
        <span className="figure text-2xl font-semibold text-ink-2">F</span>
      </p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-sunken">
        <div ref={bar} className={`h-full rounded-full ${low ? "bg-amber" : "bg-mint"}`} />
      </div>
      <p className="mt-2 text-sm text-ink-3">
        Prise en charge maximale de {francs(ceiling)} par {period}
      </p>
    </div>
  )
}
