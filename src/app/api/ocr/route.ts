import { z } from "zod"
import { parseReceiptText } from "@/domain/portal/receipt-parse"

/**
 * Lecture du reçu par Claude (vision).
 *
 * Answers 501 when no key is configured, which the client takes as "use the
 * browser engine". The model is asked for structured JSON only; the same
 * parser then checks its arithmetic, so a model that misreads one line cannot
 * silently change the total.
 */

const Body = z.object({
  image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/),
})

const Extracted = z.object({
  header: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  total: z.number().nullable(),
  lines: z
    .array(z.object({ label: z.string(), quantity: z.number().positive(), unitPrice: z.number().nonnegative() }))
    .default([]),
  legible: z.boolean().default(true),
})

const PROMPT = `Tu lis un reçu ou un devis de pharmacie, d'opticien ou de clinique au Sénégal. Les montants sont en francs CFA, sans décimales.
Réponds UNIQUEMENT avec un objet JSON, sans texte autour ni balises :
{"header": nom de l'établissement ou null, "date": "AAAA-MM-JJ" ou null, "total": montant total à payer (nombre entier) ou null, "lines": [{"label": libellé, "quantity": quantité, "unitPrice": prix unitaire}], "legible": true si le reçu est lisible}
Le total est le montant final à payer (TOTAL, NET A PAYER, MONTANT TTC), jamais l'argent remis ni la monnaie rendue. N'invente rien : si une valeur est illisible, mets null.`

export async function POST(request: Request) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return Response.json({ error: "OCR serveur non configuré." }, { status: 501 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "Image invalide." }, { status: 400 })
  }

  const [, mediaType, data] = /^data:(image\/[a-z]+);base64,(.+)$/.exec(parsed.data.image)!

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.OCR_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  })

  if (!upstream.ok) {
    return Response.json({ error: "Lecture impossible." }, { status: 502 })
  }

  const message = (await upstream.json()) as { content: Array<{ type: string; text?: string }> }
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .replace(/```json|```/g, "")
    .trim()

  let extracted: z.infer<typeof Extracted>
  try {
    extracted = Extracted.parse(JSON.parse(text))
  } catch {
    // The model answered in prose: run the text parser over it rather than fail.
    return Response.json(parseReceiptText(text))
  }

  const lines = extracted.lines.map((line) => ({
    label: line.label,
    quantity: line.quantity,
    unitPrice: Math.round(line.unitPrice),
  }))
  const linesSum = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  const total = extracted.total ?? (linesSum > 0 ? linesSum : null)
  const agrees = total !== null && linesSum > 0 && Math.abs(linesSum - total) <= Math.max(1, total * 0.02)

  return Response.json({
    total,
    confidence: !extracted.legible || total === null ? 0.3 : agrees ? 0.95 : 0.8,
    lines: agrees ? lines : [],
    date: extracted.date ?? null,
    header: extracted.header ?? null,
  })
}
