"use client"

import QRCode from "qrcode"
import { francs, longDate } from "@/lib/format"

/**
 * Le bon en image — what gets sent on WhatsApp or shown from the gallery at
 * the counter. Drawn straight on a canvas: no DOM-to-image library, same
 * colours and fonts as the screen, and a QR drawn module by module so it stays
 * sharp however the image is recompressed.
 */

export type VoucherImageInput = {
  typeLabel: string
  number: string
  beneficiaryName: string
  qrValue: string
  insurerShare: number
  memberShare: number
  appliedRate: number
  /** Null: a bon de pharmacie awaiting its amount — no split, the pharmacy enters it. */
  totalAmount: number | null
  /** Shown for a pharmacy to type when it cannot scan. */
  manualCode?: string | null
  providerName: string
  providerAddress: string | null
  expiryDate: string
}

const C = {
  mint: "#18c1a2",
  tealDeep: "#10434e",
  ink: "#0d2a30",
  ink2: "#46646a",
  ink3: "#7c979c",
  paper: "#eef5f3",
  surface: "#ffffff",
  sunken: "#e2ecea",
  line: "#d6e4e1",
}

const SANS = '"Figtree Variable", system-ui, sans-serif'
const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif'

const W = 400
const H = 680
const SCALE = 3

function capitalizeWords(name: string): string {
  return name.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase())
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

function dashedLine(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number) {
  ctx.save()
  ctx.strokeStyle = C.line
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.lineTo(x2, y)
  ctx.stroke()
  ctx.restore()
}

export async function renderVoucherImage(v: VoucherImageInput): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`700 34px ${DISPLAY}`),
    document.fonts.load(`600 24px ${DISPLAY}`),
    document.fonts.load(`400 14px ${SANS}`),
    document.fonts.load(`600 16px ${SANS}`),
  ]).catch(() => {})

  const canvas = document.createElement("canvas")
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext("2d")!
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = "alphabetic"

  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, W, H)

  // Card
  const cx = 16
  const cw = W - 32
  const pad = 22
  const left = cx + pad
  const right = cx + cw - pad
  ctx.fillStyle = C.surface
  ctx.beginPath()
  ctx.roundRect(cx, 16, cw, H - 32, 24)
  ctx.fill()
  ctx.strokeStyle = C.line
  ctx.stroke()

  // Header
  ctx.fillStyle = C.ink3
  ctx.font = `400 14px ${SANS}`
  ctx.fillText(v.typeLabel, left, 54)
  ctx.fillStyle = C.ink
  ctx.font = `700 34px ${DISPLAY}`
  ctx.fillText(v.number, left, 88)
  ctx.font = `600 16px ${SANS}`
  ctx.fillText(fit(ctx, capitalizeWords(v.beneficiaryName), cw - 2 * pad), left, 112)

  // QR band
  const bandTop = 130
  const bandH = 260
  ctx.fillStyle = "rgba(238,245,243,0.6)"
  ctx.fillRect(cx, bandTop, cw, bandH)
  dashedLine(ctx, cx, cx + cw, bandTop)
  dashedLine(ctx, cx, cx + cw, bandTop + bandH)

  const qr = QRCode.create(v.qrValue, { errorCorrectionLevel: "M" })
  const size = qr.modules.size
  const qrSide = 216
  const cell = qrSide / size
  const qx = (W - qrSide) / 2
  const qy = bandTop + (bandH - qrSide) / 2
  ctx.fillStyle = C.surface
  ctx.fillRect(qx - 10, qy - 10, qrSide + 20, qrSide + 20)
  ctx.fillStyle = C.ink
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      // Overlap by a hair so no seams appear between modules once scaled.
      if (qr.modules.get(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, cell + 0.3, cell + 0.3)
    }
  }

  // Split — or, before the pharmacy has priced the bon, what will happen.
  const barY = bandTop + bandH + 24
  const barW = cw - 2 * pad
  if (v.totalAmount === null) {
    ctx.textAlign = "center"
    ctx.font = `600 18px ${SANS}`
    ctx.fillStyle = C.ink
    ctx.fillText("Montant saisi par la pharmacie", W / 2, barY + 30)
    ctx.font = `400 14px ${SANS}`
    ctx.fillStyle = C.ink2
    ctx.fillText(v.manualCode ? `Code : ${v.manualCode}` : "Présentez l'ordonnance avec ce bon", W / 2, barY + 58)
    ctx.textAlign = "left"
  } else {
    const pct = Math.round(v.appliedRate * 100)
    ctx.fillStyle = C.sunken
    ctx.beginPath()
    ctx.roundRect(left, barY, barW, 12, 6)
    ctx.fill()
    ctx.fillStyle = C.mint
    ctx.beginPath()
    ctx.roundRect(left, barY, (barW * pct) / 100, 12, 6)
    ctx.fill()

    ctx.font = `400 14px ${SANS}`
    ctx.fillStyle = C.ink2
    ctx.fillText(`L'IPM paie ${pct} %`, left, barY + 38)
    ctx.textAlign = "right"
    ctx.fillText(`Votre part ${100 - pct} %`, right, barY + 38)
    ctx.font = `600 26px ${DISPLAY}`
    ctx.fillStyle = C.ink
    ctx.fillText(francs(v.memberShare), right, barY + 68)
    ctx.textAlign = "left"
    ctx.fillStyle = C.tealDeep
    ctx.fillText(francs(v.insurerShare), left, barY + 68)
  }

  // Details
  let y = barY + 96
  dashedLine(ctx, cx, cx + cw, y)
  y += 30
  const rows: Array<[string, string]> = [
    ["Prestataire", v.providerName],
    ["Adresse", v.providerAddress ?? "—"],
    ["Valable jusqu'au", longDate(v.expiryDate)],
  ]
  for (const [label, value] of rows) {
    ctx.font = `400 14px ${SANS}`
    ctx.fillStyle = C.ink3
    ctx.textAlign = "left"
    ctx.fillText(label, left, y)
    const labelW = ctx.measureText(label).width
    ctx.font = `600 14px ${SANS}`
    ctx.fillStyle = C.ink
    ctx.textAlign = "right"
    ctx.fillText(fit(ctx, value, barW - labelW - 16), right, y)
    y += 26
  }

  ctx.textAlign = "left"
  ctx.font = `600 16px ${SANS}`
  ctx.fillText("Total", left, y + 10)
  ctx.textAlign = "right"
  ctx.font = `700 26px ${DISPLAY}`
  ctx.fillText(v.totalAmount === null ? "À venir" : francs(v.totalAmount), right, y + 12)
  ctx.textAlign = "left"

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image impossible à créer."))), "image/png")
  )
}

/**
 * Native share sheet when the phone can share files (WhatsApp, Messages…),
 * otherwise a plain download. Returns what happened so the screen can say so.
 */
export async function shareVoucherImage(v: VoucherImageInput): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await renderVoucherImage(v)
  const file = new File([blob], `bon-${v.number}.png`, { type: "image/png" })

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Bon ${v.number}` })
      return "shared"
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled"
      // Share refused (permissions, desktop quirks): fall through to download.
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return "downloaded"
}
