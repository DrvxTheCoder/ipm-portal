/**
 * Lecture d'un reçu — from raw OCR text to a total and, when possible, lines.
 *
 * Built for what Dakar pharmacy and clinic tickets actually print: amounts in
 * FCFA with no decimals, grouped with a space, a dot or a comma ("12 500",
 * "12.500", "12,500"), the total behind one of a handful of words ("TOTAL",
 * "NET A PAYER", "MONTANT TTC"…), and lines that end with their amount.
 *
 * The parser never decides on its own: it proposes a total with a confidence,
 * and the participant confirms it. Its job is to save typing, not to be trusted.
 */

export type ParsedLine = { label: string; quantity: number; unitPrice: number }

export type ParsedReceipt = {
  total: number | null
  /** 0–1. "high" ≥ 0.75: the total sat behind a total keyword. */
  confidence: number
  lines: ParsedLine[]
  date: string | null
  /** First meaningful line — usually the provider's name. */
  header: string | null
}

const TOTAL_KEYWORDS = [
  /net\s*[aà]\s*payer/i,
  // OCR often reads TOTAL as T0TAL or TOTAI.
  /t[o0]ta[l1i|]\s*(ttc|g[ée]n[ée]ral|[aà]\s*payer)?/i,
  /montant\s*(ttc|total|d[uû]|[aà]\s*payer)?/i,
  /[aà]\s*payer/i,
  /somme/i,
]

const NOISE = [
  /t[ée]l|tel\b|fax|ninea|rccm|tva|n[°o]\s*fact|facture\s*n|ticket\s*n|caisse|op[ée]rateur|merci|rendu|esp[eè]ces|monnaie|re[çc]u\s*:|\bmatr(\.|icule|\b)|\bbp\s*:/i,
]

/**
 * Words only a ticket prints: the kind of provider, its legal ids, the
 * cashier's sign-off. A stew pot or a cat never shows them.
 */
const RECEIPT_CONTEXT =
  /pharmacie|clinique|cabinet|laboratoire|optique|h[oô]pital|ninea|rccm|re[çc]u|facture|ticket|caisse|article|merci|fcfa|xof|\bbp\s*:|t[ée]l\s*:/i

/**
 * Amounts that end a line, with their grouping. Requires either a currency
 * mark or a grouping/size that makes it a price rather than a quantity.
 */
const AMOUNT = /(\d{1,3}(?:[ .,\u00a0\u202f]\d{3})+|\d{3,7})(?:[.,]0{1,2})?\s*(?:f\s*cfa|fcfa|cfa|f|xof)?\s*$/i

export function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[ .,\u00a0\u202f]/g, "")
  if (!/^\d+$/.test(cleaned)) return null
  const value = Number.parseInt(cleaned, 10)
  return Number.isFinite(value) ? value : null
}

