import type { Db, IpmVoucher, Person } from "@/lib/schema"
import { RELATION_LABELS, ageOn, isDependentCovered } from "@/domain/ipm/coverage"
import { beneficiaryRef } from "@/domain/portal/refs"
import { consumedFor, resolveFor } from "@/domain/portal/issue"

/** Read models for the screens — the query layer of the real module, in miniature. */

export type FamilyMember = {
  key: string
  dependentId: string | null
  person: Person
  name: string
  matricule: string
  relationLabel: string
  age: number | null
  covered: boolean
  coverageMessage: string | null
  rank: number
}

export function family(db: Db, memberId: string, on = new Date()): FamilyMember[] {
  const member = db.members.find((m) => m.id === memberId)!
  const employer = db.employers.find((e) => e.id === member.employerId)!
  const self = db.persons.find((p) => p.id === member.personId)!
  const list: FamilyMember[] = [
    {
      key: beneficiaryRef(memberId, null),
      dependentId: null,
      person: self,
      name: `${self.firstName} ${self.lastName}`,
      matricule: member.matricule,
      relationLabel: "Participant",
      age: self.birthDate ? ageOn(new Date(self.birthDate), on) : null,
      covered: member.status === "ACTIVE",
      coverageMessage: member.status === "ACTIVE" ? null : "Affiliation inactive",
      rank: 0,
    },
  ]
  for (const d of db.dependents.filter((x) => x.memberId === memberId).sort((a, b) => a.rank - b.rank)) {
    const person = db.persons.find((p) => p.id === d.personId)!
    const coverage = isDependentCovered(
      {
        memberStatus: member.status,
        relation: d.relation,
        dependentStatus: d.status,
        coverageStart: new Date(d.coverageStart),
        coverageEnd: d.coverageEnd ? new Date(d.coverageEnd) : null,
        birthDate: person.birthDate ? new Date(person.birthDate) : null,
        ageMajority: employer.ageMajority,
      },
      on
    )
    list.push({
      key: beneficiaryRef(memberId, d.id),
      dependentId: d.id,
      person,
      name: `${person.firstName} ${person.lastName}`,
      matricule: d.matricule,
      relationLabel: RELATION_LABELS[d.relation],
      age: person.birthDate ? ageOn(new Date(person.birthDate), on) : null,
      covered: coverage.covered,
      coverageMessage: coverage.covered ? null : coverage.message,
      rank: d.rank,
    })
  }
  return list
}

/** The household's envelope for one category — one balance shared by the whole family. */
export function envelope(db: Db, memberId: string, categoryId: string, on = new Date()) {
  const rate = resolveFor(db, categoryId, "MEMBER")
  const consumed = consumedFor(db, memberId, categoryId, on)
  const ceiling = rate?.ceilingMonthly ?? null
  return {
    rate: rate?.rate ?? null,
    /** Who set each plafond: the formule, the employer, or the participant's own. */
    source: rate?.source ?? null,
    ceiling,
    consumed: consumed.month,
    remaining: ceiling === null ? null : Math.max(0, ceiling - consumed.month),
    annualCeiling: rate?.ceilingAnnual ?? null,
    annualRemaining: rate?.ceilingAnnual == null ? null : Math.max(0, rate.ceilingAnnual - consumed.year),
    consumedYear: consumed.year,
  }
}

/**
 * What one person has used of the household's balance, per category — over the
 * same period as the ceiling it draws on (the month, or the year for glasses).
 * Informative only: the ceiling itself is shared, see `envelope`.
 */
export function usageOf(db: Db, memberId: string, ref: string, on = new Date()) {
  return [...db.categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => {
      const rate = resolveFor(db, category.id, "MEMBER")
      const period: "mois" | "an" = rate?.ceilingMonthly == null && rate?.ceilingAnnual != null ? "an" : "mois"
      let used = 0
      for (const row of db.consumptions) {
        if (row.beneficiaryRef !== ref || row.categoryId !== category.id) continue
        if (row.periodYear !== on.getFullYear()) continue
        if (period === "mois" && row.periodMonth !== on.getMonth() + 1) continue
        used += row.insurerShare
      }
      return { categoryId: category.id, label: category.label, used, period }
    })
}

export function vouchersOf(db: Db, memberId: string): IpmVoucher[] {
  return db.vouchers
    .filter((v) => v.memberId === memberId)
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
}

export function providerName(db: Db, providerId: string): string {
  return db.providers.find((p) => p.id === providerId)?.name ?? "Prestataire"
}
