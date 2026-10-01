import { describe, expect, it } from "vitest"
import { parseReceiptText } from "@/domain/portal/receipt-parse"

describe("parseReceiptText", () => {
  it("reads total and lines from a typical pharmacy ticket", () => {
    const text = `PHARMACIE MAME DIARRA
KM 18 Route de Rufisque
Tel : 33 834 00 00
Date : 28/09/2026 10:42
Augmentin 1g boite 16      9 800
2 x Paracetamol 500mg      2.400
Spray nasal                4 200
----------------------------
TOTAL TTC                 16 400 F
Especes                   20 000
Rendu                      3 600`
    const r = parseReceiptText(text)
    expect(r.total).toBe(16400)
    expect(r.confidence).toBeGreaterThan(0.9)
    expect(r.lines).toHaveLength(3)
    expect(r.lines[1]).toEqual({ label: "Paracetamol 500mg", quantity: 2, unitPrice: 1200 })
    expect(r.date).toBe("2026-09-28")
    expect(r.header).toBe("PHARMACIE MAME DIARRA")
  })

  it("finds the total on the line after the keyword", () => {
    const r = parseReceiptText("Clinique X\nNET A PAYER\n405.000 FCFA")
    expect(r.total).toBe(405000)
  })

  it("ignores phone numbers and falls back to the largest amount", () => {
    const r = parseReceiptText("Pharmacie\n77 123 45 67\nmedicament 3 450\nautre 2 600\n")
    expect(r.total).toBe(6050)
    expect(r.confidence).toBe(0.5)
  })

  it("fixes O read for 0 inside numbers", () => {
    expect(parseReceiptText("TOTAL 12 5O0").total).toBe(12500)
  })

  it("returns null when nothing looks like an amount", () => {
    expect(parseReceiptText("illisible").total).toBeNull()
  })

  it("rejects OCR text from a photo that is not a receipt", () => {
    // What Tesseract reads off a stew pot: brand, kitchen words, stray numbers.
    const stewPot = `Marmite INOX
278
Cuisson 24 cm
capacite 5 L
1728
induction gaz`
    expect(parseReceiptText(stewPot)).toEqual({ total: null, confidence: 0, lines: [], date: null, header: null })
  })

  it("rejects a single priced-looking line with no receipt structure", () => {
    expect(parseReceiptText("Cocotte en fonte 1 728\n24 cm").confidence).toBe(0)
  })

  it("caps confidence when there is neither a header nor a total keyword", () => {
    const r = parseReceiptText("Doliprane 1 200\nVitamine C 2 500")
    expect(r.total).toBe(3700)
    expect(r.header).toBeNull()
    expect(r.confidence).toBeLessThanOrEqual(0.3)
  })

  // Tesseract (fra) output from a real photo, specks and garbled header included.
  const thiaroye = `LV CR EE
se   CE
500
PE POZ         CO AT PI ÿ
DR TOUTY DIACK DIA
KM 11 ROUTE DE RUFISQUE
THIAROYE SUR MER
BP: 20415  THIAROYE
TEL: +221 33 834 56 86
NINEA: 2841684202
RECU : 26/0202332 - RN /_BN
DATE : 28 SEP 2026 - 12:56
1 FÜCLO 500MG GEL B/24         3.843
TOTAL (5,81 EU)                 3.843      Fe
1 ARTICLE(S) RECU(S)                        %
FLAN PAUL ISMATLA
Matr. 26344
(Co004 - TPM DIPROM)
ds        MERCI DE VOTRE VISITE`

  it("reads a real single-item pharmacy ticket despite specks after the total", () => {
    const r = parseReceiptText(thiaroye)
    expect(r.total).toBe(3843)
    expect(r.confidence).toBeGreaterThan(0.9)
    expect(r.lines).toEqual([{ label: "1 FÜCLO 500MG GEL B/24", quantity: 1, unitPrice: 3843 }])
    expect(r.date).toBe("2026-09-28")
  })

  it("still reads a single-item ticket when OCR loses the TOTAL keyword", () => {
    const r = parseReceiptText(thiaroye.replace("TOTAL (5,81 EU)", "IOIAI (5,81 EU)"))
    expect(r.total).toBe(3843)
  })

  it("reads a bon de caisse", () => {
    const r = parseReceiptText(`BDC20260928-015         28/09/2026
Demandeur :           Papa Djibril Ndiaye
Matricule:                    26301
Articles/Objet                                        Montant XOF
02 PNEUS                    2000
Total XOF:              2000
Imprimé le 01/10/2026 09:07:27`)
    expect(r.total).toBe(2000)
  })
})
