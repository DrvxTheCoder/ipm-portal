"use client"

import Link from "next/link"
import { Suspense, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Cancel01Icon, FilterHorizontalIcon, Search01Icon } from "@hugeicons/core-free-icons"
import { PageHeader } from "@/components/portal/app-shell"
import { VoucherRow } from "@/components/portal/voucher-row"
import { VOUCHER_TYPE_META } from "@/components/portal/meta"
import { useStore } from "@/lib/store"
import { family, providerName, vouchersOf } from "@/lib/queries"
import { beneficiaryRef } from "@/domain/portal/refs"
import { cn } from "@/lib/utils"
import type { IpmVoucherStatus, IpmVoucherType } from "@/lib/schema"

const STATUSES: Array<{ key: string; label: string; statuses: IpmVoucherStatus[] | null }> = [
  { key: "all", label: "Tous", statuses: null },
  { key: "active", label: "À utiliser", statuses: ["ISSUED", "PENDING_REVIEW"] },
  { key: "done", label: "Utilisés", statuses: ["PRESENTED", "SETTLED", "INVOICED"] },
  { key: "closed", label: "Annulés", statuses: ["CANCELLED", "EXPIRED", "REJECTED"] },
]

const TYPES: Array<{ key: IpmVoucherType | "all"; label: string }> = [
  { key: "all", label: "Tous" },
  ...(Object.keys(VOUCHER_TYPE_META) as IpmVoucherType[]).map((key) => ({ key, label: VOUCHER_TYPE_META[key].short })),
]

const DAY = 86_400_000
const PERIODS: Array<{ key: string; label: string; since: (now: Date) => number }> = [
  { key: "all", label: "Toutes", since: () => -Infinity },
  { key: "7d", label: "7 derniers jours", since: (now) => now.getTime() - 7 * DAY },
  { key: "30d", label: "30 derniers jours", since: (now) => now.getTime() - 30 * DAY },
  { key: "3m", label: "3 derniers mois", since: (now) => new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).getTime() },
  { key: "year", label: "Cette année", since: (now) => new Date(now.getFullYear(), 0, 1).getTime() },
]

const AMOUNTS: Array<{ key: string; label: string; min: number; max: number }> = [
  { key: "all", label: "Tous", min: 0, max: Infinity },
  { key: "s", label: "Moins de 10 000 F", min: 0, max: 10_000 },
  { key: "m", label: "10 000 – 50 000 F", min: 10_000, max: 50_000 },
  { key: "l", label: "50 000 – 200 000 F", min: 50_000, max: 200_000 },
  { key: "xl", label: "Plus de 200 000 F", min: 200_000, max: Infinity },
]

/** Lower-case, accents off: "Médina" is found by typing "medina". */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

export default function BonsPage() {
  return (
    <Suspense>
      <BonsList />
    </Suspense>
  )
}