/** OCR reads O for 0 and l/I for 1 inside numbers; fix only inside digit runs. */
function normalise(line: string): string {
  return line
    .replace(/(?<=\d)[oO](?=\d|\b)/g, "0")
    .replace(/(?<=\d)[lI|](?=\d)/g, "1")
    .replace(/[“”«»]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    // Specks after a printed price read as "Fe", "%", "|": drop up to two short
    // non-digit tokens after a grouped amount ("3.843 Fe" → "3.843").
    .replace(/(\d{1,3}(?:[ .,]\d{3})+)(?: [^\d\s]{1,3}){1,2}$/, "$1")
}

function amountAtEnd(line: string): number | null {
  const match = AMOUNT.exec(line)
  if (!match) return null
  const value = toNumber(match[1])
  // FCFA tickets: below 100 F is a quantity or a code, above 10M a phone.
  if (value === null || value < 100 || value > 10_000_000) return null
  return value
}

function looksLikePhone(line: string): boolean {
  return /(\+?221)?\s?(7[05678]|3[3])\s?\d{3}\s?\d{2}\s?\d{2}/.test(line)
}

const DATE = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/
const MONTHS = ["jan", "fev", "mar", "avr", "mai", "juin", "juil", "aou", "sep", "oct", "nov", "dec"]
/** "28 SEP 2026", "3 juil. 2026" */
const MONTH_DATE = /\b(\d{1,2})\s+(jan|f[eé]v|mar|avr|mai|juin|juil|ao[uû]|sep|oct|nov|d[eé]c)[a-zéû]*\.?\s+(\d{4})\b/i

const EMPTY_RECEIPT: ParsedReceipt = { total: null, confidence: 0, lines: [], date: null, header: null }

function hasTotalKeyword(line: string): boolean {
  return TOTAL_KEYWORDS.some((k) => k.test(line)) && !/sous[\s-]*total/i.test(line)
}

/** A label with letters that ends in an amount — what a ticket line looks like. */
function looksLikeItemLine(line: string): boolean {
  if (NOISE.some((n) => n.test(line)) || looksLikePhone(line) || DATE.test(line)) return false
  if (TOTAL_KEYWORDS.some((k) => k.test(line))) return false
  if (amountAtEnd(line) === null) return false
  return /[a-zà-ÿ]{3,}/i.test(line.replace(AMOUNT, ""))
}

/**
 * Any photo with digits in it yields "amounts" (a pot read as 278 F, a cat as
 * 1 728 F). A receipt also has structure: a total keyword, several priced
 * lines, or one priced line among words only a ticket prints — most pharmacy
 * tickets carry a single item, and OCR often mangles their TOTAL.
 */
export function isValidReceipt(rawLines: string[]): boolean {
  if (rawLines.some(hasTotalKeyword)) return true
  const items = rawLines.filter(looksLikeItemLine).length
  return items >= 2 || (items >= 1 && rawLines.some((l) => RECEIPT_CONTEXT.test(l)))
}

export function parseReceiptText(text: string): ParsedReceipt {
  const rawLines = text.split(/\r?\n/).map(normalise).filter(Boolean)
  if (!isValidReceipt(rawLines)) return { ...EMPTY_RECEIPT }

  let date: string | null = null
  const dateMatch = rawLines.map((l) => DATE.exec(l)).find(Boolean)
  if (dateMatch) {
    const [, d, m, y] = dateMatch
    const year = y.length === 2 ? `20${y}` : y
    date = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  } else {
    const named = rawLines.map((l) => MONTH_DATE.exec(l)).find(Boolean)
    if (named) {
      const [, d, month, year] = named
      const m = MONTHS.indexOf(month.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")) + 1
      date = `${year}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`
    }
  }

  // A line ending in a price is an item, not the provider's name.
  const header =
    rawLines.find(
      (l) => /[a-z]{3,}/i.test(l) && !NOISE.some((n) => n.test(l)) && !DATE.test(l) && amountAtEnd(l) === null,
    ) ?? null

  // 1. A total keyword with an amount on the same line, or on the next one
  //    (tickets often print "TOTAL" and the figure below it).
  let keywordTotal: number | null = null
  let keywordIndex = -1
  for (let i = rawLines.length - 1; i >= 0 && keywordTotal === null; i -= 1) {
    const line = rawLines[i]
    if (!hasTotalKeyword(line)) continue
    const same = amountAtEnd(line)
    const next = i + 1 < rawLines.length ? amountAtEnd(rawLines[i + 1]) : null
    keywordTotal = same ?? next
    if (keywordTotal !== null) keywordIndex = i
  }

  // 2. Item lines: a label with letters, ending in an amount, before the total.
  const lines: ParsedLine[] = []
  const limit = keywordIndex === -1 ? rawLines.length : keywordIndex
  for (let i = 0; i < limit; i += 1) {
    const line = rawLines[i]
    if (!looksLikeItemLine(line)) continue
    const amount = amountAtEnd(line) as number
    const label = line.replace(AMOUNT, "").trim()

    const qty = /^(\d{1,2})\s*[x×*]\s*/i.exec(label)
    const quantity = qty ? Number.parseInt(qty[1], 10) : 1
    const cleanLabel = (qty ? label.slice(qty[0].length) : label).replace(/[\s.:-]+$/, "").trim()
    lines.push({
      label: cleanLabel,
      quantity,
      unitPrice: Math.round(amount / quantity),
    })
  }

  // OCR lost the total keyword: the total then reads as one more line, whose
  // amount is the sum of the lines above it ("TOTAL 3.843" read "IOIAI 3.843").
  let unlabelledTotal: number | null = null
  if (keywordTotal === null && lines.length >= 2) {
    const last = lines[lines.length - 1]
    const above = lines.slice(0, -1).reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)
    if (last.quantity * last.unitPrice === above) {
      lines.pop()
      unlabelledTotal = above
    }
  }

  const linesSum = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)

  let total = keywordTotal
  let confidence = 0
  if (unlabelledTotal !== null) {
    total = unlabelledTotal
    confidence = 0.75
  } else if (keywordTotal !== null) {
    confidence = 0.8
    // Lines that add up to the printed total are the strongest signal there is.
    if (linesSum > 0 && Math.abs(linesSum - keywordTotal) <= 1) confidence = 0.95
  } else if (linesSum > 0) {
    total = linesSum
    confidence = 0.5
  } else {
    // Last resort: the largest amount anywhere. Often right, never trusted.
    const amounts = rawLines
      .filter((l) => !looksLikePhone(l) && !DATE.test(l))
      .map(amountAtEnd)
      .filter((v): v is number => v !== null)
    total = amounts.length ? Math.max(...amounts) : null
    confidence = total === null ? 0 : 0.3
  }

  // Neither a provider name nor a total keyword: a guess, whatever the numbers say.
  if (keywordTotal === null && header === null) confidence = Math.min(confidence, 0.3)

  // Lines are only worth offering when they explain the total.
  const keepLines = total !== null && linesSum > 0 && Math.abs(linesSum - total) <= Math.max(1, total * 0.02)

  return { total, confidence, lines: keepLines ? lines : [], date, header }
}
