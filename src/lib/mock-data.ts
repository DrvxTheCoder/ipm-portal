import type {
  Db,
  Dependent,
  IpmAgreement,
  IpmConsumption,
  IpmEmployer,
  IpmMemberCard,
  IpmPlan,
  IpmPlanRate,
  IpmPortalSettings,
  IpmProvider,
  IpmProviderSpecialty,
  IpmServiceCategory,
  IpmServiceType,
  IpmVoucher,
  IpmVoucherLine,
  IpmVoucherType,
  Member,
  Person,
  PortalAccount,
  PortalBooking,
  ResolvedCeiling,
} from "@/lib/schema"
import { split } from "@/domain/ipm/settlement"
import { formatVoucherNumber, expiryFor, LEGACY_MAXIMA } from "@/domain/ipm/issuance"
import { beneficiaryRef } from "@/domain/portal/refs"
import { sampleReceipt } from "@/lib/sample-receipt"

/**
 * The prototype's database: one participant, her family, the referentiel and
 * three months of history.
 *
 * **Tests only.** At runtime the portal reads multiapp's `/api/portail/snapshot`
 * (see `src/lib/store.tsx`); nothing outside `tests/` may import this file.
 *
 * All names are invented. Providers are real Dakar institutions or plausible
 * ones, so the fixture reads as local.
 */
export type { Db } from "@/lib/schema"

export const FIRM_ID = "firm_ipm_tawfeikh"
const HOLDING_ID = "holding_senexus"

/** What a bon of each type books against — `Db.bookings` in this fixture. */
const VOUCHER_TYPE_BOOKING: Record<
  IpmVoucherType,
  { serviceTypeId: string; categoryId: string }
> = {
  PHARMACY: { serviceTypeId: "st_medicaments", categoryId: "cat_pharma" },
  OPTICAL: { serviceTypeId: "st_optique", categoryId: "cat_optique" },
  GUARANTEE: { serviceTypeId: "st_sejour", categoryId: "cat_hospi" },
  HOSPITALIZATION: { serviceTypeId: "st_hospitalisation", categoryId: "cat_hospi" },
}

/** Provider specialties that can receive each type of bon. */
const VOUCHER_TYPE_SPECIALTIES: Record<IpmVoucherType, string[]> = {
  PHARMACY: ["spec_pharma"],
  OPTICAL: ["spec_optique"],
  GUARANTEE: ["spec_clinique", "spec_labo", "spec_generaliste"],
  HOSPITALIZATION: ["spec_clinique"],
}

