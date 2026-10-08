import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  cancellable,
  effectiveStatus,
  matchesStatusFilter,
  notificationView,
  STATUS_META,
  statusMeta,
} from "@/components/portal/meta"
import { groupedCode, parseBonCode } from "@/domain/portal/bon-code"
import {
  attemptFor,
  canGoForward,
  counterMessage,
  guardRedirect,
  isMonthKey,
  kpiView,
  lookupBlocker,
  monthOf,
  monthTitle,
  shiftMonth,
} from "@/domain/prestataire/pharmacy"
import { randomId } from "@/lib/random-id"
import { viaApi } from "@/lib/api"
import type { IpmVoucher, IpmVoucherStatus, PortalNotification } from "@/lib/schema"

const NOW = new Date("2026-10-08T12:00:00Z")
const TOMORROW = "2026-10-09T12:00:00Z"
const YESTERDAY = "2026-10-07T12:00:00Z"

const bon = (status: IpmVoucherStatus, patch: Partial<IpmVoucher> = {}) => ({
  status,
  expiryDate: TOMORROW,
  deferredAmount: true,
  ...patch,
})

describe("status of a bon de pharmacie", () => {
  it("reads 'En attente de montant' while the pharmacy has not priced it", () => {
    expect(statusMeta(bon("AWAITING_AMOUNT"), NOW).label).toBe("En attente de montant")
  })
  it("reads EXPIRED past its deadline, before the server's job has written it", () => {
    expect(effectiveStatus(bon("AWAITING_AMOUNT", { expiryDate: YESTERDAY }), NOW)).toBe("EXPIRED")
    expect(statusMeta(bon("AWAITING_AMOUNT", { expiryDate: YESTERDAY }), NOW).label).toBe("Expiré")
  })
  it("calls a validated pharmacy bon 'Validé', and keeps 'Réglé' for a receipt bon", () => {
    expect(statusMeta(bon("SETTLED"), NOW).label).toBe("Validé")
    expect(statusMeta(bon("SETTLED", { deferredAmount: false }), NOW).label).toBe(STATUS_META.SETTLED.label)
  })
  it("may be cancelled only while it awaits its amount, and not once expired", () => {
    expect(cancellable(bon("AWAITING_AMOUNT"), NOW)).toBe(true)
    expect(cancellable(bon("AWAITING_AMOUNT", { expiryDate: YESTERDAY }), NOW)).toBe(false)
    expect(cancellable(bon("SETTLED"), NOW)).toBe(false)
    expect(cancellable(bon("ISSUED", { deferredAmount: false }), NOW)).toBe(true)
  })
  it("has its own filter, and counts among the bons to use", () => {
    expect(matchesStatusFilter(bon("AWAITING_AMOUNT"), "awaiting", NOW)).toBe(true)
    expect(matchesStatusFilter(bon("AWAITING_AMOUNT"), "active", NOW)).toBe(true)
    expect(matchesStatusFilter(bon("ISSUED"), "awaiting", NOW)).toBe(false)
    expect(matchesStatusFilter(bon("AWAITING_AMOUNT", { expiryDate: YESTERDAY }), "closed", NOW)).toBe(true)
    expect(matchesStatusFilter(bon("AWAITING_AMOUNT"), "all", NOW)).toBe(true)
  })
})

describe("notifications", () => {
  const notice = (kind: PortalNotification["kind"]): PortalNotification => ({
    id: "n",
    kind,
    createdAt: NOW.toISOString(),
    readAt: null,
    voucher: { id: "v", number: "PH-1", status: "SETTLED", reviewReason: "Doublon" },
  })
  it("says a pharmacy validation and an IPM adjustment are good news, a void is not", () => {
    expect(notificationView(notice("VOUCHER_VALIDATED"))).toMatchObject({ tone: "good", title: expect.stringContaining("pharmacie") })
    expect(notificationView(notice("VOUCHER_ADJUSTED"))).toMatchObject({ tone: "good", title: expect.stringContaining("ajusté") })
    expect(notificationView(notice("VOUCHER_VOIDED"))).toMatchObject({ tone: "bad", detail: "Doublon" })
    expect(notificationView(notice("VOUCHER_REJECTED")).tone).toBe("bad")
  })
})

describe("the code behind the QR", () => {
  const token = "BP.Ab3dEf_hIjKlMnOp-rStUvWx"
  it("groups it by four for a pharmacist to type", () => {
    expect(groupedCode(token)).toBe("BP.Ab3d Ef_h IjKl MnOp -rSt UvWx")
  })
  it("reads it back whatever the spacing or the prefix's case", () => {
    expect(parseBonCode(token)).toBe(token)
    expect(parseBonCode(groupedCode(token))).toBe(token)
    expect(parseBonCode(`  bp.${token.slice(3)} `)).toBe(token)
  })
  it("reads it out of a verification URL", () => {
    expect(parseBonCode(`https://app.example/v/${token}`)).toBe(token)
    expect(parseBonCode("https://example.com/elsewhere")).toBeNull()
  })
  it("refuses what cannot be a token", () => {
    expect(parseBonCode("")).toBeNull()
    expect(parseBonCode("BP.abc")).toBeNull()
    expect(parseBonCode("BP.<script>alert(1)</script>")).toBeNull()
  })
})

