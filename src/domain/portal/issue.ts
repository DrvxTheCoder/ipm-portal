import type {
  Db,
  IpmBeneficiaryType,
  IpmReviewFlag,
  IpmVoucher,
  IpmVoucherType,
  PortalBooking,
  ResolvedCeiling,
  VoucherDraft,
} from "@/lib/schema"
import { decideIssuance, type IssuanceDecision, type IssuanceFacts } from "@/domain/ipm/issuance"
import { lineTotal } from "@/domain/ipm/settlement"
import { decideReview, type ReviewDecision } from "@/domain/portal/review"

/**
 * Aperçu d'un bon, in the browser, for instant feedback while the participant
 * fills the form.
 *
 * **The server decides.** `POST /api/portail/vouchers` runs the same
 * `decideIssuance` and `decideReview` against the real ledger and numbers the
 * bon; this preview mirrors its rules over the snapshot so the summary rarely
 * disagrees with it, and when it does, the server's answer is the one shown.
 *
 * The rules mirrored from multiapp (`src/server/portal/vouchers.ts`):
 *   - priced lines win; with none, `total` is the amount;
 *   - taux and plafonds are the server's, resolved in `Db.ceilings`
 *     (participant > employer > formule, field by field), never re-derived;
 *   - refusals come from `decideIssuance`;
 *   - any warning holds the bon, flagged `ISSUANCE_WARNING`;
 *   - otherwise `decideReview` decides whether it waits for the gestionnaire.
 */

/** A draft as the form holds it: the request body minus its idempotency key. */
export type DraftInput = Omit<VoucherDraft, "clientRequestId">

export type Preview = {
  totalAmount: number
  rate: ResolvedCeiling | null
  decision: IssuanceDecision
  /** Null when refused. `hold` already includes a warning hold. */
  review: ReviewDecision | null
  /** Left under the monthly ceiling *before* this bon, insurer share. */
  remainingMonthly: number | null
}

const LIVE: ReadonlySet<IpmVoucher["status"]> = new Set([
  "PENDING_REVIEW",
  "ISSUED",
  "PRESENTED",
  "SETTLED",
  "INVOICED",
])

/** Same rule as the server's `draftLines`: a line counts when it has a label, a quantity and a price. */
export function draftTotal(draft: Pick<DraftInput, "lines" | "total">): number {
  const priced = draft.lines.filter((line) => line.label.trim() && line.unitPrice > 0 && line.quantity > 0)
  if (priced.length > 0) return lineTotal(priced)
  return Math.max(0, Math.round(draft.total ?? 0))
}

/** The booking for a type of bon, or null when this IPM does not offer it. */
export function bookingFor(db: Db, type: IpmVoucherType): PortalBooking | null {
  return db.bookings.find((b) => b.type === type) ?? null
}

/** Accredited, active providers that may receive this type of bon. */
export function eligibleProviders(db: Db, booking: PortalBooking) {
  return db.providers.filter(
    (p) =>
      p.accredited &&
      p.status === "ACTIVE" &&
      (booking.specialtyIds.length === 0 || (p.specialtyId !== null && booking.specialtyIds.includes(p.specialtyId)))
  )
}

export function contextFor(db: Db, memberId: string) {
  const member = db.members.find((m) => m.id === memberId)!
  const employer = db.employers.find((e) => e.id === member.employerId)!
  return { member, employer }
}

export function beneficiaryTypeOf(db: Db, dependentId: string | null): IpmBeneficiaryType {
  if (!dependentId) return "MEMBER"
  return db.dependents.find((d) => d.id === dependentId)!.relation
}

/**
 * Taux and plafonds in force for one category and beneficiary type of the
 * family, as the server resolved them. Null: not covered.
 */
export function resolveFor(db: Db, categoryId: string, beneficiaryType: IpmBeneficiaryType): ResolvedCeiling | null {
  return db.ceilings.find((c) => c.categoryId === categoryId && c.beneficiaryType === beneficiaryType) ?? null
}

/**
 * Insurer share consumed this month / year in one category by the whole
 * household. Dependents have no ceiling of their own: every bon, whoever it is
 * for, draws on the participant's.
 */
export function consumedFor(
  db: Db,
  memberId: string,
  categoryId: string,
  on: Date
): { month: number; year: number } {
  let month = 0
  let year = 0
  for (const row of db.consumptions) {
    if (row.memberId !== memberId || row.categoryId !== categoryId) continue
    if (row.periodYear !== on.getFullYear()) continue
    year += row.insurerShare
    if (row.periodMonth === on.getMonth() + 1) month += row.insurerShare
  }
  return { month, year }
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}

