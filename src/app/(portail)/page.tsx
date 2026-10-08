"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  ChartUpIcon,
  Clock01Icon,
  HourglassIcon,
  IdCardIcon,
  Location01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { Avatar } from "@/components/portal/avatar"
import { Envelope } from "@/components/portal/envelope"
import { VoucherRow } from "@/components/portal/voucher-row"
import { notificationView, VOUCHER_TYPE_META, effectiveStatus } from "@/components/portal/meta"
import { useStore } from "@/lib/store"
import { envelope, family, providerName, vouchersOf } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { useOnline } from "@/lib/pwa"
import type { Db, IpmCeilingSource } from "@/lib/schema"

type Category = { id: string; tab: string; label: string }
/** `ceiling` null: covered without a cap, `remaining` is then this month's IPM share. */
type Balance = Category & {
  remaining: number
  ceiling: number | null
  period: "mois" | "an"
  source: IpmCeilingSource | null
  rate: number | null
}

/**
 * The categories a participant can spend in: those the IPM's bookings point
 * at, in booking order, named by the first type of bon that books there.
 */
function bookedCategories(db: Db): Category[] {
  const seen = new Set<string>()
  return db.bookings.flatMap((booking) => {
    if (seen.has(booking.categoryId)) return []
    seen.add(booking.categoryId)
    const category = db.categories.find((c) => c.id === booking.categoryId)
    return [{ id: booking.categoryId, tab: VOUCHER_TYPE_META[booking.type].short, label: category?.label ?? VOUCHER_TYPE_META[booking.type].short }]
  })
}

const SHORTCUTS = [
  { href: "/carte", label: "Ma carte", icon: IdCardIcon },
  { href: "/famille", label: "Ma famille", icon: UserGroupIcon },
  { href: "/prestataires", label: "Prestataires", icon: Location01Icon },
  { href: "/consommation", label: "Mes dépenses", icon: ChartUpIcon },
]