describe("months and the KPI card", () => {
  it("keys months as the server does, in UTC", () => {
    expect(monthOf(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10")
    expect(isMonthKey("2026-10")).toBe(true)
    expect(isMonthKey("2026-13")).toBe(false)
    expect(isMonthKey(null)).toBe(false)
  })
  it("steps across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12")
    expect(shiftMonth("2025-12", 1)).toBe("2026-01")
  })
  it("never goes past the current month", () => {
    expect(canGoForward("2026-10", NOW)).toBe(false)
    expect(canGoForward("2026-09", NOW)).toBe(true)
  })
  it("names the month in French", () => {
    expect(monthTitle("2026-10")).toBe("octobre 2026")
  })
  it("defaults to 'ce mois', shows the total in FCFA and counts the bons", () => {
    expect(kpiView({ month: "2026-10", totalAmount: 60_448, count: 3 }, NOW)).toEqual({
      title: "Total consommé ce mois",
      total: "60 448 F",
      count: "3 bons validés",
    })
    expect(kpiView({ month: "2026-09", totalAmount: 0, count: 0 }, NOW)).toEqual({
      title: "Total consommé en septembre 2026",
      total: "0 F",
      count: "Aucun bon validé",
    })
    expect(kpiView({ month: "2026-10", totalAmount: 5_000, count: 1 }, NOW).count).toBe("1 bon validé")
  })
})

describe("ordonnance links", () => {
  it("go through the portal's own /api/portail, whatever origin multiapp wrote", () => {
    expect(viaApi("https://multiapp.example/api/portail/prescriptions/v1?exp=1&sig=a_b")).toBe("/api/portail/prescriptions/v1?exp=1&sig=a_b")
    expect(viaApi("https://files.example/other.jpg")).toBe("https://files.example/other.jpg")
    expect(viaApi(null)).toBeNull()
  })
})

describe("idempotency keys", () => {
  it("fit the server's pattern without crypto.randomUUID (absent over plain http)", () => {
    const original = crypto.randomUUID
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true })
    try {
      const id = randomId()
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
      expect(randomId()).not.toBe(id)
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true })
    }
  })
})

describe("validation attempts", () => {
  let n = 0
  const key = () => `key-${++n}-padding`
  it("reuses the key when the same bon and amount are retried", () => {
    const first = attemptFor(null, "v1", 12_500, key)
    expect(attemptFor(first, "v1", 12_500, key)).toBe(first)
  })
  it("takes a new key for another amount or another bon", () => {
    const first = attemptFor(null, "v1", 12_500, key)
    expect(attemptFor(first, "v1", 13_000, key).key).not.toBe(first.key)
    expect(attemptFor(first, "v2", 12_500, key).key).not.toBe(first.key)
  })
})

describe("what the counter is told", () => {
  it("has its own words for every contract error", () => {
    for (const code of ["ALREADY_VALIDATED", "EXPIRED", "WRONG_PROVIDER", "INVALID_AMOUNT"]) {
      expect(counterMessage(code, "server").detail).not.toBe("server")
    }
    expect(counterMessage("SOMETHING_NEW", "Message du serveur").detail).toBe("Message du serveur")
  })
  it("lets only a bon awaiting its amount through the lookup", () => {
    expect(lookupBlocker("AWAITING_AMOUNT")).toBeNull()
    expect(lookupBlocker("EXPIRED")?.title).toBe("Bon expiré")
    expect(lookupBlocker("SETTLED")?.title).toBe("Bon déjà validé")
    expect(lookupBlocker("CANCELLED")?.title).toBe("Bon annulé")
  })
})

describe("the pharmacy's routes", () => {
  it("sends a signed-out visitor to the login, and only there", () => {
    expect(guardRedirect(null, "/prestataire")).toBe("/prestataire/connexion")
    expect(guardRedirect(null, "/prestataire/scanner")).toBe("/prestataire/connexion")
    expect(guardRedirect(null, "/prestataire/connexion")).toBeNull()
  })
  it("allows nothing but the change of a temporary password", () => {
    const pending = { mustChangePassword: true }
    expect(guardRedirect(pending, "/prestataire")).toBe("/prestataire/mot-de-passe")
    expect(guardRedirect(pending, "/prestataire/scanner")).toBe("/prestataire/mot-de-passe")
    expect(guardRedirect(pending, "/prestataire/mot-de-passe")).toBeNull()
  })
  it("keeps a signed-in pharmacy off the login and password screens", () => {
    const signedIn = { mustChangePassword: false }
    expect(guardRedirect(signedIn, "/prestataire/connexion")).toBe("/prestataire")
    expect(guardRedirect(signedIn, "/prestataire/mot-de-passe")).toBe("/prestataire")
    expect(guardRedirect(signedIn, "/prestataire/bons/v1")).toBeNull()
  })
})

describe("contract", () => {
  // multiapp owns the contract; this copy must match it exactly. Runs when
  // both repositories sit side by side, as in development.
  const upstream = join(__dirname, "..", "..", "..", "senexus-multiapp", "src", "server", "portal", "contract.ts")
  it.skipIf(!existsSync(upstream))("is identical to multiapp's src/server/portal/contract.ts", () => {
    const normalise = (text: string) => text.replace(/\r\n/g, "\n")
    const local = readFileSync(join(__dirname, "..", "src", "lib", "schema.ts"), "utf8")
    expect(normalise(local)).toBe(normalise(readFileSync(upstream, "utf8")))
  })
})
