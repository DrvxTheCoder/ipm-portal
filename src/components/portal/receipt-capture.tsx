"use client"

import { useRef, useState } from "react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Camera01Icon, Image01Icon, Alert02Icon, RotateClockwiseIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { assessQuality, dHash, loadImage, QUALITY_MESSAGES, toStoredJpeg, type LoadedImage, type Quality } from "@/lib/ocr/image"
import { readReceipt, type OcrProgress, type OcrResult } from "@/lib/ocr/read-receipt"

export type CapturedReceipt = {
  receiptUrl: string
  receiptHash: string
  ocr: OcrResult | null
}

type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "poor"; image: LoadedImage; quality: Quality; preview: string }
  | { kind: "reading"; preview: string; progress: OcrProgress | null }
  | { kind: "failed"; preview: string; message: string; image: LoadedImage }

/**
 * Prendre le reçu en photo. With `read`, the photo is also read (scan path);
 * without, it is only checked, hashed and attached (manual path).
 */
export function ReceiptCapture({
  read,
  onDone,
}: {
  read: boolean
  onDone: (receipt: CapturedReceipt) => void
}) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })

  async function accept(image: LoadedImage, preview: string) {
    const receiptHash = dHash(image)
    if (!read) {
      onDone({ receiptUrl: preview, receiptHash, ocr: null })
      return
    }
    setPhase({ kind: "reading", preview, progress: null })
    try {
      const ocr = await readReceipt(image, (progress) =>
        setPhase((p) => (p.kind === "reading" ? { ...p, progress } : p))
      )
      onDone({ receiptUrl: preview, receiptHash, ocr })
    } catch {
      setPhase({
        kind: "failed",
        preview,
        image,
        message: "Le reçu n'a pas pu être lu. Vous pouvez reprendre la photo ou saisir le montant vous-même.",
      })
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setPhase({ kind: "checking" })
    try {
      const image = await loadImage(file)
      const quality = assessQuality(image)
      const preview = toStoredJpeg(image)
      if (!quality.ok) {
        setPhase({ kind: "poor", image, quality, preview })
        return
      }
      await accept(image, preview)
    } catch {
      setPhase({ kind: "idle" })
    }
  }

  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = "" }} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = "" }} />
    </>
  )

  if (phase.kind === "reading") {
    const pct = Math.round((phase.progress?.progress ?? 0) * 100)
    const label =
      phase.progress?.stage === "recognize" ? "Lecture du montant…" : phase.progress?.stage === "load" ? "Préparation de la lecture…" : "Envoi de la photo…"
    return (
      <div className="flex flex-col items-center">
        <div className="relative w-full max-w-72 overflow-hidden rounded-2xl ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={phase.preview} alt="Reçu" className="w-full" />
          <motion.div
            className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-mint/45 to-transparent"
            animate={{ top: ["-10%", "100%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <p className="mt-5 font-medium text-ink">{label}</p>
        <div className="mt-2 h-2 w-48 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-mint transition-[width]" style={{ width: `${Math.max(8, pct)}%` }} />
        </div>
      </div>
    )
  }

  if (phase.kind === "poor" || phase.kind === "failed") {
    const message = phase.kind === "poor" ? QUALITY_MESSAGES[phase.quality.problem!] : phase.message
    return (
      <div className="flex flex-col items-center">
        {inputs}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={phase.preview} alt="Reçu" className="max-h-64 rounded-2xl ring-1 ring-line" />
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-tint p-3 text-[0.95rem] text-amber">
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-5 shrink-0" />
          {message}
        </p>
        <div className="mt-5 grid w-full gap-2.5">
          <Button onClick={() => camera.current?.click()} className="h-14 rounded-2xl text-base font-semibold">
            <HugeiconsIcon icon={RotateClockwiseIcon} className="size-5" />
            Reprendre la photo
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              phase.kind === "poor"
                ? accept(phase.image, phase.preview)
                : onDone({ receiptUrl: phase.preview, receiptHash: dHash(phase.image), ocr: null })
            }
            className="h-14 rounded-2xl text-base"
          >
            {phase.kind === "poor" ? "Garder cette photo" : "Garder la photo, saisir le montant"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {inputs}
      <button
        type="button"
        onClick={() => camera.current?.click()}
        disabled={phase.kind === "checking"}
        className="relative flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-mint-deep/50 bg-mint-wash/60 text-teal-deep transition-colors active:bg-mint-wash"
      >
        {/* framing guide */}
        <span className="pointer-events-none absolute inset-8" />
        <span className="inline-flex size-20 items-center justify-center rounded-full bg-teal text-white shadow-lg">
          <HugeiconsIcon icon={Camera01Icon} className="size-9" />
        </span>
        <span className="text-lg font-semibold">{phase.kind === "checking" ? "Vérification…" : "Prendre le reçu en photo"}</span>
        <span className="max-w-60 text-center text-sm text-ink-2">Posez le reçu à plat, bien éclairé, le total visible.</span>
      </button>
      <Button variant="ghost" onClick={() => gallery.current?.click()} className="mt-3 h-12 w-full rounded-2xl text-base text-teal">
        <HugeiconsIcon icon={Image01Icon} className="size-5" />
        Choisir une photo existante
      </Button>
    </div>
  )
}
