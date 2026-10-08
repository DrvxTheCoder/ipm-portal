"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Clock01Icon, InformationCircleIcon, Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { PrestataireHeader } from "@/components/prestataire/shell"
import { QrScanner } from "@/components/prestataire/qr-scanner"
import { PrescriptionImage } from "@/components/portal/prescription-image"
import { AmountPad } from "@/components/portal/amount-pad"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { usePrestataire } from "@/lib/prestataire/session"
import {
  attemptFor,
  counterMessage,
  lookupBlocker,
  newIdempotencyKey,
  type Attempt,
  type CounterMessage,
} from "@/domain/prestataire/pharmacy"
import { ApiError, NETWORK_MESSAGE } from "@/lib/api"
import { francs, grouped, longDate } from "@/lib/format"
import type {
  ProviderAmountFlag,
  ProviderAmountPreviewResponse,
  ProviderValidateResponse,
  ProviderVoucherLookup,
} from "@/lib/schema"
import { cn } from "@/lib/utils"

type Step =
  | { kind: "scan" }
  | { kind: "blocked"; message: CounterMessage }
  | { kind: "amount"; bon: ProviderVoucherLookup }
  | { kind: "split"; bon: ProviderVoucherLookup; preview: ProviderAmountPreviewResponse }
  | { kind: "done"; bon: ProviderVoucherLookup; result: ProviderValidateResponse }

/** Refusals that end this bon's flow; anything else may be retried. */
const FINAL = new Set(["ALREADY_VALIDATED", "EXPIRED", "WRONG_PROVIDER", "CANCELLED", "NOT_FOUND", "NOT_DEFERRED"])

/**
 * Scanner → montant → valider. As few taps as the counter allows: the scan
 * lands on the amount pad (the bon and its ordonnance in a strip above it),
 * and the next screen is the confirmation itself — the split, any warning,
 * and one "Valider" button. The validation is final for the pharmacy, so that
 * screen asks the question in so many words; and it is sent with one
 * idempotency key per attempt (bon + amount), reused on a retry, so a dropped
 * connection never validates twice.
 */
