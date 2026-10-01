"use client"

import { motion } from "motion/react"
import { PageHeader } from "@/components/portal/app-shell"
import { Avatar } from "@/components/portal/avatar"
import { useStore } from "@/lib/store"
import { envelope, family } from "@/lib/queries"
import { francs, grouped } from "@/lib/format"

/**
 * Mes dépenses — what Senedigit's statistics page tried to say, in sentences:
 * how much the IPM paid, how much was yours, where it went, who it was for.
 * Read from IpmConsumption, the same table the ceilings are checked against.
 */
export default function ConsommationPage() {
  const { db, session } = useStore()
  const memberId = session!.memberId
  const now = new Date()
  const year = now.getFullYear()
  const rows = db.consumptions.filter((c) => c.memberId === memberId && c.periodYear === year)
  const paid = rows.reduce((s, c) => s + c.insurerShare, 0)
  const yours = rows.reduce((s, c) => s + (c.amount - c.insurerShare), 0)

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, now.getMonth() - 5 + i, 1)
    const m = rows.filter((c) => c.periodYear === d.getFullYear() && c.periodMonth === d.getMonth() + 1)
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
      insurer: m.reduce((s, c) => s + c.insurerShare, 0),
      member: m.reduce((s, c) => s + (c.amount - c.insurerShare), 0),
      current: i === 5,
    }
  })
  const peak = Math.max(1, ...months.map((m) => m.insurer + m.member))

  const people = family(db, memberId)
  const byPerson = people
    .map((p) => ({ person: p, total: rows.filter((c) => c.beneficiaryRef === p.key).reduce((s, c) => s + c.amount, 0) }))
    .sort((a, b) => b.total - a.total)

  return (
    <div>
      <PageHeader title="Mes dépenses" back="/" />
      <div className="mt-2 space-y-4 px-4">
        <section className="rounded-3xl bg-teal-deep p-5 text-white">
          <p className="text-white/75">En {year}, l&apos;IPM a pris en charge</p>
          <p className="figure text-[3rem] leading-none font-bold text-mint">{francs(paid)}</p>
          <p className="mt-3 text-white/75">
            Votre part : <span className="figure text-xl font-semibold text-white">{francs(yours)}</span>
          </p>
        </section>

        <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h2 className="figure text-xl font-bold">Les six derniers mois</h2>
          <div className="mt-4 flex h-40 items-end gap-2.5" role="img" aria-label="Dépenses par mois">
            {months.map((m, i) => {
              const total = m.insurer + m.member
              return (
                <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  {total > 0 && <span className="figure text-xs text-ink-3">{grouped(Math.round(total / 1000))}k</span>}
                  <motion.div
                    className="flex w-full flex-col overflow-hidden rounded-lg"
                    initial={{ height: 0 }}
                    animate={{ height: `${(total / peak) * 100}%` }}
                    transition={{ delay: i * 0.05, duration: 0.5, ease: "easeOut" }}
                  >
                    <div className="bg-ink-3/35" style={{ flex: m.member }} />
                    <div className={m.current ? "bg-teal" : "bg-mint"} style={{ flex: m.insurer }} />
                  </motion.div>
                  <span className={`text-xs capitalize ${m.current ? "font-semibold text-ink" : "text-ink-3"}`}>{m.label}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex gap-4 text-sm text-ink-2">
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-mint" /> Payé par l&apos;IPM</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-ink-3/35" /> Votre part</span>
          </div>
        </section>

        <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h2 className="figure text-xl font-bold">Par type de soins</h2>
          <ul className="mt-3 space-y-4">
            {db.categories.map((category) => {
              const spent = rows.filter((c) => c.categoryId === category.id).reduce((s, c) => s + c.insurerShare, 0)
              const env = envelope(db, memberId, category.id)
              const annual = env.annualCeiling
              return (
                <li key={category.id}>
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{category.label}</span>
                    <span className="figure text-lg font-semibold">{francs(spent)}</span>
                  </div>
                  {annual && <p className="mt-0.5 text-sm text-ink-3">Plafond annuel : {francs(annual)}</p>}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h2 className="figure text-xl font-bold">Par personne</h2>
          <ul className="mt-3 divide-y divide-line">
            {byPerson.map(({ person, total }) => (
              <li key={person.key} className="flex items-center gap-3 py-3">
                <Avatar person={person.person} rank={person.rank} className="size-10 text-base" />
                <span className="flex-1 font-medium">{person.person.firstName}</span>
                <span className="figure text-lg font-semibold">{francs(total)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
