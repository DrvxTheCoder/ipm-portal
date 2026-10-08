"use client"

import Link from "next/link"
import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, ArrowLeft01Icon, ArrowRight01Icon, FileScanIcon, Loading03Icon } from "@hugeicons/core-free-icons"
import { PrestataireHeader } from "@/components/prestataire/shell"
import { Badge } from "@/components/ui/badge"
import { usePrestataire } from "@/lib/prestataire/session"
import { canGoForward, isMonthKey, kpiView, monthOf, monthTitle, shiftMonth } from "@/domain/prestataire/pharmacy"
import { ApiError, NETWORK_MESSAGE } from "@/lib/api"
import { dateTime, francs } from "@/lib/format"
import type { ProviderVoucherListResponse } from "@/lib/schema"
import { cn } from "@/lib/utils"

/**
 * The pharmacy's whole interface: scan a bon, what was consumed this month,
 * and the bons it validated. Read from the API on every visit, focus and
 * month change — an amount the IPM corrected shows here as corrected.
 */
export default function PrestataireHomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  )
}

type Load = { kind: "loading" } | { kind: "ready"; data: ProviderVoucherListResponse } | { kind: "error"; message: string }

function Home() {
  const { request } = usePrestataire()
  const router = useRouter()
  const param = useSearchParams().get("mois")
  const month = isMonthKey(param) && param <= monthOf(new Date()) ? param : monthOf(new Date())
  const [load, setLoad] = useState<Load>({ kind: "loading" })

  const fetchMonth = useCallback(
    async (key: string, signal: { alive: boolean }) => {
      try {
        const data = await request<ProviderVoucherListResponse>(`/vouchers?month=${encodeURIComponent(key)}`)
        if (signal.alive) setLoad({ kind: "ready", data })
      } catch (failure) {
        if (!signal.alive) return
        setLoad({ kind: "error", message: failure instanceof ApiError && !failure.isNetwork ? failure.message : NETWORK_MESSAGE })
      }
    },
    [request]
  )

  useEffect(() => {
    const signal = { alive: true }
    setLoad({ kind: "loading" })
    void fetchMonth(month, signal)
    const onVisible = () => document.visibilityState === "visible" && void fetchMonth(month, signal)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      signal.alive = false
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [month, fetchMonth])

  function goTo(key: string) {
    router.replace(key === monthOf(new Date()) ? "/prestataire" : `/prestataire?mois=${key}`, { scroll: false })
  }

  const data = load.kind === "ready" && load.data.kpi.month === month ? load.data : null
  const kpi = data ? kpiView(data.kpi) : null

  return (
    <div>
      <PrestataireHeader />

      <div className="px-4">

        <section aria-labelledby="kpi-title" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goTo(shiftMonth(month, -1))}
              aria-label="Mois précédent"
              className="inline-flex size-10 items-center justify-center rounded-full bg-sunken text-ink-2"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
            </button>
            <p className="text-center font-semibold capitalize">{monthTitle(month)}</p>
            <button
              type="button"
              onClick={() => goTo(shiftMonth(month, 1))}
              disabled={!canGoForward(month)}
              aria-label="Mois suivant"
              className="inline-flex size-10 items-center justify-center rounded-full bg-sunken text-ink-2 disabled:opacity-30"
            >
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" />
            </button>
          </div>
          <p id="kpi-title" className="mt-4 text-[0.95rem] text-ink-2">
            {kpi?.title ?? kpiView({ month, totalAmount: 0, count: 0 }).title}
          </p>
          <p className={cn("figure mt-0.5 text-[3rem] leading-none font-bold text-teal-deep", !kpi && "text-ink-3/40")} aria-busy={!kpi}>
            {kpi ? kpi.total : "—"}
          </p>
          <p className="mt-2 text-sm text-ink-3">{kpi ? kpi.count : load.kind === "loading" ? "Chargement…" : " "}</p>
        </section>
        <Link
          href="/prestataire/scanner"
          className="mt-5 flex h-24 items-center justify-center gap-3 rounded-3xl bg-teal text-xl font-semibold text-white shadow-[0_14px_30px_-14px_rgba(26,101,116,.9)] transition-transform active:translate-y-px"
        >
          <HugeiconsIcon icon={FileScanIcon} className="size-9" strokeWidth={1.8} />
          Scanner un bon
        </Link>

        <h2 className="figure mt-7 mb-3 text-2xl font-bold">Bons validés</h2>

        {load.kind === "loading" && (
          <p role="status" className="flex items-center justify-center gap-2 py-8 text-ink-3">
            <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" /> Chargement des bons…
          </p>
        )}

        {load.kind === "error" && (
          <div role="alert" className="rounded-2xl bg-red-tint p-4 text-red">
            <p className="flex items-center gap-2 font-semibold">
              <HugeiconsIcon icon={Alert02Icon} className="size-5" /> Liste indisponible
            </p>
            <p className="mt-1 text-[0.95rem]">{load.message}</p>
            <button
              type="button"
              onClick={() => {
                setLoad({ kind: "loading" })
                void fetchMonth(month, { alive: true })
              }}
              className="mt-3 font-semibold underline underline-offset-2"
            >
              Réessayer
            </button>
          </div>
        )}

        {data && data.items.length === 0 && (
          <p className="rounded-2xl bg-surface p-6 text-center text-ink-2 ring-1 ring-line">Aucun bon validé en {monthTitle(month)}.</p>
        )}

        {data && data.items.length > 0 && (
          <ul className="space-y-2.5">
            {data.items.map((item) => (
              <li key={item.voucherId}>
                <Link
                  href={`/prestataire/bons/${encodeURIComponent(item.voucherId)}${month === monthOf(new Date()) ? "" : `?mois=${month}`}`}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 ring-1 ring-line transition-colors active:bg-sunken"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold capitalize">{item.beneficiaryName.toLowerCase()}</span>
                    <span className="block truncate text-sm text-ink-2">{item.reference}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                      {dateTime(item.validatedAt)}
                      {item.adjustedByIpm && <Badge tone="amber">Ajusté par l&apos;IPM</Badge>}
                    </span>
                  </span>
                  <span className="figure shrink-0 text-xl font-semibold">{francs(item.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

