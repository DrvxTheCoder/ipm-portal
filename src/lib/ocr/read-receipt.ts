"use client"

import { parseReceiptText, type ParsedReceipt } from "@/domain/portal/receipt-parse"
import { forOcr, toStoredJpeg, type LoadedImage } from "@/lib/ocr/image"

export type OcrEngine = "claude" | "tesseract"
export type OcrResult = ParsedReceipt & { engine: OcrEngine; rawText: string | null }
export type OcrProgress = { stage: "upload" | "load" | "recognize"; progress: number }

/**
 * Two engines, one result shape.
 *
 *   1. `/api/ocr` — Claude vision, when the server has an ANTHROPIC_API_KEY.
 *      Reads crumpled, handwritten and angled tickets that Tesseract cannot.
 *   2. Tesseract.js in the browser, French model — always available, no key,
 *      nothing leaves the phone. Used when the route answers 501 or fails.
 *
 * Either way the parser's confidence travels with the result, and the screen
 * asks the participant to confirm the total.
 */
export async function readReceipt(
  image: LoadedImage,
  onProgress?: (p: OcrProgress) => void
): Promise<OcrResult> {
  try {
    onProgress?.({ stage: "upload", progress: 0.1 })
    const response = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: toStoredJpeg(image, 1600, 0.85) }),
    })
    if (response.ok) {
      const data = (await response.json()) as ParsedReceipt
      onProgress?.({ stage: "recognize", progress: 1 })
      return { ...data, engine: "claude", rawText: null }
    }
  } catch {
    // Offline or route missing — the browser engine takes over.
  }

  const { createWorker } = await import("tesseract.js")
  const worker = await createWorker("fra", 1, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress?.({ stage: "recognize", progress: message.progress })
      } else {
        onProgress?.({ stage: "load", progress: message.progress ?? 0 })
      }
    },
  })
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" })
    const { data } = await worker.recognize(forOcr(image))
    return { ...parseReceiptText(data.text), engine: "tesseract", rawText: data.text }
  } finally {
    await worker.terminate()
  }
}
