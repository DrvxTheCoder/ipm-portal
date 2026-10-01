import { describe, expect, it } from "vitest"
import { decideReview } from "@/domain/portal/review"

const settings = { firmId: "f", reviewThresholdAmount: 100_000, reviewThresholdRatio: 0.5, unusualAmountMultiple: 3, ocrMismatchTolerance: 0.15 }
const base = { ceilingMonthly: 200_000, settings, previousTotals: [], sameDayDuplicate: false, receiptHash: null, previousReceiptHashes: [], ocrTotal: null }

describe("decideReview", () => {
  it("issues below the threshold", () => {
    expect(decideReview({ ...base, totalAmount: 60_000 })).toMatchObject({ hold: false, flags: [] })
  })
  it("holds above the lower of amount and ratio", () => {
    const d = decideReview({ ...base, ceilingMonthly: 120_000, totalAmount: 70_000 })
    expect(d.threshold).toBe(60_000)
    expect(d.hold).toBe(true)
  })
  it("flags an unusual amount, a reused receipt and an OCR gap", () => {
    const d = decideReview({ ...base, totalAmount: 50_000, previousTotals: [8_000, 10_000, 12_000], receiptHash: "ffff0000ffff0000", previousReceiptHashes: ["ffff0000ffff0001"], ocrTotal: 30_000 })
    expect(d.flags).toEqual(["AMOUNT_UNUSUAL", "RECEIPT_REUSED", "OCR_MISMATCH"])
    expect(d.hold).toBe(false)
  })
})
