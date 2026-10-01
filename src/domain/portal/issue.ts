import type {
  IpmBeneficiaryType,
  IpmVoucher,
  IpmVoucherEntryMode,
  IpmVoucherLine,
  IpmVoucherType,
} from "@/lib/schema"
import type { Db } from "@/lib/mock-data"
import { VOUCHER_TYPE_BOOKING } from "@/lib/mock-data"
import {
  decideIssuance,
  expiryFor,
  formatVoucherNumber,
  type IssuanceDecision,
  type IssuanceFacts,
} from "@/domain/ipm/issuance"
import { lineTotal } from "@/domain/ipm/settlement"
import { tryResolveRate, type RateRow, type ResolvedRate } from "@/domain/ipm/rates"
import { decideReview, type ReviewDecision } from "@/domain/portal/review"
import { beneficiaryRef } from "@/domain/portal/refs"

/**
 * Émission d'un bon depuis le portail.
 *
 * The same `decideIssuance` the back office runs — copied verbatim from
 * senexus-multiapp — then the portal's own review policy on top. In the real
 * module this is a server action inside a transaction; here it is a pure
 * function over the in-memory database, so the rules are identical and only
 * the storage differs.
 *
 * One deliberate departure from `settlement.ts`, which says "the voucher total
 * is never entered by hand": on the portal it may be. When the participant
 * enters lines, the total is their sum; when they only have the receipt total,
 * that total stands and the lines are completed later from the invoice. That
 * is the decision taken to get rid of blank bons without asking more than the
 * participant can give.
 */

export type DraftLine = { label: string; quantity: number; unitPrice: number }

export type VoucherDraft = {
  type: IpmVoucherType
  /** Null when the participant is the beneficiary. */
  dependentId: string | null
  providerId: string
  entryMode: IpmVoucherEntryMode
  lines: DraftLine[]
  /** Used when there are no priced lines. */
  manualTotal: number | null
  receiptUrl: string | null
  receiptHash: string | null
  ocrTotal: number | null
}

