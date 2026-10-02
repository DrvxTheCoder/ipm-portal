"use client"

import { PageHeader } from "@/components/portal/app-shell"
import { IpmCard, type CardCoverage } from "@/components/portal/ipm-card"
import { verifyUrl } from "@/components/portal/qr"
import { useStore } from "@/lib/store"
import { family } from "@/lib/queries"
import { resolveFor } from "@/domain/portal/issue"

/** La carte du participant — the only card: dependents are covered under it. */
export default function CartePage() {
  const { db, session } = useStore()
  const memberId = session!.memberId
  const [holder, ...dependents] = family(db, memberId)
  const member = db.members.find((m) => m.id === memberId)!
  const employer = db.employers.find((e) => e.id === member.employerId)!
  // No formule for an employer on a negotiated flat rate.
  const plan = employer.planId ? db.plans.find((p) => p.id === employer.planId) : undefined
  const card = db.cards.find((c) => c.memberId === memberId)

  // The artwork has room for two rates; like the module, print the first two
  // categories that resolve to a real barème, never a rate nobody chose.
  const coverage: CardCoverage[] = [...db.categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((category) => {
      const rate = resolveFor(db, category.id, "MEMBER")
      return rate ? [{ label: category.label, rate: rate.rate }] : []
    })
    .slice(0, 2)

  return (
    <div>
      <PageHeader title="Ma carte" back="/" />
      <div className="pt-6 h-full flex flex-col justify-items-center mx-auto max-w-sm px-5">
        <IpmCard
          holder={holder}
          dependents={dependents}
          planName={plan?.name ?? null}
          employerName={employer.name}
          coverage={coverage}
          qrValue={verifyUrl(`carte-${holder.matricule}-v${card?.version ?? 1}`)}
        />
        <p className="mt-4 text-center text-[0.95rem] text-ink-2">Touchez la carte pour voir vos bénéficiaires.</p>
      </div>
    </div>
  )
}
