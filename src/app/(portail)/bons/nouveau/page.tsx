"use client"

import Link from "next/link"
import { Suspense, useMemo, useRef, useState, type CSSProperties } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Alert02Icon,
  Camera01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Delete02Icon,
  FileScanIcon,
  PencilEdit02Icon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperSeparator } from "@/components/reui/stepper"
import { BackLink } from "@/components/portal/app-shell"
import { Avatar } from "@/components/portal/avatar"
import { AmountPad } from "@/components/portal/amount-pad"
import { ReceiptCapture, type CapturedReceipt } from "@/components/portal/receipt-capture"
import { SplitBar } from "@/components/portal/split-bar"
import { OfflineNotice } from "@/components/portal/offline"
import { useOnline } from "@/lib/pwa"
import { Qr, verifyUrl } from "@/components/portal/qr"
import { VOUCHER_TYPE_META } from "@/components/portal/meta"
import { useStore } from "@/lib/store"
import { family, type FamilyMember } from "@/lib/queries"
import { VOUCHER_TYPE_SPECIALTIES } from "@/lib/mock-data"
import { draftTotal, preview, type DraftLine, type VoucherDraft } from "@/domain/portal/issue"
import { francs, grouped, longDate } from "@/lib/format"
import type { IpmProvider, IpmVoucher, IpmVoucherType } from "@/lib/schema"
import { cn } from "@/lib/utils"

gsap.registerPlugin(useGSAP)

type StepKey = "who" | "mode" | "scan" | "type" | "provider" | "amount" | "receipt" | "recap"
type Mode = "SCAN" | "MANUAL"

const PATHS: Record<Mode, StepKey[]> = {
  SCAN: ["who", "mode", "scan", "type", "provider", "amount", "recap"],
  MANUAL: ["who", "mode", "type", "provider", "amount", "receipt", "recap"],
}

const TITLES: Record<StepKey, string> = {
  who: "Pour qui est ce bon ?",
  mode: "Comment remplir le bon ?",
  scan: "Photo du reçu",
  type: "Quel type de soins ?",
  provider: "Chez quel prestataire ?",
  amount: "Quel est le montant ?",
  receipt: "Joignez le reçu",
  recap: "Vérifiez avant de valider",
}

const SPECIALTY_TO_TYPE: Record<string, IpmVoucherType> = {
  spec_pharma: "PHARMACY",
  spec_optique: "OPTICAL",
  spec_clinique: "GUARANTEE",
  spec_labo: "GUARANTEE",
  spec_generaliste: "GUARANTEE",
}

const STOP = new Set(["pharmacie", "pharma", "clinique", "optique", "hopital", "cabinet", "medical", "centre", "institut", "de", "la", "le", "du", "des", "et"])

function tokens(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t))
}

/** Matches the name printed at the top of the ticket against the providers. */
function matchProvider(header: string | null, providers: IpmProvider[]): IpmProvider | null {
  if (!header) return null
  const read = new Set(tokens(header))
  let best: { provider: IpmProvider; score: number } | null = null
  for (const provider of providers) {
    const score = tokens(provider.name).filter((t) => read.has(t)).length
    if (score > 0 && (!best || score > best.score)) best = { provider, score }
  }
  return best?.provider ?? null
}

export default function NewVoucherPage() {
  return (
    <Suspense>
      <NewVoucherFlow />
    </Suspense>
  )
}

