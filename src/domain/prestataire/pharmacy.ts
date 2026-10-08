import { randomId } from "@/lib/random-id"
import { francs } from "@/lib/format"

/**
 * The pharmacy's screens, as plain functions: which month, what the KPI card
 * says, what an error means at the counter, and when a validation is the same
 * attempt (same idempotency key) or a new one.
 */

/* ------------------------------------------------------------------------ */
/* Months — `YYYY-MM`, UTC like the server (Dakar is UTC+0 all year)        */

export function monthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

export function isMonthKey(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number)
  return monthOf(new Date(Date.UTC(year, month - 1 + delta, 1)))
}

/** "octobre 2026". */
export function monthTitle(key: string): string {
  const [year, month] = key.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** No month after the current one: nothing can have been validated there yet. */
export function canGoForward(key: string, now = new Date()): boolean {
  return key < monthOf(now)
}

/* ------------------------------------------------------------------------ */
/* KPI                                                                      */

export type KpiView = { total: string; count: string; title: string }

export function kpiView(kpi: { month: string; totalAmount: number; count: number }, now = new Date()): KpiView {
  return {
    title: kpi.month === monthOf(now) ? "Total consommé ce mois" : `Total consommé en ${monthTitle(kpi.month)}`,
    total: francs(kpi.totalAmount),
    count: kpi.count === 0 ? "Aucun bon validé" : kpi.count === 1 ? "1 bon validé" : `${kpi.count} bons validés`,
  }
}

/* ------------------------------------------------------------------------ */
/* Errors, as the pharmacist reads them                                     */

export type CounterMessage = { title: string; detail: string }

const COUNTER_MESSAGES: Record<string, CounterMessage> = {
  ALREADY_VALIDATED: {
    title: "Bon déjà validé",
    detail: "Ce bon a déjà reçu son montant. S'il vient d'être validé depuis ce poste, il figure dans la liste du mois.",
  },
  EXPIRED: {
    title: "Bon expiré",
    detail: "Le délai de validation est dépassé. Le patient doit demander un nouveau bon ou contacter l'IPM.",
  },
  WRONG_PROVIDER: {
    title: "Bon d'une autre pharmacie",
    detail: "Ce bon est adressé à un autre établissement : vous ne pouvez pas le valider.",
  },
  INVALID_AMOUNT: {
    title: "Montant invalide",
    detail: "Saisissez un montant en francs entiers, supérieur à zéro.",
  },
  CANCELLED: {
    title: "Bon annulé",
    detail: "Ce bon a été annulé : il ne peut plus être validé.",
  },
  NOT_FOUND: {
    title: "Bon introuvable",
    detail: "Aucun bon en attente ne correspond à ce code. Vérifiez le code ou scannez à nouveau.",
  },
  NOT_DEFERRED: {
    title: "Bon non concerné",
    detail: "Ce bon n'est pas un bon de pharmacie en attente de montant.",
  },
}

/**
 * A counter-side sentence for a refusal. Codes the screen knows get their own
 * words; anything else keeps the server's message, which is already French.
 */
export function counterMessage(code: string, fallback: string): CounterMessage {
  return COUNTER_MESSAGES[code] ?? { title: "Opération impossible", detail: fallback }
}

/** The lookup's status, for a bon the pharmacy cannot validate any more. */
export function lookupBlocker(status: string): CounterMessage | null {
  if (status === "AWAITING_AMOUNT") return null
  if (status === "EXPIRED") return COUNTER_MESSAGES.EXPIRED
  if (status === "CANCELLED" || status === "REJECTED") return COUNTER_MESSAGES.CANCELLED
  return COUNTER_MESSAGES.ALREADY_VALIDATED
}

/* ------------------------------------------------------------------------ */
/* Idempotency                                                              */

export type Attempt = { voucherId: string; amount: number; key: string }

/**
 * The key for validating `amount` on `voucherId`. A retry of the same attempt
 * — same bon, same amount, typically after the network dropped — reuses the
 * key, so the server answers `replayed` instead of validating twice. Any other
 * amount, or another bon, is a new attempt with a new key.
 */
export function attemptFor(previous: Attempt | null, voucherId: string, amount: number, newKey: () => string): Attempt {
  if (previous && previous.voucherId === voucherId && previous.amount === amount) return previous
  return { voucherId, amount, key: newKey() }
}

/** 8–64 of `[A-Za-z0-9_-]`, what the server accepts. */
export function newIdempotencyKey(): string {
  return randomId()
}

/* ------------------------------------------------------------------------ */
/* Where a pharmacy may be                                                  */

export const PRESTATAIRE_LOGIN = "/prestataire/connexion"
export const PRESTATAIRE_PASSWORD = "/prestataire/mot-de-passe"

/**
 * Where to send the pharmacy instead of `pathname`, or null to stay. Signed
 * out: the login only. A temporary password: the change-password screen
 * only, before anything else. Signed in: never back to either.
 */
export function guardRedirect(
  session: { mustChangePassword: boolean } | null,
  pathname: string
): string | null {
  if (!session) return pathname === PRESTATAIRE_LOGIN ? null : PRESTATAIRE_LOGIN
  if (session.mustChangePassword) return pathname === PRESTATAIRE_PASSWORD ? null : PRESTATAIRE_PASSWORD
  if (pathname === PRESTATAIRE_LOGIN || pathname === PRESTATAIRE_PASSWORD) return "/prestataire"
  return null
}
