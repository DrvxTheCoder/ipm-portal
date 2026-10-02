"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Alert02Icon, Cancel01Icon, Loading03Icon, Share08Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { PageHeader } from "@/components/portal/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Qr, verifyUrl } from "@/components/portal/qr"
import { SplitBar } from "@/components/portal/split-bar"
import { ReceiptImage } from "@/components/portal/receipt-image"
import { STATUS_META, VOUCHER_TYPE_META } from "@/components/portal/meta"
import { useStore } from "@/lib/store"
import { francs, grouped, longDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { shareVoucherImage } from "@/lib/voucher-image"
import { ApiError, NETWORK_MESSAGE } from "@/lib/api"

const CANCEL_REASONS = ["Je n'en ai plus besoin", "Erreur sur le montant", "Mauvais prestataire", "Autre raison"]

export default function BonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { db, cancel, markRead } = useStore()
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState(CANCEL_REASONS[0])
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  const voucher = db.vouchers.find((v) => v.id === id)

  // Seen: its notifications (validé / refusé) are read. Runs again when a new
  // one arrives while the page is open.
  useEffect(() => {
    if (voucher) markRead(voucher.id)
  }, [voucher, markRead])
  if (!voucher) {
    return (
      <div>
        <PageHeader title="Bon introuvable" back="/bons" />
        <p className="px-5 text-ink-2">Ce bon n&apos;existe pas ou a été retiré.</p>
      </div>
    )
  }

  // The snapshot lists accredited providers only; an older bon may name another.
  const provider = db.providers.find((p) => p.id === voucher.providerId)
  const providerLabel = provider?.name ?? "Prestataire"
  const lines = db.voucherLines.filter((l) => l.voucherId === voucher.id)
  const status = STATUS_META[voucher.status]
  const type = VOUCHER_TYPE_META[voucher.type]
  const usable = voucher.status === "ISSUED"
  const cancellable = voucher.status === "ISSUED" || voucher.status === "PENDING_REVIEW"

  async function confirmCancel() {
    if (!voucher || cancelling) return
    setCancelling(true)
    setCancelError(null)
    try {
      await cancel(voucher.id, reason)
      setCancelOpen(false)
      toast.success("Bon annulé")
    } catch (error) {
      setCancelError(error instanceof ApiError ? error.message : NETWORK_MESSAGE)
    } finally {
      setCancelling(false)
    }
  }

  async function share() {
    if (!voucher) return
    setSharing(true)
    try {
      const outcome = await shareVoucherImage({
        typeLabel: type.label,
        number: voucher.number,
        beneficiaryName: voucher.beneficiaryName,
        qrValue: verifyUrl(voucher.qrToken),
        insurerShare: voucher.insurerShare,
        memberShare: voucher.memberShare,
        appliedRate: voucher.appliedRate,
        totalAmount: voucher.totalAmount,
        providerName: providerLabel,
        providerAddress: provider?.address ?? null,
        expiryDate: voucher.expiryDate,
      })
      if (outcome === "downloaded") toast.success("Image du bon enregistrée")
    } catch {
      toast.error("L'image du bon n'a pas pu être créée.")
    } finally {
      setSharing(false)
    }
  }

  return (
    <div>
      <PageHeader title={type.short} back="/bons" />

      <div className="px-4">
        <section className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
          <div className="flex items-start justify-between gap-3 p-5">
            <div>
              <p className="text-sm text-ink-3">{type.label}</p>
              <p className="figure text-[1.9rem] leading-tight font-bold tracking-wide">{voucher.number}</p>
              <p className="mt-0.5 font-medium capitalize">{voucher.beneficiaryName.toLowerCase()}</p>
            </div>
            <div className="mt-1 flex items-center gap-2">
              {usable && (
                <button
                  type="button"
                  onClick={share}
                  disabled={sharing}
                  aria-label="Partager le bon en image"
                  className="grid size-9 place-items-center rounded-full text-teal transition-colors hover:bg-mint-wash disabled:opacity-60"
                >
                  <HugeiconsIcon icon={sharing ? Loading03Icon : Share08Icon} className={cn("size-5", sharing && "animate-spin")} />
                </button>
              )}
              <Badge tone={status.tone}>
                <HugeiconsIcon icon={status.icon} />
                {status.label}
              </Badge>
            </div>
          </div>

          <div className="relative border-y border-dashed border-line bg-paper/60 px-5 py-6">
            <div className={cn("mx-auto size-52", !usable && "opacity-20 blur-[3px]")}>
              <Qr value={verifyUrl(voucher.qrToken)} className="size-full" />
            </div>
            {!usable && (
              <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-xl bg-surface/95 p-3 text-center text-[0.95rem] text-ink-2 shadow">
                {status.explain}
              </p>
            )}
          </div>

          <div className="p-5">
            <SplitBar insurer={voucher.insurerShare} member={voucher.memberShare} rate={voucher.appliedRate} />
          </div>
        </section>

        {voucher.status === "REJECTED" && (
          <section role="note" className="mt-4 rounded-3xl bg-red-tint p-5 text-red">
            <p className="flex items-center gap-2 font-semibold">
              <HugeiconsIcon icon={Alert02Icon} className="size-5" />
              Motif du refus
            </p>
            <p className="mt-1.5 text-[0.95rem]">{voucher.reviewReason ?? "L'IPM n'a pas donné de motif. Appelez-la pour en savoir plus."}</p>
            <Link
              href={voucher.dependentId ? `/bons/nouveau?pour=${encodeURIComponent(voucher.dependentId)}` : "/bons/nouveau"}
              className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-teal font-semibold text-white"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-5" /> Créer un nouveau bon
            </Link>
          </section>
        )}

        <section className="mt-4 rounded-3xl bg-surface p-5 ring-1 ring-line">
          <dl className="space-y-3 text-[0.95rem]">
            <Row label="Prestataire" value={providerLabel} />
            <Row label="Adresse" value={provider?.address ?? "—"} />
            <Row label="Créé le" value={longDate(voucher.issueDate)} />
            <Row label="Valable jusqu'au" value={longDate(voucher.expiryDate)} />
            <Row label="Créé depuis" value={voucher.origin === "PORTAL" ? "Mon espace" : "Guichet IPM"} />
          </dl>

          {lines.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-sm font-semibold text-ink-2">Articles</p>
              <ul className="space-y-2">
                {lines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-3">
                    <span className="min-w-0 text-ink">
                      {line.quantity > 1 && <span className="text-ink-3">{line.quantity} × </span>}
                      {line.label}
                    </span>
                    <span className="figure shrink-0 text-lg">{grouped(line.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="font-semibold">Total</span>
            <span className="figure text-2xl font-bold">{francs(voucher.totalAmount)}</span>
          </div>

          {voucher.receiptUrl && (
            <button type="button" onClick={() => setReceiptOpen(true)} className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-sunken p-3 text-left">
              <ReceiptImage src={voucher.receiptUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover ring-1 ring-line" />
              <span className="font-medium text-teal">Voir la photo du reçu</span>
            </button>
          )}
        </section>

        {cancellable && (
          <Button variant="ghost" onClick={() => setCancelOpen(true)} className="mt-4 h-12 w-full rounded-2xl text-red hover:bg-red-tint hover:text-red">
            <HugeiconsIcon icon={Cancel01Icon} className="size-5" /> Annuler ce bon
          </Button>
        )}
      </div>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reçu joint</DialogTitle>
          </DialogHeader>
          <ReceiptImage src={voucher.receiptUrl} alt="Reçu" className="max-h-[70dvh] min-h-40 w-full rounded-xl object-contain" />
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => {
          if (cancelling) return
          setCancelOpen(open)
          setCancelError(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Annuler le bon {voucher.number} ?</DialogTitle>
            <DialogDescription>Le code QR ne fonctionnera plus, et le montant sera rendu à votre plafond du mois.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {CANCEL_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={cancelling}
                onClick={() => setReason(r)}
                className={cn("rounded-xl p-3 text-left ring-1", reason === r ? "bg-mint-wash ring-teal" : "ring-line")}
              >
                {r}
              </button>
            ))}
          </div>
          {cancelError && (
            <p role="alert" className="rounded-xl bg-red-tint p-3 text-[0.95rem] text-red">{cancelError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={cancelling} onClick={() => setCancelOpen(false)} className="h-11">Garder le bon</Button>
            <Button variant="destructive" className="h-11" disabled={cancelling} aria-busy={cancelling} onClick={() => void confirmCancel()}>
              {cancelling && <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />}
              {cancelling ? "Annulation…" : "Annuler le bon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-3">{label}</dt>
      <dd className="max-w-[60%] truncate text-right font-medium" title={value}>
        {value.length > 30 ? `${value.slice(0, 27)}...` : value}
      </dd>
    </div>
  )
}
