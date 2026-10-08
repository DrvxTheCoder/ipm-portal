import {
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  HourglassIcon,
  GlassesIcon,
  Hospital01Icon,
  HospitalBed01Icon,
  Invoice01Icon,
  Medicine02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import type { IpmVoucher, IpmVoucherStatus, IpmVoucherType, PortalNotification } from "@/lib/schema"

type Icon = typeof Medicine02Icon

/** Words a participant uses — not the referentiel's. */
export const VOUCHER_TYPE_META: Record<
  IpmVoucherType,
  { label: string; short: string; hint: string; icon: Icon }
> = {
  PHARMACY: { label: "Bon de pharmacie", short: "Pharmacie", hint: "Médicaments sur ordonnance", icon: Medicine02Icon },
  OPTICAL: { label: "Bon d'optique", short: "Optique", hint: "Lunettes, verres, montures", icon: GlassesIcon },
  GUARANTEE: { label: "Lettre de garantie", short: "Soins & analyses", hint: "Clinique, laboratoire, médecin", icon: Hospital01Icon },
  HOSPITALIZATION: { label: "Lettre d'hospitalisation", short: "Hospitalisation", hint: "Séjour à l'hôpital", icon: HospitalBed01Icon },
}

export type Tone = "mint" | "teal" | "amber" | "red" | "neutral"

export const STATUS_META: Record<
  IpmVoucherStatus,
  { label: string; tone: Tone; icon: Icon; explain: string }
> = {
  AWAITING_AMOUNT: { label: "En attente de montant", tone: "amber", icon: HourglassIcon, explain: "Présentez ce bon et votre ordonnance à la pharmacie. Elle saisira le montant." },
  PENDING_REVIEW: { label: "En attente", tone: "amber", icon: Clock01Icon, explain: "L'IPM vérifie ce bon. Vous serez prévenu dès qu'il est validé." },
  ISSUED: { label: "Prêt", tone: "mint", icon: CheckmarkCircle02Icon, explain: "Présentez ce bon au prestataire, sur votre téléphone ou imprimé." },
  PRESENTED: { label: "Utilisé", tone: "teal", icon: Tick02Icon, explain: "Le prestataire a reçu ce bon." },
  SETTLED: { label: "Réglé", tone: "neutral", icon: Tick02Icon, explain: "L'IPM a réglé sa part au prestataire." },
  INVOICED: { label: "Facturé", tone: "neutral", icon: Invoice01Icon, explain: "Ce bon figure sur la facture de votre employeur." },
  CANCELLED: { label: "Annulé", tone: "neutral", icon: Cancel01Icon, explain: "Ce bon a été annulé et ne peut plus être utilisé." },
  EXPIRED: { label: "Expiré", tone: "neutral", icon: Clock01Icon, explain: "La date de validité de ce bon est passée." },
  REJECTED: { label: "Refusé", tone: "red", icon: Alert02Icon, explain: "L'IPM n'a pas validé ce bon." },
}

type StatusMeta = (typeof STATUS_META)[IpmVoucherStatus]

/**
 * What a bon de pharmacie à montant différé says at each stage. Its `SETTLED`
 * is the pharmacy's validation, not a payment, and its `EXPIRED` means nobody
 * validated it in time.
 */
const DEFERRED_STATUS: Partial<Record<IpmVoucherStatus, Partial<StatusMeta>>> = {
  SETTLED: { label: "Validé", tone: "teal", explain: "La pharmacie a validé le montant." },
  EXPIRED: { explain: "La pharmacie n'a pas validé ce bon à temps. Créez-en un nouveau si besoin." },
  CANCELLED: { explain: "Ce bon a été annulé : la pharmacie ne peut plus le valider." },
}

/**
 * The status to show. A bon still waiting for its amount past its deadline
 * reads EXPIRED even before the server's expiry job has written it — the
 * server's own rule (`effectiveStatus`).
 */
export function effectiveStatus(voucher: Pick<IpmVoucher, "status" | "expiryDate">, now = new Date()): IpmVoucherStatus {
  return voucher.status === "AWAITING_AMOUNT" && new Date(voucher.expiryDate) < now ? "EXPIRED" : voucher.status
}

export function statusMeta(
  voucher: Pick<IpmVoucher, "status" | "expiryDate" | "deferredAmount">,
  now = new Date()
): StatusMeta {
  const status = effectiveStatus(voucher, now)
  const base = STATUS_META[status]
  return voucher.deferredAmount ? { ...base, ...DEFERRED_STATUS[status] } : base
}

/** A bon whose amount is not known yet: no figure, no split to show. */
export function awaitsAmount(voucher: Pick<IpmVoucher, "totalAmount">): boolean {
  return voucher.totalAmount === null
}

/** What a participant may still withdraw: anything nobody has acted on. Same rule as the server. */
export function cancellable(voucher: Pick<IpmVoucher, "status" | "expiryDate">, now = new Date()): boolean {
  return ["ISSUED", "PENDING_REVIEW", "AWAITING_AMOUNT"].includes(effectiveStatus(voucher, now))
}

export const STATUS_FILTERS: Array<{ key: string; label: string; statuses: IpmVoucherStatus[] | null }> = [
  { key: "all", label: "Tous", statuses: null },
  { key: "active", label: "À utiliser", statuses: ["ISSUED", "PENDING_REVIEW", "AWAITING_AMOUNT"] },
  { key: "awaiting", label: "En attente de montant", statuses: ["AWAITING_AMOUNT"] },
  { key: "done", label: "Utilisés", statuses: ["PRESENTED", "SETTLED", "INVOICED"] },
  { key: "closed", label: "Annulés", statuses: ["CANCELLED", "EXPIRED", "REJECTED"] },
]

export function matchesStatusFilter(
  voucher: Pick<IpmVoucher, "status" | "expiryDate">,
  key: string,
  now = new Date()
): boolean {
  const statuses = STATUS_FILTERS.find((f) => f.key === key)?.statuses ?? null
  return statuses === null || statuses.includes(effectiveStatus(voucher, now))
}

export type NotificationView = { tone: "good" | "bad"; title: string; detail: string | null }

export function notificationView(n: PortalNotification): NotificationView {
  const number = n.voucher.number
  switch (n.kind) {
    case "VOUCHER_APPROVED":
      return { tone: "good", title: `Bon ${number} validé, prêt à utiliser`, detail: null }
    case "VOUCHER_VALIDATED":
      return { tone: "good", title: `Bon ${number} : montant validé par la pharmacie`, detail: null }
    case "VOUCHER_ADJUSTED":
      return { tone: "good", title: `Bon ${number} : montant ajusté par l'IPM`, detail: null }
    case "VOUCHER_VOIDED":
      return { tone: "bad", title: `Bon ${number} annulé par l'IPM`, detail: n.voucher.reviewReason }
    case "VOUCHER_REJECTED":
      return { tone: "bad", title: `Bon ${number} refusé`, detail: n.voucher.reviewReason }
  }
}