export function preview(
  db: Db,
  memberId: string,
  booking: PortalBooking,
  draft: DraftInput,
  on = new Date()
): Preview {
  const { member, employer } = contextFor(db, memberId)
  const beneficiaryType = beneficiaryTypeOf(db, draft.dependentId)
  const rate = resolveFor(db, booking.categoryId, beneficiaryType)
  const consumed = consumedFor(db, memberId, booking.categoryId, on)
  const totalAmount = draftTotal(draft)

  const provider = db.providers.find((p) => p.id === draft.providerId)
  const hasLiveAgreement = db.agreements.some(
    (a) =>
      a.providerId === draft.providerId &&
      a.status === "ACTIVE" &&
      new Date(a.startDate) <= on &&
      (!a.endDate || new Date(a.endDate) >= on)
  )

  const dependent = draft.dependentId ? db.dependents.find((d) => d.id === draft.dependentId)! : null
  const dependentPerson = dependent ? db.persons.find((p) => p.id === dependent.personId)! : null

  const sameCategory = db.vouchers.filter(
    (v) =>
      v.memberId === memberId &&
      v.categoryId === booking.categoryId &&
      (v.dependentId ?? null) === draft.dependentId &&
      LIVE.has(v.status)
  )
  const lastIssued = sameCategory
    .map((v) => new Date(v.issueDate))
    .sort((a, b) => b.getTime() - a.getTime())[0]

  // Contributions come from payroll; until the ledger is wired, assume paid
  // through last month — the same "unknown is not owed" stance as the module.
  const paidThrough = new Date(on.getFullYear(), on.getMonth(), 0)

  const facts: IssuanceFacts = {
    on,
    memberStatus: member.status,
    dependent: dependent
      ? {
          memberStatus: member.status,
          relation: dependent.relation,
          dependentStatus: dependent.status,
          coverageStart: new Date(dependent.coverageStart),
          coverageEnd: dependent.coverageEnd ? new Date(dependent.coverageEnd) : null,
          birthDate: dependentPerson?.birthDate ? new Date(dependentPerson.birthDate) : null,
          ageMajority: employer.ageMajority,
        }
      : null,
    reminderDelayDays: employer.reminderDelayDays,
    suspensionDelayDays: employer.suspensionDelayDays,
    contributionsPaidThrough: paidThrough,
    provider: {
      accredited: provider?.accredited ?? false,
      status: provider?.status ?? "TERMINATED",
      hasLiveAgreement,
    },
    rate: rate?.rate ?? null,
    totalAmount,
    ceilings: {
      perAct: rate?.ceilingPerAct ?? null,
      monthly: rate?.ceilingMonthly ?? null,
      annual: rate?.ceilingAnnual ?? null,
    },
    consumed,
    waitingPeriodDays: rate?.waitingPeriodDays ?? 0,
    lastIssuedInCategory: lastIssued ?? null,
  }

  const decision = decideIssuance(facts)

  const familyCategoryTotals = db.vouchers
    .filter((v) => v.memberId === memberId && v.categoryId === booking.categoryId && LIVE.has(v.status))
    .map((v) => v.totalAmount)

  const policy = decision.allowed
    ? decideReview({
        totalAmount,
        ceilingMonthly: rate?.ceilingMonthly ?? null,
        settings: db.settings,
        previousTotals: familyCategoryTotals,
        sameDayDuplicate: db.vouchers.some(
          (v) =>
            v.memberId === memberId &&
            (v.dependentId ?? null) === draft.dependentId &&
            v.providerId === draft.providerId &&
            LIVE.has(v.status) &&
            sameDay(new Date(v.issueDate), on)
        ),
        receiptHash: draft.receiptHash,
        previousReceiptHashes: db.vouchers
          .map((v) => v.receiptHash)
          .filter((hash): hash is string => Boolean(hash)),
        ocrTotal: draft.ocrTotal,
      })
    : null

  // A warning (late cotisations, lapsed convention) is not the participant's
  // to override: the server holds the bon for a gestionnaire.
  const warned = decision.warnings.length > 0
  const review: ReviewDecision | null = policy && {
    ...policy,
    hold: policy.hold || warned,
    flags: warned ? (["ISSUANCE_WARNING", ...policy.flags] satisfies IpmReviewFlag[]) : policy.flags,
  }

  return {
    totalAmount,
    rate,
    decision,
    review,
    remainingMonthly:
      rate?.ceilingMonthly != null ? Math.max(0, rate.ceilingMonthly - consumed.month) : null,
  }
}
