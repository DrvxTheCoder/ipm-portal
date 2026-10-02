import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { seed } from "@/lib/mock-data"
import { bookingFor, draftTotal, eligibleProviders, preview, resolveFor, type DraftInput } from "@/domain/portal/issue"

const db = seed()
const memberId = "m_awa"
const pharmacy = bookingFor(db, "PHARMACY")!

const draft = (patch: Partial<DraftInput> = {}): DraftInput => ({
  type: "PHARMACY",
  dependentId: null,
  providerId: "prov_guigon",
  entryMode: "MANUAL",
  lines: [],
  total: 10_000,
  receiptHash: null,
  ocrTotal: null,
  ...patch,
})

describe("draftTotal — the server's draftLines rule", () => {
  it("uses the priced lines when there are any", () => {
    expect(draftTotal({ lines: [{ label: "Doliprane", quantity: 2, unitPrice: 1_200 }], total: 99_000 })).toBe(2_400)
  })
  it("ignores lines without a label, quantity or price, and falls back to the total", () => {
    const lines = [
      { label: "", quantity: 1, unitPrice: 5_000 },
      { label: "Sirop", quantity: 0, unitPrice: 3_000 },
      { label: "Spray", quantity: 1, unitPrice: 0 },
    ]
    expect(draftTotal({ lines, total: 7_500 })).toBe(7_500)
  })
})

describe("bookings", () => {
  it("offers only the providers whose specialty the booking names", () => {
    const ids = eligibleProviders(db, pharmacy).map((p) => p.id)
    expect(ids).toContain("prov_guigon")
    expect(ids).not.toContain("prov_vision_plus")
  })
  it("treats an empty specialty list as any accredited provider, never a non-accredited one", () => {
    const ids = eligibleProviders(db, { ...pharmacy, specialtyIds: [] }).map((p) => p.id)
    expect(ids).toContain("prov_vision_plus")
    expect(ids).not.toContain("prov_matlaboul")
  })
  it("has no booking for a type the IPM does not offer", () => {
    expect(bookingFor({ ...db, bookings: db.bookings.filter((b) => b.type !== "OPTICAL") }, "OPTICAL")).toBeNull()
  })
})

describe("ceilings", () => {
  it("reads the taux and plafonds the server resolved, never the raw rate rows", () => {
    const raised = {
      ...db,
      ceilings: db.ceilings.map((c) =>
        c.categoryId === pharmacy.categoryId && c.beneficiaryType === "MEMBER"
          ? { ...c, ceilingMonthly: 350_000, source: { ...c.source, monthly: "MEMBER" as const } }
          : c
      ),
    }
    expect(resolveFor(raised, pharmacy.categoryId, "MEMBER")).toMatchObject({ rate: 0.8, ceilingMonthly: 350_000 })
  })
  it("treats a category absent for a beneficiary type as not covered", () => {
    const without = { ...db, ceilings: db.ceilings.filter((c) => c.beneficiaryType !== "ASCENDANT") }
    expect(resolveFor(without, pharmacy.categoryId, "ASCENDANT")).toBeNull()
  })
  it("refuses a bon in a category the family is not covered for", () => {
    const uncovered = { ...db, ceilings: db.ceilings.filter((c) => c.categoryId !== pharmacy.categoryId) }
    expect(preview(uncovered, memberId, pharmacy, draft()).decision.allowed).toBe(false)
  })
  it("holds against a plafond particulier the formule would not have", () => {
    const raised = { ...db, ceilings: db.ceilings.map((c) => (c.categoryId === pharmacy.categoryId ? { ...c, ceilingMonthly: 350_000 } : c)) }
    expect(preview(db, memberId, pharmacy, draft({ total: 300_000 })).decision.allowed).toBe(false)
    expect(preview(raised, memberId, pharmacy, draft({ total: 300_000 })).decision.allowed).toBe(true)
  })
})

describe("preview", () => {
  it("issues a small pharmacy bon without holding it", () => {
    const result = preview(db, memberId, pharmacy, draft())
    expect(result.decision.allowed).toBe(true)
    expect(result.review).toMatchObject({ hold: false })
  })
  it("holds a bon above the review threshold", () => {
    const result = preview(db, memberId, pharmacy, draft({ total: 150_000 }))
    expect(result.review?.hold).toBe(true)
    expect(result.review?.flags).toContain("ABOVE_THRESHOLD")
  })
  it("holds any bon with an issuance warning, flagged ISSUANCE_WARNING", () => {
    const lapsed = { ...db, agreements: db.agreements.map((a) => (a.providerId === "prov_guigon" ? { ...a, status: "EXPIRED" as const } : a)) }
    const result = preview(lapsed, memberId, pharmacy, draft())
    expect(result.decision.allowed).toBe(true)
    expect(result.decision.warnings.map((w) => w.code)).toContain("AGREEMENT_EXPIRED")
    expect(result.review).toMatchObject({ hold: true })
    expect(result.review?.flags[0]).toBe("ISSUANCE_WARNING")
  })
})

describe("runtime", () => {
  it("never imports the mock database outside the tests", () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(name) && !path.endsWith(join("lib", "mock-data.ts")) && /@\/lib\/mock-data/.test(readFileSync(path, "utf8"))) offenders.push(path)
      }
    }
    walk(join(__dirname, "..", "src"))
    expect(offenders).toEqual([])
  })
})
