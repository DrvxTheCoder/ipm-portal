/**
 * Types mirroring `prisma/schema.prisma` of senexus-multiapp (branch
 * feat/ipm-ui-rework), field for field, for the models the participant portal
 * reads or writes.
 *
 * Two conventions differ from Prisma, both because this prototype has no
 * database and persists to localStorage:
 *   - `DateTime` is an ISO string;
 *   - `Decimal` is a number (FCFA has no subunit; rates stay fractions).
 *
 * Everything marked `PORTAL —` is a proposed addition, not yet in the schema.
 * The same additions are written out as Prisma in `prisma/portal-additions.prisma`.
 */

type ISODate = string

/* ------------------------------------------------------------------------ */
/* Enums — copied verbatim                                                  */

export type IpmBeneficiaryType =
  | "ALL"
  | "MEMBER"
  | "SPOUSE_F"
  | "CHILD"
  | "SPOUSE_M"
  | "ASCENDANT"
  | "OTHER"

export type IpmMemberStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "TERMINATED"
export type IpmDependentStatus = "ACTIVE" | "SUSPENDED" | "TERMINATED"
export type IpmDependentRelation = "SPOUSE_F" | "CHILD" | "SPOUSE_M" | "ASCENDANT" | "OTHER"
export type IpmProviderStatus = "ACTIVE" | "SUSPENDED" | "TERMINATED"
export type IpmAgreementStatus = "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED"
export type Gender = "MALE" | "FEMALE"

export type IpmVoucherType = "PHARMACY" | "OPTICAL" | "GUARANTEE" | "HOSPITALIZATION"

/**
 * Existing values, plus two PORTAL additions:
 *   - PENDING_REVIEW — above the review threshold, waiting for the gestionnaire;
 *   - REJECTED — refused at review (distinct from CANCELLED, which the
 *     participant or the IPM does to a bon that was valid).
 */
export type IpmVoucherStatus =
  | "PENDING_REVIEW" // PORTAL
  | "ISSUED"
  | "PRESENTED"
  | "SETTLED"
  | "INVOICED"
  | "CANCELLED"
  | "EXPIRED"
  | "REJECTED" // PORTAL

/** PORTAL — where the bon was created. */
export type IpmVoucherOrigin = "BACKOFFICE" | "PORTAL"

/** PORTAL — how the participant filled the bon. */
export type IpmVoucherEntryMode = "SCAN" | "MANUAL"

/** PORTAL — why a bon issued below the threshold still needs a look. */
export type IpmReviewFlag =
  | "ABOVE_THRESHOLD" // held, not just flagged
  | "AMOUNT_UNUSUAL" // well above this category's usual amount
  | "SAME_DAY_DUPLICATE" // same beneficiary, provider, day
  | "RECEIPT_REUSED" // photo near-identical to an earlier bon's
  | "OCR_MISMATCH" // entered total far from what the receipt read

export type PortalAccountStatus = "INVITED" | "ACTIVE" | "LOCKED"

/* ------------------------------------------------------------------------ */
/* Models                                                                   */

export type Person = {
  id: string
  holdingId: string
  firstName: string
  lastName: string
  birthDate: ISODate | null
  gender: Gender | null
  phone: string | null
  email: string | null
  address: string | null
  photoUrl: string | null
}

export type IpmServiceCategory = {
  id: string
  firmId: string
  code: string
  label: string
  sortOrder: number
  active: boolean
}

export type IpmServiceType = {
  id: string
  firmId: string
  categoryId: string
  code: string
  label: string
  active: boolean
}

export type IpmProviderSpecialty = {
  id: string
  firmId: string
  code: string
  label: string
  active: boolean
}

export type IpmPlan = {
  id: string
  firmId: string
  code: string
  name: string
  monthlyPrice: number
  validFrom: ISODate
  validTo: ISODate | null
  active: boolean
}

export type IpmPlanRate = {
  id: string
  firmId: string
  planId: string
  categoryId: string
  beneficiaryType: IpmBeneficiaryType
  /** Fraction, never a percentage. */
  rate: number
  ceilingPerAct: number | null
  ceilingMonthly: number | null
  ceilingAnnual: number | null
  waitingPeriodDays: number
}

