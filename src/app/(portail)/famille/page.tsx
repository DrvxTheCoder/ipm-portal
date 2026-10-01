"use client"

import Link from "next/link"
import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { PageHeader } from "@/components/portal/app-shell"
import { Avatar } from "@/components/portal/avatar"
import { Badge } from "@/components/ui/badge"
import { useStore } from "@/lib/store"
import { family, usageOf } from "@/lib/queries"
import { beneficiaryRef } from "@/domain/portal/refs"
import { francs } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Who is covered under the participant's card. Dependents have no card and no
 * balance of their own: they share the participant's. Opening a row shows what
 * that person has used of it, and leads to their bons.
 */
export default function FamillePage() {
  const { db, session } = useStore()
  const memberId = session!.memberId
  const people = family(db, memberId)
  const member = db.members.find((m) => m.id === memberId)!
  const employer = db.employers.find((e) => e.id === member.employerId)!
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div>
      <PageHeader title="Ma famille" />
      <p className="-mt-1 px-5 pb-4 text-ink-2">
        {people.length} personnes couvertes par votre carte. Elles partagent votre prise en charge.
      </p>
      <ul className="space-y-2.5 px-4">
        {people.map((person) => {
          const expanded = open === person.key
          const usage = expanded ? usageOf(db, memberId, person.key) : []
          const bons = expanded
            ? db.vouchers.filter((v) => beneficiaryRef(v.memberId, v.dependentId ?? null) === person.key).length
            : 0
          return (
            <li key={person.key} className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : person.key)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <Avatar person={person.person} rank={person.rank} className="size-12" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{person.name}</span>
                  <span className="block text-sm text-ink-3">{person.relationLabel}</span>
                </span>
                {!person.covered && <Badge tone="red">Non couvert</Badge>}
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  className={cn("size-5 shrink-0 text-ink-3 transition-transform", expanded && "rotate-180")}
                />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="border-t border-line px-4 pt-3 pb-4">
                      <p className="text-sm font-semibold text-ink-2">Pris en charge par l&apos;IPM</p>
                      <dl className="mt-1 divide-y divide-line">
                        {usage.map((u) => (
                          <div key={u.categoryId} className="flex items-baseline justify-between gap-4 py-2.5">
                            <dt className="text-ink-2">
                              {u.label}
                              <span className="block text-xs text-ink-3">{u.period === "an" ? "Cette année" : "Ce mois-ci"}</span>
                            </dt>
                            <dd className="figure text-lg font-semibold">{francs(u.used)}</dd>
                          </div>
                        ))}
                      </dl>
                      <Link
                        href={`/bons?pour=${encodeURIComponent(person.key)}`}
                        className="mt-2 flex items-center justify-between rounded-xl bg-mint-wash px-3.5 py-3 font-semibold text-teal"
                      >
                        {bons === 0
                          ? "Aucun bon pour l'instant"
                          : `Voir les bons`}
                        <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" />
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          )
        })}
      </ul>
      {/* <p className="mt-5 px-5 text-sm text-ink-3">
        Un changement dans la famille (naissance, mariage) ? Signalez-le au service RH de {employer.name}.
      </p> */}
    </div>
  )
}