function NewVoucherFlow() {
  const router = useRouter()
  const params = useSearchParams()
  const { db, session, issue } = useStore()
  const memberId = session!.memberId
  const people = useMemo(() => family(db, memberId), [db, memberId])

  const preselected = params.get("pour")
  const [mode, setMode] = useState<Mode>("SCAN")
  const [stepIndex, setStepIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [dependentId, setDependentId] = useState<string | null | undefined>(
    preselected ? preselected : undefined
  )
  const [type, setType] = useState<IpmVoucherType | null>(null)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [ocrProviderId, setOcrProviderId] = useState<string | null>(null)
  const [manualTotal, setManualTotal] = useState(0)
  const [lines, setLines] = useState<DraftLine[]>([])
  const [detailOpen, setDetailOpen] = useState(false)
  const [receipt, setReceipt] = useState<CapturedReceipt | null>(null)
  const [issued, setIssued] = useState<IpmVoucher | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const online = useOnline()

  const path = PATHS[mode]
  const step = path[stepIndex]
  const who: FamilyMember | undefined =
    dependentId === undefined ? undefined : people.find((p) => p.dependentId === dependentId)

  function go(delta: number) {
    setDirection(delta)
    setStepIndex((i) => Math.max(0, Math.min(path.length - 1, i + delta)))
  }

  function back() {
    if (stepIndex === 0) router.push("/")
    else go(-1)
  }

  const draft: VoucherDraft | null =
    type && providerId && dependentId !== undefined
      ? {
          type,
          dependentId,
          providerId,
          entryMode: mode,
          lines,
          manualTotal,
          receiptUrl: receipt?.receiptUrl ?? null,
          receiptHash: receipt?.receiptHash ?? null,
          ocrTotal: receipt?.ocr?.total ?? null,
        }
      : null

  function onScanned(captured: CapturedReceipt) {
    setReceipt(captured)
    const ocr = captured.ocr
    if (ocr?.total) setManualTotal(ocr.total)
    if (ocr?.lines.length) {
      setLines(ocr.lines)
      setDetailOpen(true)
    }
    const eligible = db.providers.filter((p) => p.accredited && p.status === "ACTIVE")
    const matched = matchProvider(ocr?.header ?? null, eligible)
    if (matched) {
      setProviderId(matched.id)
      setOcrProviderId(matched.id)
      if (matched.specialtyId) setType(SPECIALTY_TO_TYPE[matched.specialtyId] ?? null)
    }
    if (ocr?.total) {
      toast.success(`Montant lu : ${francs(ocr.total)}`, {
        description: ocr.engine === "claude" ? "Lecture assistée. Vérifiez-le à l'étape du montant." : "Vérifiez-le à l'étape du montant.",
      })
    } else {
      toast.error("Le montant n'a pas été trouvé sur le reçu", {
        description: "Vous le saisirez à l'étape du montant.",
        duration: 10_000,
        closeButton: true,
        // Sonner puts the close button top-left; move it to the top-right corner.
        style: {
          "--toast-close-button-start": "unset",
          "--toast-close-button-end": "0",
          "--toast-close-button-transform": "translate(35%, -35%)",
        } as CSSProperties,
      })
    }
    go(1)
  }

  function submit() {
    if (!draft) return
    // Issuing is the one thing the portal refuses offline: the IPM must see
    // the bon (ceilings, review) before a provider can be shown its QR.
    if (!navigator.onLine) {
      toast.error("Connexion requise pour créer un bon.")
      return
    }
    setSubmitting(true)
    try {
      const voucher = issue(draft)
      setIssued(voucher)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Le bon n'a pas pu être créé.")
    } finally {
      setSubmitting(false)
    }
  }

  if (issued) return <Done voucher={issued} providerName={db.providers.find((p) => p.id === issued.providerId)!.name} />

  return (
    <div className="flex min-h-dvh flex-col px-5 pt-[max(env(safe-area-inset-top),14px)] pb-6">
      {/* Over the flow, not instead of it: a draft survives a dropped connection. */}
      {!online && <OfflineNotice />}
      <div className="flex items-center gap-3">
        <BackLink onClick={back} />
        <Stepper value={stepIndex + 1} className="flex-1">
          <StepperNav>
            {path.map((key, i) => (
              <StepperItem key={key} step={i + 1}>
                <StepperIndicator className="size-2.5 data-[state=inactive]:bg-line" />
                {i < path.length - 1 && <StepperSeparator className="h-0.5 group-data-[state=completed]/step:bg-teal" />}
              </StepperItem>
            ))}
          </StepperNav>
        </Stepper>
        <Link href="/" className="text-sm font-medium text-ink-3">Fermer</Link>
      </div>

      <h1 className="figure mt-6 text-[2.1rem] leading-[1.05] font-bold">{TITLES[step]}</h1>

      <div className="relative mt-5 flex flex-1 flex-col">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-1 flex-col"
          >
            {step === "who" && (
              <div className="grid grid-cols-2 gap-3">
                {people.map((person) => (
                  <button
                    key={person.key}
                    type="button"
                    disabled={!person.covered}
                    onClick={() => {
                      setDependentId(person.dependentId)
                      go(1)
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl bg-surface p-4 text-center ring-1 ring-line transition-colors active:bg-mint-wash disabled:opacity-45",
                      dependentId === person.dependentId && "ring-2 ring-teal"
                    )}
                  >
                    <Avatar person={person.person} rank={person.rank} className="size-16 text-2xl" />
                    <span className="font-semibold">{person.person.firstName}</span>
                    <span className="-mt-1.5 text-sm text-ink-3">
                      {person.dependentId === null ? "Moi" : person.relationLabel}
                      {person.age !== null && person.dependentId !== null ? `, ${person.age} ans` : ""}
                    </span>
                    {!person.covered && <span className="text-xs text-red">{person.coverageMessage}</span>}
                  </button>
                ))}
              </div>
            )}

            {step === "mode" && (
              <div className="grid gap-3">
                {(
                  [
                    { key: "SCAN", icon: FileScanIcon, title: "Scanner le reçu", text: "Prenez le reçu en photo. Le montant est lu pour vous.", tag: "Le plus simple" },
                    { key: "MANUAL", icon: PencilEdit02Icon, title: "Saisir moi-même", text: "Tapez le montant. Vous joindrez la photo du reçu à la fin.", tag: null },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setMode(option.key)
                      setDirection(1)
                      setStepIndex(2)
                    }}
                    className={cn(
                      "flex items-center gap-4 rounded-3xl p-5 text-left ring-1 transition-colors",
                      option.key === "SCAN" ? "bg-teal text-white ring-teal active:bg-teal-deep" : "bg-surface ring-line active:bg-mint-wash"
                    )}
                  >
                    <span className={cn("inline-flex size-16 shrink-0 items-center justify-center rounded-2xl", option.key === "SCAN" ? "bg-white/15" : "bg-mint-wash text-teal")}>
                      <HugeiconsIcon icon={option.icon} className="size-8" />
                    </span>
                    <span>
                      <span className="flex items-center gap-2 text-xl font-semibold">
                        {option.title}
                      </span>
                      <span className={cn("mt-1 block text-[0.95rem]", option.key === "SCAN" ? "text-white/80" : "text-ink-2")}>{option.text}</span>
                      {option.tag && <span className="mt-2 inline-block rounded-full bg-mint px-2.5 py-0.5 text-xs font-semibold text-teal-deep">{option.tag}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {step === "scan" && <ReceiptCapture read onDone={onScanned} />}

            {step === "type" && (
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(VOUCHER_TYPE_META) as IpmVoucherType[]).map((key) => {
                  const meta = VOUCHER_TYPE_META[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        if (type !== key) {
                          const current = db.providers.find((p) => p.id === providerId)
                          if (!current?.specialtyId || !VOUCHER_TYPE_SPECIALTIES[key].includes(current.specialtyId)) setProviderId(null)
                        }
                        setType(key)
                        go(1)
                      }}
                      className={cn(
                        "flex aspect-square flex-col justify-between rounded-3xl bg-surface p-4 text-left ring-1 ring-line transition-colors active:bg-mint-wash",
                        type === key && "ring-2 ring-teal"
                      )}
                    >
                      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-mint-wash text-teal">
                        <HugeiconsIcon icon={meta.icon} className="size-8" />
                      </span>
                      <span>
                        <span className="block text-lg leading-tight font-semibold">{meta.short}</span>
                        <span className="mt-1 block text-sm text-ink-3">{meta.hint}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {step === "provider" && type && (
              <ProviderPicker
                type={type}
                selected={providerId}
                fromReceipt={ocrProviderId}
                onPick={(id) => {
                  setProviderId(id)
                  go(1)
                }}
              />
            )}

            {step === "amount" && (
              <AmountStep
                total={manualTotal}
                setTotal={setManualTotal}
                lines={lines}
                setLines={setLines}
                detailOpen={detailOpen}
                setDetailOpen={setDetailOpen}
                ocrTotal={receipt?.ocr?.total ?? null}
                onNext={() => go(1)}
              />
            )}

            {step === "receipt" && (
              <div className="flex flex-1 flex-col">
                {receipt ? (
                  <div className="flex flex-col items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receipt.receiptUrl} alt="Reçu joint" className="max-h-72 rounded-2xl ring-1 ring-line" />
                    <p className="mt-3 flex items-center gap-1.5 font-medium text-teal">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-5" /> Reçu joint
                    </p>
                    <div className="mt-auto grid w-full gap-2.5 pt-6">
                      <Button onClick={() => go(1)} className="h-14 rounded-2xl text-lg font-semibold">Continuer</Button>
                      <Button variant="ghost" onClick={() => setReceipt(null)} className="h-12 rounded-2xl text-teal">
                        <HugeiconsIcon icon={Camera01Icon} className="size-5" /> Changer de photo
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="-mt-2 mb-4 text-ink-2">La photo est obligatoire : l&apos;IPM la compare à la facture du prestataire.</p>
                    <ReceiptCapture read={false} onDone={(r) => setReceipt(r)} />
                  </>
                )}
              </div>
            )}

            {step === "recap" && draft && who && (
              <Recap draft={draft} who={who} submitting={submitting} onSubmit={submit} onEditAmount={() => { setDirection(-1); setStepIndex(path.indexOf("amount")) }} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function ProviderPicker({
  type,
  selected,
  fromReceipt,
  onPick,
}: {
  type: IpmVoucherType
  selected: string | null
  fromReceipt: string | null
  onPick: (id: string) => void
}) {
  const { db, session } = useStore()
  const [query, setQuery] = useState("")
  const specialties = VOUCHER_TYPE_SPECIALTIES[type]

  const recentIds = db.vouchers
    .filter((v) => v.memberId === session!.memberId)
    .map((v) => v.providerId)
  const eligible = db.providers
    .filter((p) => p.accredited && p.status === "ACTIVE" && p.specialtyId && specialties.includes(p.specialtyId))
    .filter((p) => !query || `${p.name} ${p.address}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const ra = recentIds.indexOf(a.id)
      const rb = recentIds.indexOf(b.id)
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb) || a.name.localeCompare(b.name)
    })

  return (
    <div>
      <label className="flex h-14 items-center gap-2 rounded-2xl bg-surface px-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-mint-deep">
        <HugeiconsIcon icon={Search01Icon} className="size-5 text-ink-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom ou quartier"
          className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-ink-3"
        />
      </label>
      <ul className="mt-3 space-y-2">
        {eligible.map((provider) => {
          const specialty = db.specialties.find((s) => s.id === provider.specialtyId)
          const recent = recentIds.includes(provider.id)
          return (
            <li key={provider.id}>
              <button
                type="button"
                onClick={() => onPick(provider.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left ring-1 ring-line active:bg-mint-wash",
                  selected === provider.id && "ring-2 ring-teal"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{provider.name}</span>
                  <span className="block truncate text-sm text-ink-3">{provider.address}</span>
                </span>
                {fromReceipt === provider.id ? (
                  <Badge tone="mint">Lu sur le reçu</Badge>
                ) : recent ? (
                  <Badge tone="neutral">Déjà utilisé</Badge>
                ) : (
                  <span className="text-xs text-ink-3">{specialty?.label}</span>
                )}
              </button>
            </li>
          )
        })}
        {eligible.length === 0 && (
          <li className="rounded-2xl bg-surface p-5 text-center text-ink-2 ring-1 ring-line">
            Aucun prestataire agréé ne correspond. Essayez un autre nom.
          </li>
        )}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function AmountStep({
  total,
  setTotal,
  lines,
  setLines,
  detailOpen,
  setDetailOpen,
  ocrTotal,
  onNext,
}: {
  total: number
  setTotal: (v: number) => void
  lines: DraftLine[]
  setLines: (l: DraftLine[]) => void
  detailOpen: boolean
  setDetailOpen: (v: boolean) => void
  ocrTotal: number | null
  onNext: () => void
}) {
  const computed = draftTotal({ lines: detailOpen ? lines : [], manualTotal: total })
  const fromLines = detailOpen && lines.some((l) => l.unitPrice > 0)

  function update(index: number, patch: Partial<DraftLine>) {
    setLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="rounded-3xl bg-surface p-5 text-center ring-1 ring-line">
        <p className="flex items-center justify-center gap-2 text-sm text-ink-2">
          Montant total du reçu
          {ocrTotal !== null && computed === ocrTotal && <Badge tone="mint">Lu sur le reçu</Badge>}
        </p>
        <p className="mt-1 flex items-baseline justify-center gap-1.5">
          <span className={cn("figure text-[3.6rem] leading-none font-bold", computed ? "text-ink" : "text-ink-3/50")}>
            {grouped(computed)}
          </span>
          <span className="figure text-2xl text-ink-2">F</span>
        </p>
        {fromLines && <p className="mt-1 text-sm text-ink-3">Calculé à partir des articles</p>}
      </div>

      {!detailOpen && (
        <div className="mt-4">
          <AmountPad value={total} onChange={setTotal} />
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (!detailOpen && lines.length === 0) setLines([{ label: "", quantity: 1, unitPrice: 0 }])
          setDetailOpen(!detailOpen)
        }}
        className="mt-4 flex items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-teal"
      >
        <HugeiconsIcon icon={detailOpen ? Tick02Icon : Add01Icon} className="size-5" />
        {detailOpen ? "Saisir seulement le total" : "Ajouter le détail des articles (facultatif)"}
      </button>

      {detailOpen && (
        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="rounded-2xl bg-surface p-3 ring-1 ring-line">
              <div className="flex gap-2">
                <input
                  value={line.label}
                  onChange={(e) => update(index, { label: e.target.value })}
                  placeholder="Article"
                  aria-label="Article"
                  className="h-11 min-w-0 flex-1 rounded-xl bg-sunken px-3 outline-none focus:ring-2 focus:ring-mint-deep"
                />
                <button type="button" aria-label="Retirer l'article" onClick={() => setLines(lines.filter((_, i) => i !== index))} className="inline-flex size-11 items-center justify-center rounded-xl text-ink-3">
                  <HugeiconsIcon icon={Delete02Icon} className="size-5" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-[5rem_1fr] gap-2">
                <input
                  inputMode="numeric"
                  value={line.quantity || ""}
                  onChange={(e) => update(index, { quantity: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                  aria-label="Quantité"
                  placeholder="Qté"
                  className="figure h-11 rounded-xl bg-sunken px-3 text-xl outline-none focus:ring-2 focus:ring-mint-deep"
                />
                <input
                  inputMode="numeric"
                  value={line.unitPrice ? grouped(line.unitPrice) : ""}
                  onChange={(e) => update(index, { unitPrice: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                  aria-label="Prix unitaire"
                  placeholder="Prix unitaire (F)"
                  className="figure h-11 rounded-xl bg-sunken px-3 text-xl outline-none focus:ring-2 focus:ring-mint-deep"
                />
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={() => setLines([...lines, { label: "", quantity: 1, unitPrice: 0 }])} className="h-12 w-full rounded-2xl">
            <HugeiconsIcon icon={Add01Icon} className="size-5" /> Autre article
          </Button>
        </div>
      )}

      <Button onClick={onNext} disabled={computed <= 0} className="mt-auto h-14 rounded-2xl text-lg font-semibold">
        Continuer
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function Recap({
  draft,
  who,
  submitting,
  onSubmit,
  onEditAmount,
}: {
  draft: VoucherDraft
  who: FamilyMember
  submitting: boolean
  onSubmit: () => void
  onEditAmount: () => void
}) {
  const { db, session } = useStore()
  const result = preview(db, session!.memberId, draft)
  const provider = db.providers.find((p) => p.id === draft.providerId)!
  const meta = VOUCHER_TYPE_META[draft.type]
  const hold = result.review?.hold ?? false

  return (
    <div className="flex flex-1 flex-col">
      <div className="rounded-3xl bg-surface ring-1 ring-line">
        <div className="flex items-center gap-3 border-b border-line p-4">
          <Avatar person={who.person} rank={who.rank} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{who.name}</p>
            <p className="truncate text-sm text-ink-3">{meta.label} chez {provider.name}</p>
          </div>
          {draft.receiptUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.receiptUrl} alt="Reçu" className="size-12 rounded-lg object-cover ring-1 ring-line" />
          )}
        </div>
        <div className="p-4">
          <button type="button" onClick={onEditAmount} className="flex w-full items-baseline justify-between">
            <span className="text-ink-2">Montant total</span>
            <span className="figure text-[2rem] font-bold">{francs(result.totalAmount)}</span>
          </button>
          {result.decision.allowed && (
            <div className="mt-4">
              <SplitBar insurer={result.decision.split.insurerShare} member={result.decision.split.memberShare} rate={result.rate!.rate} />
            </div>
          )}
        </div>
      </div>

      {!result.decision.allowed && (
        <div className="mt-4 rounded-2xl bg-red-tint p-4 text-red">
          <p className="flex items-center gap-2 font-semibold">
            <HugeiconsIcon icon={Alert02Icon} className="size-5" />
            Ce bon ne peut pas être créé
          </p>
          <ul className="mt-2 space-y-1.5 text-[0.95rem]">
            {result.decision.refusals.map((refusal) => (
              <li key={refusal.code}>{refusal.message}</li>
            ))}
          </ul>
          {result.decision.refusals.some((r) => r.code === "CEILING_REACHED") && (
            <button type="button" onClick={onEditAmount} className="mt-3 font-semibold underline underline-offset-2">Modifier le montant</button>
          )}
        </div>
      )}

      {result.decision.allowed && hold && (
        <div className="mt-4 flex gap-3 rounded-2xl bg-amber-tint p-4 text-amber">
          <HugeiconsIcon icon={Clock01Icon} className="mt-0.5 size-5 shrink-0" />
          <p className="text-[0.95rem]">
            Au-delà de {francs(result.review!.threshold)}, l&apos;IPM valide le bon avant que vous puissiez l&apos;utiliser.
            Vous serez prévenu par SMS.
          </p>
        </div>
      )}

      {result.decision.allowed && !hold && result.remainingMonthly !== null && (
        <p className="mt-4 text-center text-sm text-ink-2">
          Après ce bon, il restera {francs(Math.max(0, result.remainingMonthly - result.decision.split.insurerShare))} de prise en charge ce mois-ci.
        </p>
      )}

      <Button onClick={onSubmit} disabled={!result.decision.allowed || submitting} className="mt-auto h-14 rounded-2xl text-lg font-semibold">
        {hold ? "Envoyer pour validation" : "Valider le bon"}
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function Done({ voucher, providerName }: { voucher: IpmVoucher; providerName: string }) {
  const scope = useRef<HTMLDivElement>(null)
  const pending = voucher.status === "PENDING_REVIEW"

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      gsap
        .timeline()
        .from(".done-stamp", { scale: 1.7, rotate: -14, opacity: 0, duration: 0.55, ease: "back.out(2.2)" })
        .from(".done-ticket", { y: 40, opacity: 0, duration: 0.5, ease: "power3.out" }, "-=0.15")
        .from(".done-actions > *", { y: 16, opacity: 0, stagger: 0.08, duration: 0.35 }, "-=0.2")
    },
    { scope }
  )

  return (
    <div ref={scope} className="flex min-h-dvh flex-col px-5 pt-[max(env(safe-area-inset-top),28px)] pb-6">
      <div className="flex flex-col items-center text-center">
        <span className={cn("done-stamp inline-flex size-20 items-center justify-center rounded-full", pending ? "bg-amber-tint text-amber" : "bg-mint text-teal-deep")}>
          <HugeiconsIcon icon={pending ? Clock01Icon : Tick02Icon} className="size-10" strokeWidth={2.2} />
        </span>
        <h1 className="figure mt-4 text-[2.3rem] leading-none font-bold">{pending ? "Envoyé à l'IPM" : "Votre bon est prêt"}</h1>
        <p className="mt-2 max-w-72 text-ink-2">
          {pending
            ? "Vous recevrez un SMS dès que l'IPM l'aura validé."
            : `Montrez ce code au guichet de ${providerName}.`}
        </p>
      </div>

      <div className="done-ticket mt-6 overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
        <div className="flex items-center justify-between border-b border-dashed border-line px-5 py-4">
          <div>
            <p className="text-sm text-ink-3">{VOUCHER_TYPE_META[voucher.type].label}</p>
            <p className="figure text-2xl font-bold tracking-wide">{voucher.number}</p>
          </div>
          <p className="figure text-right text-2xl font-bold text-teal-deep">{francs(voucher.totalAmount)}</p>
        </div>
        <div className="flex items-center gap-4 p-5">
          <div className={cn("relative size-32 shrink-0", pending && "opacity-25 blur-[2px]")}>
            <Qr value={verifyUrl(voucher.qrToken)} className="size-full" />
          </div>
          <div className="min-w-0 text-sm">
            <p className="font-semibold capitalize">{voucher.beneficiaryName.toLowerCase()}</p>
            <p className="text-ink-2">L&apos;IPM paie {francs(voucher.insurerShare)}</p>
            <p className="text-ink-2">Votre part {francs(voucher.memberShare)}</p>
            <p className="mt-2 text-ink-3">Valable jusqu&apos;au {longDate(voucher.expiryDate)}</p>
          </div>
        </div>
      </div>

      <div className="done-actions mt-auto grid gap-2.5 pt-6">
        <Link href={`/bons/${voucher.id}`} className="flex h-14 items-center justify-center rounded-2xl bg-teal text-lg font-semibold text-white">
          Voir le bon
        </Link>
        <Link href="/" className="flex h-12 items-center justify-center rounded-2xl font-semibold text-teal">
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  )
}