function BonsList() {
  const { db, session } = useStore()
  const memberId = session!.memberId
  const router = useRouter()
  const pour = useSearchParams().get("pour")
  const person = pour ? family(db, memberId).find((p) => p.key === pour) ?? null : null

  const [status, setStatus] = useState("all")
  const [query, setQuery] = useState("")
  const [panelOpen, setPanelOpen] = useState(false)
  const [type, setType] = useState<IpmVoucherType | "all">("all")
  const [period, setPeriod] = useState("all")
  const [amount, setAmount] = useState("all")

  const extraFilters = (type !== "all" ? 1 : 0) + (period !== "all" ? 1 : 0) + (amount !== "all" ? 1 : 0)

  const vouchers = useMemo(() => {
    const statuses = STATUSES.find((s) => s.key === status)!.statuses
    const since = PERIODS.find((p) => p.key === period)!.since(new Date())
    const range = AMOUNTS.find((a) => a.key === amount)!
    const needle = fold(query.trim())
    return vouchersOf(db, memberId).filter((v) => {
      if (person && beneficiaryRef(v.memberId, v.dependentId ?? null) !== person.key) return false
      if (statuses && !statuses.includes(v.status)) return false
      if (type !== "all" && v.type !== type) return false
      if (new Date(v.issueDate).getTime() < since) return false
      if (v.totalAmount < range.min || v.totalAmount >= range.max) return false
      if (needle) {
        const haystack = fold([v.number, v.beneficiaryName, providerName(db, v.providerId), VOUCHER_TYPE_META[v.type].short].join(" "))
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [db, memberId, person, status, type, period, amount, query])

  function resetFilters() {
    setType("all")
    setPeriod("all")
    setAmount("all")
  }

  return (
    <div>
      <PageHeader
        title="Mes bons"
        action={
          <Link href="/bons/nouveau" aria-label="Créer un bon" className="inline-flex size-11 items-center justify-center rounded-full bg-teal text-white">
            <HugeiconsIcon icon={Add01Icon} className="size-6" />
          </Link>
        }
      />

      <div className="flex gap-2 px-4 pb-3">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface px-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-teal">
          <HugeiconsIcon icon={Search01Icon} className="size-5 shrink-0 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="N° de bon, nom, prestataire"
            aria-label="Rechercher un bon"
            className="min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche" className="text-ink-3">
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          aria-expanded={panelOpen}
          aria-label="Filtres"
          className={cn(
            "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full ring-1",
            panelOpen || extraFilters > 0 ? "bg-teal text-white ring-teal" : "bg-surface text-ink-2 ring-line"
          )}
        >
          <HugeiconsIcon icon={FilterHorizontalIcon} className="size-5" />
          {extraFilters > 0 && (
            <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-mint text-xs font-bold text-teal-deep ring-2 ring-paper">
              {extraFilters}
            </span>
          )}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {panelOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="mx-4 mb-3 space-y-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
              <ChipGroup label="Type" options={TYPES} value={type} onChange={setType} />
              <ChipGroup label="Date" options={PERIODS} value={period} onChange={setPeriod} />
              <ChipGroup label="Montant" options={AMOUNTS} value={amount} onChange={setAmount} />
              {extraFilters > 0 && (
                <button type="button" onClick={resetFilters} className="text-sm font-semibold text-teal">
                  Effacer les filtres
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]" role="tablist" aria-label="Statut">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={status === s.key}
            onClick={() => setStatus(s.key)}
            className={cn(
              "h-10 shrink-0 rounded-full px-4 text-[0.95rem] font-medium ring-1",
              status === s.key ? "bg-teal text-white ring-teal" : "bg-surface text-ink-2 ring-line"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {person && (
        <div className="px-4 pb-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-mint-wash py-1.5 pr-1.5 pl-3.5 text-sm font-medium text-teal-deep">
            Pour {person.person.firstName}
            <button
              type="button"
              onClick={() => router.replace("/bons")}
              aria-label={`Retirer le filtre ${person.person.firstName}`}
              className="grid size-6 place-items-center rounded-full bg-surface/70"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          </span>
        </div>
      )}

      <div className="space-y-2.5 px-4">
        {vouchers.map((v) => (
          <VoucherRow key={v.id} voucher={v} providerName={providerName(db, v.providerId)} />
        ))}
        {vouchers.length === 0 && (
          <div className="rounded-2xl bg-surface p-6 text-center ring-1 ring-line">
            <p className="text-ink-2">Aucun bon ne correspond.</p>
            <Link href="/bons/nouveau" className="mt-3 inline-block font-semibold text-teal">Créer un bon</Link>
          </div>
        )}
      </div>
    </div>
  )
}

function ChipGroup<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ key: K; label: string }>
  value: K
  onChange: (key: K) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            onClick={() => onChange(o.key)}
            className={cn(
              "h-9 rounded-full px-3.5 text-sm font-medium ring-1",
              value === o.key ? "bg-mint-wash text-teal-deep ring-teal" : "bg-surface text-ink-2 ring-line"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