export default function HomePage() {
  const { db, session, notifications } = useStore()
  const memberId = session!.memberId
  const people = useMemo(() => family(db, memberId), [db, memberId])
  const me = people[0]

  // One balance per category for the household: every bon, whoever it is for,
  // draws on it. The monthly ceiling when there is one, else the yearly one,
  // else none at all. A category the family is not covered for has no tab.
  const balances = bookedCategories(db).flatMap((c): Balance[] => {
    const env = envelope(db, memberId, c.id)
    if (env.rate === null) return []
    if (env.remaining !== null && env.ceiling !== null) {
      return [{ ...c, remaining: env.remaining, ceiling: env.ceiling, period: "mois", source: env.source?.monthly ?? null, rate: env.rate }]
    }
    if (env.annualRemaining !== null && env.annualCeiling !== null) {
      return [{ ...c, remaining: env.annualRemaining, ceiling: env.annualCeiling, period: "an", source: env.source?.annual ?? null, rate: env.rate }]
    }
    return [{ ...c, remaining: env.consumed, ceiling: null, period: "mois", source: null, rate: env.rate }]
  })
  const [tab, setTab] = useState<string | null>(null)
  const current: Balance | undefined = balances.find((b) => b.id === tab) ?? balances[0]

  const vouchers = vouchersOf(db, memberId)
  const pending = vouchers.filter((v) => v.status === "PENDING_REVIEW")
  // Bons de pharmacie the pharmacy has not priced yet: nothing is deducted
  // until it does, so the balance above does not include them.
  const awaiting = vouchers.filter((v) => effectiveStatus(v) === "AWAITING_AMOUNT")
  const online = useOnline()

  return (
    <div className="pt-[max(env(safe-area-inset-top),18px)]">
      <header className="flex items-center justify-between px-5">
        <div>
          <p className="text-ink-2">Bonjour,</p>
          <h1 className="figure text-[2.2rem] leading-none font-bold">{me.person.firstName}</h1>
        </div>
        <Link href="/prestataires" aria-label="Prestataires" className="inline-flex size-12 items-center justify-center rounded-full bg-surface text-teal ring-1 ring-line">
          <HugeiconsIcon icon={Location01Icon} className="size-6" />
        </Link>
      </header>

      {notifications.length > 0 && (
        <ul className="mx-5 mt-5 space-y-2.5" aria-label="Notifications">
          {notifications.map((n) => {
            const view = notificationView(n)
            const good = view.tone === "good"
            return (
              <li key={n.id}>
                <Link
                  href={`/bons/${n.voucher.id}`}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl p-3.5",
                    good ? "bg-mint text-teal-deep" : "bg-red-tint text-red"
                  )}
                >
                  <HugeiconsIcon icon={good ? CheckmarkCircle02Icon : Alert02Icon} className="size-6 shrink-0" />
                  <span className="min-w-0 flex-1 text-[0.95rem]">
                    <span className="block font-medium">{view.title}</span>
                    {view.detail && <span className="mt-0.5 line-clamp-2 block text-sm">{view.detail}</span>}
                  </span>
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-5 shrink-0" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {pending.length > 0 && (
        <Link
          href={`/bons/${pending[0].id}`}
          className="mx-5 mt-5 flex items-center gap-3 rounded-2xl bg-amber-tint p-3.5 text-amber"
        >
          <HugeiconsIcon icon={Clock01Icon} className="size-6 shrink-0" />
          <span className="flex-1 text-[0.95rem] font-medium">
            {pending.length === 1 ? "1 bon en attente de validation" : `${pending.length} bons en attente de validation`}
          </span>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" />
        </Link>
      )}

      {awaiting.length > 0 && (
        <Link
          href={awaiting.length === 1 ? `/bons/${awaiting[0].id}` : "/bons"}
          className="mx-5 mt-5 flex items-center gap-3 rounded-2xl bg-amber-tint p-3.5 text-amber"
        >
          <HugeiconsIcon icon={HourglassIcon} className="size-6 shrink-0" />
          <span className="flex-1 text-[0.95rem] font-medium">
            {awaiting.length === 1 ? "1 bon de pharmacie en attente de montant" : `${awaiting.length} bons de pharmacie en attente de montant`}
          </span>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" />
        </Link>
      )}

      {/* envelope */}
      {current && (
        <section className="mx-5 mt-5 rounded-2xl bg-surface p-5 ring-1 ring-line">
          <div
            role="tablist"
            aria-label="Type de soins"
            className="mb-5 grid gap-1 rounded-full bg-sunken p-1"
            style={{ gridTemplateColumns: `repeat(${balances.length}, minmax(0, 1fr))` }}
          >
            {balances.map((b) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={b.id === current.id}
                title={b.label}
                onClick={() => setTab(b.id)}
                className={cn(
                  "h-9 truncate rounded-full px-2 text-sm font-medium transition-colors",
                  b.id === current.id ? "bg-surface text-teal-deep shadow-sm" : "text-ink-2"
                )}
              >
                {b.tab}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            <Envelope
              personKey={current.id}
              remaining={current.remaining}
              ceiling={current.ceiling}
              period={current.period}
              source={current.source}
              rate={current.rate}
              label={`${current.label} `}
              awaiting={awaiting.filter((v) => v.categoryId === current.id).length}
            />
          </div>
          {people.length > 1 && (
            <Link href="/famille" className="mt-4 flex items-center gap-3">
              <span className="flex -space-x-2">
                {people.map((person) => (
                  <Avatar key={person.key} person={person.person} rank={person.rank} className="size-8 text-sm ring-2 ring-surface" />
                ))}
              </span>
              <span className="text-sm text-ink-2">Partagé avec votre famille</span>
            </Link>
          )}
        </section>
      )}

      {/* primary action */}
      <div className="mx-5 mt-5">
        {online ? (
          <Link
            href="/bons/nouveau"
            className="flex h-16 items-center justify-center gap-2.5 rounded-2xl bg-teal text-lg font-semibold text-white shadow-[0_14px_30px_-14px_rgba(26,101,116,.9)] transition-transform active:translate-y-px"
          >
            <HugeiconsIcon icon={Add01Icon} className="size-6" strokeWidth={2.2} />
            Créer un bon
          </Link>
        ) : (
          <div
            aria-disabled
            className="flex h-16 flex-col items-center justify-center rounded-2xl bg-sunken text-ink-3"
          >
            <span className="flex items-center gap-2 text-lg font-semibold">
              <HugeiconsIcon icon={Add01Icon} className="size-6" strokeWidth={2.2} />
              Créer un bon
            </span>
            <span className="text-xs">Connexion internet requise</span>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {SHORTCUTS.map((s) => (
            <Link key={s.href} href={s.href} className="flex flex-col justify-items-center items-center gap-2 rounded-2xl bg-surface p-4 ring-1 ring-line">
              <HugeiconsIcon icon={s.icon} className="size-6 shrink-0 text-teal" />
              <span className="font-medium">{s.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* recent */}
      <section className="mt-7 px-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="figure text-2xl font-bold">Derniers bons</h2>
          <Link href="/bons" className="text-sm font-semibold text-teal">Tout voir</Link>
        </div>
        <div className="space-y-2.5">
          {vouchers.slice(0, 3).map((v) => (
            <VoucherRow key={v.id} voucher={v} providerName={providerName(db, v.providerId)} />
          ))}
        </div>
      </section>
    </div>
  )
}
