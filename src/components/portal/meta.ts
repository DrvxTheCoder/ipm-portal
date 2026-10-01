import {
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  GlassesIcon,
  Hospital01Icon,
  HospitalBed01Icon,
  Invoice01Icon,
  Medicine02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import type { IpmVoucherStatus, IpmVoucherType } from "@/lib/schema"

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
  PENDING_REVIEW: { label: "En attente", tone: "amber", icon: Clock01Icon, explain: "L'IPM vérifie ce bon. Vous serez prévenu dès qu'il est validé." },
  ISSUED: { label: "Prêt", tone: "mint", icon: CheckmarkCircle02Icon, explain: "Présentez ce bon au prestataire, sur votre téléphone ou imprimé." },
  PRESENTED: { label: "Utilisé", tone: "teal", icon: Tick02Icon, explain: "Le prestataire a reçu ce bon." },
  SETTLED: { label: "Réglé", tone: "neutral", icon: Tick02Icon, explain: "L'IPM a réglé sa part au prestataire." },
  INVOICED: { label: "Facturé", tone: "neutral", icon: Invoice01Icon, explain: "Ce bon figure sur la facture de votre employeur." },
  CANCELLED: { label: "Annulé", tone: "neutral", icon: Cancel01Icon, explain: "Ce bon a été annulé et ne peut plus être utilisé." },
  EXPIRED: { label: "Expiré", tone: "neutral", icon: Clock01Icon, explain: "La date de validité de ce bon est passée." },
  REJECTED: { label: "Refusé", tone: "red", icon: Alert02Icon, explain: "L'IPM n'a pas validé ce bon." },
}
