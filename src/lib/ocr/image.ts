/**
 * Everything done to a receipt photo in the browser, before any OCR:
 * downscale, quality check, perceptual hash, compressed copy for storage.
 * No library — a canvas does it all, and it runs on an entry-level Android.
 */

export type LoadedImage = { canvas: HTMLCanvasElement; width: number; height: number }

export async function loadImage(file: Blob, maxSide = 1600): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { canvas, width, height }
}

function grayscale(source: HTMLCanvasElement, width: number, height: number): Float32Array {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  const gray = new Float32Array(width * height)
  for (let i = 0; i < gray.length; i += 1) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }
  return gray
}

export type Quality = {
  ok: boolean
  brightness: number
  sharpness: number
  problem: "TOO_DARK" | "TOO_BRIGHT" | "BLURRY" | null
}

/**
 * Brightness is the mean grey; sharpness the variance of the Laplacian — the
 * standard blur measure. Thresholds tuned on phone photos of paper tickets:
 * a readable ticket sits well above 120, a shaken one well below.
 */
export function assessQuality(image: LoadedImage): Quality {
  const w = 400
  const h = Math.max(1, Math.round((image.height / image.width) * w))
  const gray = grayscale(image.canvas, w, h)

  let sum = 0
  let blown = 0
  for (const value of gray) {
    sum += value
    if (value >= 253) blown += 1
  }
  const brightness = sum / gray.length
  // Glare is a patch burnt to pure white, not a bright page: white paper
  // photographed close is legitimately bright on average.
  const glare = blown / gray.length

  let lapSum = 0
  let lapSq = 0
  let count = 0
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x
      const lap = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
      lapSum += lap
      lapSq += lap * lap
      count += 1
    }
  }
  const mean = lapSum / count
  const sharpness = lapSq / count - mean * mean

  let problem: Quality["problem"] = null
  if (brightness < 60) problem = "TOO_DARK"
  else if (glare > 0.3) problem = "TOO_BRIGHT"
  else if (sharpness < 120) problem = "BLURRY"

  return { ok: problem === null, brightness, sharpness, problem }
}

export const QUALITY_MESSAGES: Record<NonNullable<Quality["problem"]>, string> = {
  TOO_DARK: "La photo est trop sombre. Mettez-vous près d'une lumière.",
  TOO_BRIGHT: "Il y a trop de reflet. Inclinez un peu le reçu.",
  BLURRY: "La photo est floue. Tenez le téléphone immobile.",
}

/** dHash: 9×8 grey thumbnail, one bit per horizontal gradient → 16 hex chars. */
export function dHash(image: LoadedImage): string {
  const gray = grayscale(image.canvas, 9, 8)
  let bits = ""
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? "1" : "0"
    }
  }
  let hex = ""
  for (let i = 0; i < 64; i += 4) hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16)
  return hex
}

/** What gets stored with the bon. Small enough for a slow connection. */
export function toStoredJpeg(image: LoadedImage, maxSide = 1100, quality = 0.72): string {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  canvas.getContext("2d")!.drawImage(image.canvas, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", quality)
}

/**
 * For Tesseract: grey, contrast stretched between the 2nd and 98th percentile.
 * Thermal tickets are low-contrast; this alone lifts recognition noticeably.
 */
export function forOcr(image: LoadedImage): HTMLCanvasElement {
  const { width, height } = image
  const gray = grayscale(image.canvas, width, height)
  const histogram = new Uint32Array(256)
  for (const value of gray) histogram[Math.min(255, Math.round(value))] += 1
  const low = percentile(histogram, gray.length * 0.02)
  const high = percentile(histogram, gray.length * 0.98)
  const range = Math.max(1, high - low)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  const out = ctx.createImageData(width, height)
  for (let i = 0; i < gray.length; i += 1) {
    const v = Math.max(0, Math.min(255, ((gray[i] - low) / range) * 255))
    out.data[i * 4] = v
    out.data[i * 4 + 1] = v
    out.data[i * 4 + 2] = v
    out.data[i * 4 + 3] = 255
  }
  ctx.putImageData(out, 0, 0)
  return canvas
}

function percentile(histogram: Uint32Array, target: number): number {
  let seen = 0
  for (let i = 0; i < 256; i += 1) {
    seen += histogram[i]
    if (seen >= target) return i
  }
  return 255
}
