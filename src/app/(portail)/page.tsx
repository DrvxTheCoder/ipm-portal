"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowRight01Icon,
  ChartUpIcon,
  Clock01Icon,
  IdCardIcon,
  Location01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { Avatar } from "@/components/portal/avatar"
import { Envelope } from "@/components/portal/envelope"
import { VoucherRow } from "@/components/portal/voucher-row"
import { useStore } from "@/lib/store"
import { envelope, family, providerName, vouchersOf } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { useOnline } from "@/lib/pwa"

const CATEGORIES = [
  { id: "cat_pharma", tab: "Pharmacie", label: "Pharmacie" },
  { id: "cat_hospi", tab: "Soins & hospi.", label: "Soins & hospitalisation" },
  { id: "cat_optique", tab: "Optique", label: "Optique" },
]

type Balance = (typeof CATEGORIES)[number] & { remaining: number; ceiling: number; period: "mois" | "an" }

const SHORTCUTS = [
  { href: "/carte", label: "Ma carte", icon: IdCardIcon },
  { href: "/famille", label: "Ma famille", icon: UserGroupIcon },
  { href: "/prestataires", label: "Prestataires", icon: Location01Icon },
  { href: "/consommation", label: "Mes dépenses", icon: ChartUpIcon },
]

export default function HomePage() {
  const { db, session } = useStore()
  const memberId = session!.memberId
  const people = useMemo(() => family(db, memberId), [db, memberId])
  const me = people[0]

  // One balance per category for the household: every bon, whoever it is for,
  // draws on it. Glasses have a yearly ceiling, everything else a monthly one.
  const balances = CATEGORIES.flatMap((c): Balance[] => {
    const env = envelope(db, memberId, c.id)
    if (env.remaining !== null && env.ceiling !== null) {
      return [{ ...c, remaining: env.remaining, ceiling: env.ceiling, period: "mois" }]
    }
    if (env.annualRemaining !== null && env.annualCeiling !== null) {
      return [{ ...c, remaining: env.annualRemaining, ceiling: env.annualCeiling, period: "an" }]
    }
    return []
  })
  const [tab, setTab] = useState(CATEGORIES[0].id)
  const current = balances.find((b) => b.id === tab) ?? balances[0]

  const vouchers = vouchersOf(db, memberId)
  const pending = vouchers.filter((v) => v.status === "PENDING_REVIEW")
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

      {/* envelope */}
      <section className="mx-5 mt-5 rounded-2xl bg-surface p-5 ring-1 ring-line">
        <div role="tablist" aria-label="Type de soins" className="mb-5 grid grid-cols-3 gap-1 rounded-full bg-sunken p-1">
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
            label={`${current.label} `}
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