export type Preview = {
  totalAmount: number
  rate: ResolvedRate | null
  decision: IssuanceDecision
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

export function draftTotal(draft: Pick<VoucherDraft, "lines" | "manualTotal">): number {
  const priced = draft.lines.filter((line) => line.unitPrice > 0 && line.quantity > 0)
  if (priced.length > 0) return lineTotal(priced)
  return Math.max(0, Math.round(draft.manualTotal ?? 0))
}

function planRows(db: Db, planId: string): RateRow[] {
  return db.planRates
    .filter((row) => row.planId === planId)
    .map((row) => ({
      categoryId: row.categoryId,
      beneficiaryType: row.beneficiaryType,
      rate: row.rate,
      ceilingPerAct: row.ceilingPerAct,
      ceilingMonthly: row.ceilingMonthly,
      ceilingAnnual: row.ceilingAnnual,
      waitingPeriodDays: row.waitingPeriodDays,
    }))
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

export function resolveFor(
  db: Db,
  memberId: string,
  categoryId: string,
  beneficiaryType: IpmBeneficiaryType
): ResolvedRate | null {
  const { employer } = contextFor(db, memberId)
  const category = db.categories.find((c) => c.id === categoryId)!
  return tryResolveRate({
    categoryId,
    categoryCode: category.code,
    beneficiaryType,
    employerRates: [],
    planRates: planRows(db, employer.planId),
  })
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

export function preview(db: Db, memberId: string, draft: VoucherDraft, on = new Date()): Preview {
  const { member, employer } = contextFor(db, memberId)
  const booking = VOUCHER_TYPE_BOOKING[draft.type]
  const beneficiaryType = beneficiaryTypeOf(db, draft.dependentId)
  const rate = resolveFor(db, memberId, booking.categoryId, beneficiaryType)
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

  const review = decision.allowed
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

  return {
    totalAmount,
    rate,
    decision,
    review,
    remainingMonthly:
      rate?.ceilingMonthly != null ? Math.max(0, rate.ceilingMonthly - consumed.month) : null,
  }
}

function token(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export class PortalIssuanceError extends Error {}

/**
 * Decided again here, against the database as it is now — the same reason the
 * module decides twice: the preview may be stale by the time the button is hit.
 */
export function issue(
  db: Db,
  memberId: string,
  portalAccountId: string,
  draft: VoucherDraft,
  on = new Date()
): { db: Db; voucher: IpmVoucher } {
  if (!draft.receiptUrl) {
    throw new PortalIssuanceError("La photo du reçu est obligatoire.")
  }
  const result = preview(db, memberId, draft, on)
  if (!result.decision.allowed) {
    throw new PortalIssuanceError(result.decision.refusals.map((r) => r.message).join(" "))
  }
  if (result.totalAmount <= 0) {
    throw new PortalIssuanceError("Indiquez le montant du reçu.")
  }

  const { split } = result.decision
  const review = result.review!
  const booking = VOUCHER_TYPE_BOOKING[draft.type]
  const dependent = draft.dependentId ? db.dependents.find((d) => d.id === draft.dependentId)! : null
  const member = db.members.find((m) => m.id === memberId)!
  const person = db.persons.find((p) => p.id === (dependent?.personId ?? member.personId))!

  const sequence = db.sequences[draft.type]
  const id = `v_${token().slice(0, 12)}`
  const nowIso = on.toISOString()

  const voucher: IpmVoucher = {
    id,
    firmId: db.firmId,
    number: formatVoucherNumber(draft.type, sequence),
    type: draft.type,
    memberId,
    dependentId: dependent?.id ?? null,
    beneficiaryType: dependent ? dependent.relation : "MEMBER",
    beneficiaryName: `${person.firstName} ${person.lastName}`.toUpperCase(),
    providerId: draft.providerId,
    serviceTypeId: booking.serviceTypeId,
    categoryId: booking.categoryId,
    issueDate: nowIso,
    expiryDate: expiryFor(draft.type, on).toISOString(),
    status: review.hold ? "PENDING_REVIEW" : "ISSUED",
    totalAmount: split.totalAmount,
    insurerShare: split.insurerShare,
    memberShare: split.memberShare,
    appliedRate: result.rate!.rate,
    rateSource: `${result.rate!.source}:${result.rate!.matchedOn}`,
    qrToken: token(),
    issuedById: null,
    settledAt: null,
    cancelledAt: null,
    cancelReason: null,
    origin: "PORTAL",
    issuedByPortalAccountId: portalAccountId,
    entryMode: draft.entryMode,
    receiptUrl: draft.receiptUrl,
    receiptHash: draft.receiptHash,
    ocrTotal: draft.ocrTotal,
    reviewFlags: review.flags,
    reviewedById: null,
    reviewedAt: null,
    reviewReason: null,
    createdAt: nowIso,
  }

  const lines: IpmVoucherLine[] = draft.lines
    .filter((line) => line.label.trim() && line.unitPrice > 0)
    .map((line, index) => ({
      id: `${id}_l${index + 1}`,
      firmId: db.firmId,
      voucherId: id,
      medicalActId: null,
      label: line.label.trim(),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: Math.round(line.quantity * line.unitPrice),
    }))

  // A held bon reserves its share too — otherwise several pending bons could
  // together exceed the ceiling the moment they are all validated.
  const consumption = {
    id: `c_${id}`,
    firmId: db.firmId,
    beneficiaryRef: beneficiaryRef(memberId, voucher.dependentId),
    memberId,
    categoryId: booking.categoryId,
    periodYear: on.getFullYear(),
    periodMonth: on.getMonth() + 1,
    voucherId: id,
    amount: split.totalAmount,
    insurerShare: split.insurerShare,
  }

  return {
    voucher,
    db: {
      ...db,
      vouchers: [voucher, ...db.vouchers],
      voucherLines: [...db.voucherLines, ...lines],
      consumptions: [...db.consumptions, consumption],
      sequences: { ...db.sequences, [draft.type]: sequence + 1 },
    },
  }
}

/**
 * The participant may cancel their own bon while nobody has acted on it yet —
 * issued or still pending. Never edited, never deleted: the QR token rotates
 * so a printed copy stops verifying, and the consumption is released.
 */
export function cancel(db: Db, voucherId: string, reason: string, on = new Date()): Db {
  const voucher = db.vouchers.find((v) => v.id === voucherId)
  if (!voucher) throw new PortalIssuanceError("Bon introuvable.")
  if (voucher.status !== "ISSUED" && voucher.status !== "PENDING_REVIEW") {
    throw new PortalIssuanceError("Ce bon a déjà été utilisé et ne peut plus être annulé.")
  }
  return {
    ...db,
    vouchers: db.vouchers.map((v) =>
      v.id === voucherId
        ? { ...v, status: "CANCELLED", cancelledAt: on.toISOString(), cancelReason: reason, qrToken: token() }
        : v
    ),
    consumptions: db.consumptions.filter((c) => c.voucherId !== voucherId),
  }
}
