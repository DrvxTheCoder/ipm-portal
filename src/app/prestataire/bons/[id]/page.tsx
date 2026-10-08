"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Loading03Icon } from "@hugeicons/core-free-icons"
import { PrestataireHeader } from "@/components/prestataire/shell"
import { PrescriptionImage } from "@/components/portal/prescription-image"
import { Badge } from "@/components/ui/badge"
import { usePrestataire } from "@/lib/prestataire/session"
import { isMonthKey } from "@/domain/prestataire/pharmacy"
import { ApiError, NETWORK_MESSAGE } from "@/lib/api"
import { dateTime, francs, longDate } from "@/lib/format"
import type { ProviderVoucherDetail } from "@/lib/schema"

/**
 * One validated bon, as the API has it now. Read only: a correction is the
 * IPM's to make, and when it does, this screen shows the corrected amount.
 */
export default function PrestataireVoucherPage() {
  return (
    <Suspense>
      <Detail />
    </Suspense>
  )
}

type Load = { kind: "loading" } | { kind: "ready"; voucher: ProviderVoucherDetail } | { kind: "error"; message: string }

function Detail() {
  const { id } = useParams<{ id: string }>()
  const month = useSearchParams().get("mois")
  const { request } = usePrestataire()
  const [load, setLoad] = useState<Load>({ kind: "loading" })
  const [renewing, setRenewing] = useState(false)

  const fetchVoucher = useCallback(async () => {
    try {
      const voucher = await request<ProviderVoucherDetail>(`/vouchers/${encodeURIComponent(id)}`)
      setLoad({ kind: "ready", voucher })
    } catch (failure) {
      setLoad({
        kind: "error",
        message:
          failure instanceof ApiError && failure.status === 404
            ? "Ce bon est introuvable, ou il n'est pas adressé à votre pharmacie."
            : failure instanceof ApiError && !failure.isNetwork
              ? failure.message
              : NETWORK_MESSAGE,
      })
    }
  }, [request, id])

  useEffect(() => {
    void fetchVoucher()
  }, [fetchVoucher])

  // A fresh signed link for the ordonnance: the bon read again.
  async function renew() {
    setRenewing(true)
    await fetchVoucher()
    setRenewing(false)
  }

  const back = isMonthKey(month) ? `/prestataire?mois=${month}` : "/prestataire"

  if (load.kind !== "ready") {
    return (
      <div>
        <PrestataireHeader title="Bon" back={back} />
        {load.kind === "loading" ? (
          <p role="status" className="flex items-center justify-center gap-2 py-10 text-ink-3">
            <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" /> Chargement…
          </p>
        ) : (
          <div role="alert" className="mx-4 rounded-2xl bg-red-tint p-4 text-red">
            <p className="flex items-center gap-2 font-semibold">
              <HugeiconsIcon icon={Alert02Icon} className="size-5" /> Bon indisponible
            </p>
            <p className="mt-1 text-[0.95rem]">{load.message}</p>
            <button type="button" onClick={() => void renew()} className="mt-3 font-semibold underline underline-offset-2">
              Réessayer
            </button>
          </div>
        )}
      </div>
    )
  }

  const v = load.voucher
  return (
    <div>
      <PrestataireHeader title={v.reference} back={back} />
      <div className="space-y-4 px-4">
        <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <p className="font-semibold capitalize">{v.beneficiaryName.toLowerCase()}</p>
          <div className="mt-4 flex items-baseline justify-between gap-3">
            <span className="text-ink-2">Montant validé</span>
            <span className="figure text-[2.2rem] leading-none font-bold">{v.amount === null ? "—" : francs(v.amount)}</span>
          </div>
          {v.adjustedByIpm && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <Badge tone="amber">Ajusté par l&apos;IPM</Badge>
              Le montant a été saisi ou corrigé par l&apos;IPM.
            </p>
          )}
          <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-[0.95rem]">
            <Row label="Part IPM (à facturer)" value={francs(v.ipmShare)} strong />
            <Row label="Part payée par le patient" value={francs(v.participantShare)} />
            <Row label="Validé le" value={v.validatedAt ? dateTime(v.validatedAt) : "—"} />
            <Row label="Émis le" value={longDate(v.issuedAt)} />
          </dl>
        </section>

        <section className="rounded-3xl bg-surface p-4 ring-1 ring-line">
          <p className="mb-3 text-sm font-semibold text-ink-2">Ordonnance</p>
          <PrescriptionImage src={v.prescriptionUrl} onRenew={() => void renew()} renewing={renewing} className="max-h-[60dvh] min-h-48 w-full rounded-2xl" />
        </section>

        <p className="rounded-2xl bg-sunken p-4 text-center text-[0.95rem] text-ink-2">
          Un bon validé ne peut plus être modifié ici. Contactez l&apos;IPM pour toute correction.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-3">{label}</dt>
      <dd className={strong ? "figure text-xl font-semibold text-teal-deep" : "font-medium"}>{value}</dd>
    </div>
  )
}