export default function PrestataireScannerPage() {
  const { request } = usePrestataire()
  const [step, setStep] = useState<Step>({ kind: "scan" })
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  // Whether the last validate may have reached the server: the retry reuses its key.
  const [uncertain, setUncertain] = useState<string | null>(null)
  const attempt = useRef<Attempt | null>(null)
  const inflight = useRef(false)

  function restart() {
    setStep({ kind: "scan" })
    setToken(null)
    setAmount(0)
    setNotice(null)
    setUncertain(null)
    attempt.current = null
  }

  function refuse(failure: unknown, fallbackStep: Step) {
    if (failure instanceof ApiError && !failure.isNetwork && FINAL.has(failure.code)) {
      setStep({ kind: "blocked", message: counterMessage(failure.code, failure.message) })
      return
    }
    if (failure instanceof ApiError && failure.code === "INVALID_AMOUNT") {
      setNotice(counterMessage("INVALID_AMOUNT", failure.message).detail)
      if (fallbackStep.kind !== "scan" && fallbackStep.kind !== "blocked" && fallbackStep.kind !== "done") {
        setStep({ kind: "amount", bon: fallbackStep.bon })
      }
      return
    }
    setNotice(failure instanceof ApiError && !failure.isNetwork ? failure.message : NETWORK_MESSAGE)
  }

  async function lookup(code: string, keep?: Step) {
    if (inflight.current) return
    inflight.current = true
    setBusy(true)
    setNotice(null)
    try {
      const bon = await request<ProviderVoucherLookup>(`/voucher/lookup?token=${encodeURIComponent(code)}`)
      setToken(code)
      const blocker = lookupBlocker(bon.status)
      if (blocker) setStep({ kind: "blocked", message: blocker })
      // Renewing the ordonnance link keeps the step the pharmacist is on.
      else if (keep && keep.kind !== "scan" && keep.kind !== "blocked") setStep({ ...keep, bon } as Step)
      else {
        setAmount(0)
        setStep({ kind: "amount", bon })
      }
    } catch (failure) {
      refuse(failure, { kind: "scan" })
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  async function previewSplit(bon: ProviderVoucherLookup) {
    if (inflight.current || amount <= 0) return
    inflight.current = true
    setBusy(true)
    setNotice(null)
    try {
      const preview = await request<ProviderAmountPreviewResponse>("/voucher/validate/preview", {
        method: "POST",
        json: { voucherId: bon.voucherId, amount },
      })
      setStep({ kind: "split", bon, preview })
    } catch (failure) {
      refuse(failure, { kind: "amount", bon })
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  async function validate(bon: ProviderVoucherLookup, preview: ProviderAmountPreviewResponse) {
    if (inflight.current) return
    inflight.current = true
    setBusy(true)
    setNotice(null)
    attempt.current = attemptFor(attempt.current, bon.voucherId, preview.amount, newIdempotencyKey)
    const { key } = attempt.current
    try {
      const result = await request<ProviderValidateResponse>("/voucher/validate", {
        method: "POST",
        json: { voucherId: bon.voucherId, amount: preview.amount, idempotencyKey: key },
      })
      attempt.current = null
      setUncertain(null)
      setStep({ kind: "done", bon, result })
    } catch (failure) {
      const network = !(failure instanceof ApiError) || failure.isNetwork || failure.status >= 500
      if (network) {
        // It may have gone through: the same key on the retry gets the same answer.
        setUncertain(key)
        setNotice(
          "La connexion a été interrompue avant la réponse. Le bon a peut-être été validé : appuyez sur « Réessayer », il ne sera jamais validé deux fois."
        )
      } else {
        attempt.current = null
        setUncertain(null)
        refuse(failure, { kind: "split", bon, preview })
      }
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  const bon = step.kind === "amount" || step.kind === "split" || step.kind === "done" ? step.bon : null

  return (
    <div className="flex min-h-dvh flex-col">
      <PrestataireHeader
        title={step.kind === "done" ? "Bon validé" : step.kind === "amount" ? "Montant" : step.kind === "split" ? "Validation" : "Scanner un bon"}
        back="/prestataire"
      />

      <div className="flex flex-1 flex-col px-4">
        {step.kind === "scan" && (
          <>
            <QrScanner onCode={(code) => void lookup(code)} busy={busy} />
            {notice && <Notice tone="red">{notice}</Notice>}
          </>
        )}

        {step.kind === "blocked" && (
          <div className="flex flex-1 flex-col">
            <div role="alert" className="rounded-3xl bg-red-tint p-5 text-red">
              <p className="flex items-center gap-2 text-lg font-semibold">
                <HugeiconsIcon icon={Alert02Icon} className="size-6" /> {step.message.title}
              </p>
              <p className="mt-2 text-[0.95rem]">{step.message.detail}</p>
            </div>
            <div className="mt-auto grid gap-2.5 pt-6">
              <Button onClick={restart} className="h-14 rounded-2xl text-lg font-semibold">Scanner un autre bon</Button>
              <Link href="/prestataire" className="flex h-12 items-center justify-center rounded-2xl font-semibold text-teal">Retour à l&apos;accueil</Link>
            </div>
          </div>
        )}

        {bon && step.kind !== "done" && (
          <BonSummary bon={bon} renewing={busy} onRenew={() => token && void lookup(token, step)} />
        )}

        {step.kind === "amount" && (
          <div className="mt-3 flex flex-1 flex-col">
            <div className="rounded-3xl bg-surface p-4 text-center ring-1 ring-line">
              <p className="text-sm text-ink-2">Montant global de l&apos;ordonnance</p>
              <p className="mt-1 flex items-baseline justify-center gap-1.5">
                <span className={cn("figure text-[3.4rem] leading-none font-bold", amount ? "text-ink" : "text-ink-3/50")}>{grouped(amount)}</span>
                <span className="figure text-2xl text-ink-2">F</span>
              </p>
            </div>
            <div className="mt-3">
              <AmountPad value={amount} onChange={(v) => { setAmount(v); setNotice(null) }} />
            </div>
            {notice && <Notice tone="red">{notice}</Notice>}
            <Button
              onClick={() => void previewSplit(step.bon)}
              disabled={amount <= 0 || busy}
              aria-busy={busy}
              className="mt-auto h-14 shrink-0 rounded-2xl text-lg font-semibold"
            >
              {busy && <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" />}
              Continuer
            </Button>
          </div>
        )}

        {step.kind === "split" && (
          <div className="mt-4 flex flex-1 flex-col">
            <h2 className="figure text-[1.9rem] leading-tight font-bold">
              Valider le montant de {francs(step.preview.amount)} ?
            </h2>
            <p className="mt-1 text-sm text-ink-2">La validation est définitive : seule l&apos;IPM pourra la corriger.</p>
            <div className="mt-3">
              <Split amount={step.preview.amount} ipm={step.preview.ipmShare} patient={step.preview.participantShare} rate={step.preview.rate} />
            </div>
            <Flags flags={step.preview.flags} remaining={step.preview.remainingCeiling} patient={step.preview.participantShare} />
            {notice && <Notice tone={uncertain ? "amber" : "red"}>{notice}</Notice>}
            <div className="mt-auto grid gap-2 pt-5">
              <Button
                onClick={() => void validate(step.bon, step.preview)}
                disabled={busy}
                aria-busy={busy}
                className="h-16 rounded-2xl text-xl font-semibold"
              >
                {busy && <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" />}
                {busy ? "Validation…" : uncertain ? "Réessayer" : "Valider"}
              </Button>
              {!uncertain && (
                <Button variant="ghost" disabled={busy} onClick={() => setStep({ kind: "amount", bon: step.bon })} className="h-12 rounded-2xl text-teal">
                  Modifier le montant
                </Button>
              )}
            </div>
          </div>
        )}

        {step.kind === "done" && (
          <div className="flex flex-1 flex-col">
            <div className="flex flex-col items-center pt-4 text-center">
              <span className="inline-flex size-20 items-center justify-center rounded-full bg-mint text-teal-deep">
                <HugeiconsIcon icon={Tick02Icon} className="size-10" strokeWidth={2.2} />
              </span>
              <p className="mt-3 font-semibold capitalize">{step.bon.beneficiaryName.toLowerCase()}</p>
              <p className="text-sm text-ink-3">Bon {step.result.number}</p>
            </div>
            <div className="mt-5">
              <Split amount={step.result.amount} ipm={step.result.ipmShare} patient={step.result.participantShare} rate={null} />
              <Flags flags={step.result.flags} remaining={null} patient={step.result.participantShare} />
            </div>
            <div className="mt-auto grid gap-2.5 pt-6">
              <Button onClick={restart} className="h-14 rounded-2xl text-lg font-semibold">Scanner un autre bon</Button>
              <Link href="/prestataire" className="flex h-12 items-center justify-center rounded-2xl font-semibold text-teal">Retour à l&apos;accueil</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function BonSummary({
  bon,
  renewing,
  onRenew,
}: {
  bon: ProviderVoucherLookup
  renewing: boolean
  onRenew: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Voir l'ordonnance en grand"
        className="relative shrink-0"
      >
        <PrescriptionImage src={bon.prescriptionUrl} className="size-16 rounded-xl ring-1 ring-line" />
        <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-ink/60 py-0.5 text-center text-[0.65rem] font-semibold text-white">
          Ordonnance
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold capitalize">{bon.beneficiaryName.toLowerCase()}</p>
        <p className="truncate text-sm text-ink-3">Bon {bon.number}</p>
        <p className="flex items-center gap-1 text-xs text-ink-3">
          <HugeiconsIcon icon={Clock01Icon} className="size-3.5" />
          Valable jusqu&apos;au {longDate(bon.expiresAt)}
        </p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ordonnance</DialogTitle>
          </DialogHeader>
          <PrescriptionImage src={bon.prescriptionUrl} onRenew={onRenew} renewing={renewing} className="max-h-[70dvh] min-h-40 w-full rounded-xl" />
        </DialogContent>
      </Dialog>
    </section>
  )
}

function Split({ amount, ipm, patient, rate }: { amount: number; ipm: number; patient: number; rate: number | null }) {
  const pct = amount > 0 ? Math.round((ipm / amount) * 100) : 0
  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-2">Montant global</span>
        <span className="figure text-[2.2rem] leading-none font-bold">{francs(amount)}</span>
      </div>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-mint" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex justify-between gap-4">
        <div>
          <p className="text-sm text-ink-2">Part IPM{rate !== null ? ` (taux ${Math.round(rate * 100)} %)` : ""}</p>
          <p className="figure text-2xl font-semibold text-teal-deep">{francs(ipm)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-ink-2">À encaisser auprès du patient</p>
          <p className="figure text-2xl font-semibold">{francs(patient)}</p>
        </div>
      </div>
    </section>
  )
}

function Flags({ flags, remaining, patient }: { flags: ProviderAmountFlag[]; remaining: number | null; patient: number }) {
  if (flags.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      {flags.includes("CEILING_CAPPED") && (
        <Notice tone="amber">
          Plafond du patient insuffisant{remaining !== null ? ` (il restait ${francs(remaining)})` : ""} : l&apos;IPM prend en charge ce qui reste, le patient paie la différence, soit {francs(patient)} au total.
        </Notice>
      )}
      {flags.includes("AMOUNT_ABOVE_THRESHOLD") && (
        <Notice tone="neutral">Montant élevé : le bon est validé, l&apos;IPM pourra le contrôler.</Notice>
      )}
    </div>
  )
}

function Notice({ tone, children }: { tone: "red" | "amber" | "neutral"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "neutral" ? "note" : "alert"}
      className={cn(
        "mt-3 flex gap-2 rounded-2xl p-3.5 text-[0.95rem]",
        tone === "red" && "bg-red-tint text-red",
        tone === "amber" && "bg-amber-tint text-amber",
        tone === "neutral" && "bg-sunken text-ink-2"
      )}
    >
      <HugeiconsIcon icon={tone === "neutral" ? InformationCircleIcon : Alert02Icon} className="mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