function iso(daysAgo: number, hour = 10, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function token(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export function seed(): Db {
  const persons: Person[] = [
    {
      id: "p_awa",
      holdingId: HOLDING_ID,
      firstName: "Awa",
      lastName: "Ndiaye",
      birthDate: "1991-03-14",
      gender: "FEMALE",
      phone: "771234567",
      email: null,
      address: "Cité Keur Gorgui, Dakar",
      photoUrl: null,
    },
    { id: "p_ibrahima", holdingId: HOLDING_ID, firstName: "Ibrahima", lastName: "Sarr", birthDate: "1986-08-02", gender: "MALE", phone: null, email: null, address: null, photoUrl: null },
    { id: "p_fatou", holdingId: HOLDING_ID, firstName: "Fatou", lastName: "Sarr", birthDate: "2017-06-02", gender: "FEMALE", phone: null, email: null, address: null, photoUrl: null },
    { id: "p_cheikh", holdingId: HOLDING_ID, firstName: "Cheikh", lastName: "Sarr", birthDate: "2021-11-20", gender: "MALE", phone: null, email: null, address: null, photoUrl: null },
    { id: "p_khady", holdingId: HOLDING_ID, firstName: "Khady", lastName: "Ndiaye", birthDate: "1960-01-09", gender: "FEMALE", phone: null, email: null, address: null, photoUrl: null },
  ]

  const categories: IpmServiceCategory[] = [
    { id: "cat_pharma", firmId: FIRM_ID, code: "PHARMA", label: "Pharmacie", sortOrder: 1, active: true },
    { id: "cat_optique", firmId: FIRM_ID, code: "OPTIQUE", label: "Optique", sortOrder: 2, active: true },
    { id: "cat_hospi", firmId: FIRM_ID, code: "HOSPI", label: "Soins & hospitalisation", sortOrder: 3, active: true },
  ]

  const serviceTypes: IpmServiceType[] = [
    { id: "st_medicaments", firmId: FIRM_ID, categoryId: "cat_pharma", code: "01", label: "Médicaments", active: true },
    { id: "st_optique", firmId: FIRM_ID, categoryId: "cat_optique", code: "12", label: "Verres et montures", active: true },
    { id: "st_sejour", firmId: FIRM_ID, categoryId: "cat_hospi", code: "20", label: "Séjour hospitalier - clinique", active: true },
    { id: "st_hospitalisation", firmId: FIRM_ID, categoryId: "cat_hospi", code: "21", label: "Hospitalisation", active: true },
  ]

  const specialties: IpmProviderSpecialty[] = [
    { id: "spec_pharma", firmId: FIRM_ID, code: "10", label: "Pharmacie", active: true },
    { id: "spec_optique", firmId: FIRM_ID, code: "20", label: "Opticien", active: true },
    { id: "spec_clinique", firmId: FIRM_ID, code: "30", label: "Clinique / hôpital", active: true },
    { id: "spec_labo", firmId: FIRM_ID, code: "40", label: "Laboratoire d'analyses", active: true },
    { id: "spec_generaliste", firmId: FIRM_ID, code: "50", label: "Médecin généraliste", active: true },
  ]

  const plans: IpmPlan[] = [
    { id: "plan_tawfeikh", firmId: FIRM_ID, code: "TAWFEIKH", name: "Tawfeikh", monthlyPrice: 15000, validFrom: "2026-01-01", validTo: null, active: true },
  ]

  const planRates: IpmPlanRate[] = [
    { id: "pr_pharma", firmId: FIRM_ID, planId: "plan_tawfeikh", categoryId: "cat_pharma", beneficiaryType: "ALL", rate: 0.8, ceilingPerAct: null, ceilingMonthly: 200_000, ceilingAnnual: 1_500_000, waitingPeriodDays: 0 },
    { id: "pr_optique", firmId: FIRM_ID, planId: "plan_tawfeikh", categoryId: "cat_optique", beneficiaryType: "ALL", rate: 0.7, ceilingPerAct: 150_000, ceilingMonthly: null, ceilingAnnual: 150_000, waitingPeriodDays: 730 },
    { id: "pr_hospi", firmId: FIRM_ID, planId: "plan_tawfeikh", categoryId: "cat_hospi", beneficiaryType: "ALL", rate: 0.9, ceilingPerAct: 1_500_000, ceilingMonthly: 1_000_000, ceilingAnnual: 3_000_000, waitingPeriodDays: 0 },
  ]

  const employers: IpmEmployer[] = [
    { id: "emp_touba_oil", firmId: FIRM_ID, name: "Touba Oil SAU", planId: "plan_tawfeikh", reminderDelayDays: 30, suspensionDelayDays: 90, ageMajority: 21 },
  ]

  const members: Member[] = [
    {
      id: "m_awa",
      firmId: FIRM_ID,
      personId: "p_awa",
      employerId: "emp_touba_oil",
      matricule: "01716",
      legacyCode: "006-01716-21",
      jobTitle: "Comptable",
      affiliationDate: "2023-02-01",
      terminationDate: null,
      status: "ACTIVE",
      currentBalance: 0,
    },
  ]

  const dependents: Dependent[] = [
    { id: "d_ibrahima", firmId: FIRM_ID, memberId: "m_awa", personId: "p_ibrahima", matricule: "01716-1", relation: "SPOUSE_M", rank: 1, coverageStart: "2023-02-01", coverageEnd: null, status: "ACTIVE" },
    { id: "d_fatou", firmId: FIRM_ID, memberId: "m_awa", personId: "p_fatou", matricule: "01716-2", relation: "CHILD", rank: 2, coverageStart: "2023-02-01", coverageEnd: null, status: "ACTIVE" },
    { id: "d_cheikh", firmId: FIRM_ID, memberId: "m_awa", personId: "p_cheikh", matricule: "01716-3", relation: "CHILD", rank: 3, coverageStart: "2023-02-01", coverageEnd: null, status: "ACTIVE" },
    { id: "d_khady", firmId: FIRM_ID, memberId: "m_awa", personId: "p_khady", matricule: "01716-4", relation: "ASCENDANT", rank: 4, coverageStart: "2024-06-01", coverageEnd: null, status: "ACTIVE" },
  ]

  const cards: IpmMemberCard[] = [
    { id: "card_awa", firmId: FIRM_ID, memberId: "m_awa", version: 2, generatedAt: "2026-01-15T09:00:00.000Z", revokedAt: null },
  ]

  const p = (id: string, name: string, specialtyId: string, address: string, phone: string | null, accredited = true): IpmProvider => ({
    id, firmId: FIRM_ID, name, specialtyId, address, phone, accredited, status: "ACTIVE",
  })

  const providers: IpmProvider[] = [
    p("prov_guigon", "Pharmacie Guigon", "spec_pharma", "Avenue Lamine Guèye, Dakar Plateau", "338210000"),
    p("prov_mame_diarra", "Pharmacie Mame Diarra", "spec_pharma", "KM 18 Route de Rufisque, Fass Mbao", "338340000"),
    p("prov_keur_massar", "Pharmacie Keur Massar Centre", "spec_pharma", "Keur Massar, Dakar", "338770000"),
    p("prov_liberte6", "Pharmacie Liberté 6", "spec_pharma", "Rond-point Liberté 6, Dakar", "338270000"),
    p("prov_vision_plus", "Optique Vision Plus", "spec_optique", "Point E, Dakar", "338250000"),
    p("prov_optic_sahel", "Optic Sahel", "spec_optique", "Sacré-Cœur 3, Dakar", "338600000"),
    p("prov_masroor", "Hôpital Masroor", "spec_clinique", "Rufisque Ouest", "338360000"),
    p("prov_madeleine", "Clinique de la Madeleine", "spec_clinique", "Avenue des Jambaars, Dakar", "338890000"),
    p("prov_pasteur", "Institut Pasteur de Dakar", "spec_labo", "36 Avenue Pasteur, Dakar", "338399200"),
    p("prov_solabsen", "Solabsen", "spec_labo", "Mermoz, Dakar", "338600100"),
    p("prov_ouakam", "Plateau Médical Ouakam", "spec_generaliste", "Ouakam, Dakar", "338200100"),
    // Live counterparty, not agréé: must never be offered on the portal.
    p("prov_matlaboul", "Cabinet Médical Matlaboul", "spec_generaliste", "Touba", null, false),
  ]

  const agreements: IpmAgreement[] = providers
    .filter((provider) => provider.accredited)
    .map((provider, index) => ({
      id: `agr_${provider.id}`,
      firmId: FIRM_ID,
      providerId: provider.id,
      reference: `CONV-2026-${String(index + 1).padStart(3, "0")}`,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "ACTIVE" as const,
    }))

  /* -- history ---------------------------------------------------------- */

  const sequences: Record<IpmVoucherType, number> = {
    PHARMACY: LEGACY_MAXIMA.PHARMACY + 1,
    OPTICAL: LEGACY_MAXIMA.OPTICAL + 1,
    GUARANTEE: LEGACY_MAXIMA.GUARANTEE + 1,
    HOSPITALIZATION: LEGACY_MAXIMA.HOSPITALIZATION + 1,
  }

  const vouchers: IpmVoucher[] = []
  const voucherLines: IpmVoucherLine[] = []
  const consumptions: IpmConsumption[] = []

  const nameOf = (personId: string) => {
    const person = persons.find((x) => x.id === personId)!
    return `${person.firstName} ${person.lastName}`.toUpperCase()
  }

  type Hist = {
    type: IpmVoucherType
    who: string | null // dependent id, or null for the participant
    providerId: string
    daysAgo: number
    status: IpmVoucher["status"]
    lines: Array<[string, number, number]>
    origin: IpmVoucher["origin"]
    flags?: IpmVoucher["reviewFlags"]
  }

  const history: Hist[] = [
    { type: "PHARMACY", who: null, providerId: "prov_mame_diarra", daysAgo: 84, status: "INVOICED", origin: "BACKOFFICE", lines: [["Amoxicilline 1g (boîte de 14)", 1, 4_850], ["Paracétamol 500mg", 2, 1_200]] },
    { type: "GUARANTEE", who: "d_khady", providerId: "prov_pasteur", daysAgo: 71, status: "INVOICED", origin: "BACKOFFICE", lines: [["Bilan sanguin complet", 1, 38_000], ["Glycémie à jeun", 1, 6_500]] },
    { type: "PHARMACY", who: "d_fatou", providerId: "prov_liberte6", daysAgo: 52, status: "INVOICED", origin: "BACKOFFICE", lines: [["Sirop Hélicidine", 1, 3_900], ["Doliprane enfant 2,4%", 1, 2_150]] },
    { type: "PHARMACY", who: "d_khady", providerId: "prov_guigon", daysAgo: 40, status: "SETTLED", origin: "BACKOFFICE", lines: [["Amlodipine 10mg (30 cp)", 2, 7_400], ["Metformine 850mg (60 cp)", 1, 5_600]] },
    { type: "OPTICAL", who: "d_ibrahima", providerId: "prov_vision_plus", daysAgo: 33, status: "SETTLED", origin: "BACKOFFICE", lines: [["Monture acétate", 1, 45_000], ["Verres progressifs (paire)", 1, 85_000]] },
    { type: "PHARMACY", who: null, providerId: "prov_mame_diarra", daysAgo: 12, status: "PRESENTED", origin: "PORTAL", lines: [["Augmentin 1g (boîte de 16)", 1, 9_800], ["Vitamine C 1000", 1, 3_500], ["Spray nasal", 1, 4_200]] },
    { type: "PHARMACY", who: "d_cheikh", providerId: "prov_keur_massar", daysAgo: 4, status: "ISSUED", origin: "PORTAL", lines: [["Amoxicilline sirop 250mg", 1, 3_450], ["Sérum physiologique (30 doses)", 1, 2_600]] },
    { type: "PHARMACY", who: "d_khady", providerId: "prov_guigon", daysAgo: 2, status: "ISSUED", origin: "PORTAL", flags: ["AMOUNT_UNUSUAL"], lines: [["Insuline glargine (stylo x5)", 1, 48_500], ["Bandelettes glycémie (50)", 1, 14_000]] },
    { type: "GUARANTEE", who: "d_ibrahima", providerId: "prov_madeleine", daysAgo: 1, status: "PENDING_REVIEW", origin: "PORTAL", flags: ["ABOVE_THRESHOLD"], lines: [["Arthroscopie du genou", 1, 380_000], ["Consultation pré-opératoire", 1, 25_000]] },
  ]

  for (const [index, h] of history.entries()) {
    const booking = VOUCHER_TYPE_BOOKING[h.type]
    const rate = planRates.find((r) => r.categoryId === booking.categoryId)!.rate
    const total = h.lines.reduce((sum, [, q, u]) => sum + q * u, 0)
    const s = split(total, rate)
    const dependent = h.who ? dependents.find((d) => d.id === h.who)! : null
    const issueDate = iso(h.daysAgo, 9 + (index % 7), 12 + index * 3)
    const id = `v_seed_${index + 1}`
    const sequence = sequences[h.type]++

    vouchers.push({
      id,
      firmId: FIRM_ID,
      number: formatVoucherNumber(h.type, sequence),
      type: h.type,
      memberId: "m_awa",
      dependentId: dependent?.id ?? null,
      beneficiaryType: dependent ? dependent.relation : "MEMBER",
      beneficiaryName: nameOf(dependent?.personId ?? "p_awa"),
      providerId: h.providerId,
      serviceTypeId: booking.serviceTypeId,
      categoryId: booking.categoryId,
      issueDate,
      expiryDate: expiryFor(h.type, new Date(issueDate)).toISOString(),
      status: h.status,
      totalAmount: s.totalAmount,
      insurerShare: s.insurerShare,
      memberShare: s.memberShare,
      appliedRate: rate,
      rateSource: "PLAN:ALL",
      qrToken: token(),
      issuedById: h.origin === "BACKOFFICE" ? "user_rokhaya" : null,
      settledAt: h.status === "SETTLED" || h.status === "INVOICED" ? iso(h.daysAgo - 3) : null,
      cancelledAt: null,
      cancelReason: null,
      origin: h.origin,
      issuedByPortalAccountId: h.origin === "PORTAL" ? "pa_awa" : null,
      entryMode: h.origin === "PORTAL" ? (index % 2 ? "SCAN" : "MANUAL") : null,
      receiptUrl: h.origin === "PORTAL" ? sampleReceipt(h.providerId, h.lines, issueDate) : null,
      receiptHash: null,
      ocrTotal: null,
      reviewFlags: h.flags ?? [],
      reviewedById: null,
      reviewedAt: null,
      reviewReason: null,
      createdAt: issueDate,
    })

    h.lines.forEach(([label, quantity, unitPrice], lineIndex) => {
      voucherLines.push({
        id: `${id}_l${lineIndex + 1}`,
        firmId: FIRM_ID,
        voucherId: id,
        medicalActId: null,
        label,
        quantity,
        unitPrice,
        amount: quantity * unitPrice,
      })
    })

    const date = new Date(issueDate)
    consumptions.push({
      id: `c_${id}`,
      firmId: FIRM_ID,
      beneficiaryRef: beneficiaryRef("m_awa", dependent?.id ?? null),
      memberId: "m_awa",
      categoryId: booking.categoryId,
      periodYear: date.getFullYear(),
      periodMonth: date.getMonth() + 1,
      voucherId: id,
      amount: s.totalAmount,
      insurerShare: s.insurerShare,
    })
  }

  return {
    firmId: FIRM_ID,
    persons,
    categories,
    serviceTypes,
    specialties,
    plans,
    planRates,
    employerRates: [],
    employers,
    members,
    dependents,
    cards,
    providers,
    agreements,
    vouchers,
    voucherLines,
    consumptions,
    portalAccounts: [
      { id: "pa_awa", firmId: FIRM_ID, memberId: "m_awa", phone: "771234567", status: "ACTIVE", activatedAt: "2026-09-01T10:00:00.000Z", lastLoginAt: null },
    ],
    settings: {
      firmId: FIRM_ID,
      reviewThresholdAmount: 100_000,
      reviewThresholdRatio: 0.5,
      unusualAmountMultiple: 3,
      ocrMismatchTolerance: 0.15,
    },
    // What the server resolves: here only the formule's rows, for every
    // beneficiary type the family has.
    ceilings: (["MEMBER", ...new Set(dependents.map((d) => d.relation))] as const).flatMap((beneficiaryType) =>
      planRates.map(
        (row): ResolvedCeiling => ({
          categoryId: row.categoryId,
          beneficiaryType,
          rate: row.rate,
          ceilingPerAct: row.ceilingPerAct,
          ceilingMonthly: row.ceilingMonthly,
          ceilingAnnual: row.ceilingAnnual,
          waitingPeriodDays: row.waitingPeriodDays,
          source: {
            perAct: row.ceilingPerAct === null ? null : "PLAN",
            monthly: row.ceilingMonthly === null ? null : "PLAN",
            annual: row.ceilingAnnual === null ? null : "PLAN",
          },
        })
      )
    ),
    bookings: (Object.keys(VOUCHER_TYPE_BOOKING) as IpmVoucherType[]).map(
      (type): PortalBooking => ({
        type,
        ...VOUCHER_TYPE_BOOKING[type],
        specialtyIds: VOUCHER_TYPE_SPECIALTIES[type],
      })
    ),
    sequences,
  }
}