export type IpmEmployer = {
  id: string
  firmId: string
  name: string // Organization.name, flattened for the prototype
  planId: string
  /** From the agreement. */
  reminderDelayDays: number
  suspensionDelayDays: number
  ageMajority: number
}

export type Member = {
  id: string
  firmId: string
  personId: string
  employerId: string
  matricule: string
  legacyCode: string | null
  jobTitle: string | null
  affiliationDate: ISODate
  terminationDate: ISODate | null
  status: IpmMemberStatus
  currentBalance: number
}

export type Dependent = {
  id: string
  firmId: string
  memberId: string
  personId: string
  matricule: string
  relation: IpmDependentRelation
  rank: number
  coverageStart: ISODate
  coverageEnd: ISODate | null
  status: IpmDependentStatus
}

export type IpmMemberCard = {
  id: string
  firmId: string
  memberId: string
  version: number
  generatedAt: ISODate
  revokedAt: ISODate | null
}

export type IpmProvider = {
  id: string
  firmId: string
  name: string
  specialtyId: string | null
  address: string | null
  phone: string | null
  accredited: boolean
  status: IpmProviderStatus
}

export type IpmAgreement = {
  id: string
  firmId: string
  providerId: string
  reference: string
  startDate: ISODate
  endDate: ISODate | null
  status: IpmAgreementStatus
}

export type IpmVoucher = {
  id: string
  firmId: string
  number: string
  type: IpmVoucherType
  memberId: string
  dependentId: string | null
  beneficiaryType: IpmBeneficiaryType
  beneficiaryName: string
  providerId: string
  serviceTypeId: string
  categoryId: string
  issueDate: ISODate
  expiryDate: ISODate
  status: IpmVoucherStatus
  totalAmount: number
  insurerShare: number
  memberShare: number
  appliedRate: number
  rateSource: string
  qrToken: string
  issuedById: string | null
  settledAt: ISODate | null
  cancelledAt: ISODate | null
  cancelReason: string | null

  /* PORTAL ------------------------------------------------------------- */
  origin: IpmVoucherOrigin
  issuedByPortalAccountId: string | null
  entryMode: IpmVoucherEntryMode | null
  /** Zipline URL in production; a data URL in the prototype. */
  receiptUrl: string | null
  /** Perceptual hash (dHash, 64-bit hex) — detects a reused photo. */
  receiptHash: string | null
  /** Total read from the receipt, kept to explain an OCR_MISMATCH flag. */
  ocrTotal: number | null
  reviewFlags: IpmReviewFlag[]
  reviewedById: string | null
  reviewedAt: ISODate | null
  reviewReason: string | null

  createdAt: ISODate
}

export type IpmVoucherLine = {
  id: string
  firmId: string
  voucherId: string
  medicalActId: string | null
  label: string
  quantity: number
  unitPrice: number
  amount: number
}

export type IpmConsumption = {
  id: string
  firmId: string
  /** `member:<id>` or `dependent:<id>`. */
  beneficiaryRef: string
  memberId: string
  categoryId: string
  periodYear: number
  periodMonth: number
  voucherId: string | null
  amount: number
  insurerShare: number
}

/** PORTAL — the participant's login. Not a `User`: no UserFirm, no back office. */
export type PortalAccount = {
  id: string
  firmId: string
  memberId: string
  phone: string
  status: PortalAccountStatus
  activatedAt: ISODate | null
  lastLoginAt: ISODate | null
}

/** PORTAL — per-IPM review policy. */
export type IpmPortalSettings = {
  firmId: string
  /** Above this total, the bon waits for validation. FCFA. */
  reviewThresholdAmount: number
  /** …or above this fraction of the category's monthly ceiling, whichever is lower. */
  reviewThresholdRatio: number
  /** "Unusual" = more than this multiple of the beneficiary's category median. */
  unusualAmountMultiple: number
  /** Gap between entered and read total that raises OCR_MISMATCH. Fraction. */
  ocrMismatchTolerance: number
}
