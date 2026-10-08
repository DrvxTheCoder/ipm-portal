"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CameraOff01Icon, Loading03Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { parseBonCode } from "@/domain/portal/bon-code"

type CameraState =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "denied" }
  | { kind: "unavailable"; message: string }

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }
type Decode = (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>

/**
 * Le scanner: the back camera, decoded with the browser's `BarcodeDetector`
 * where it exists (Chrome on Android) and `jsQR` elsewhere (Safari on iPhone),
 * loaded only then. The code field below is always there: a refused camera, a
 * worn screen or a printed bon still get through.
 *
 * Nothing is recorded; the stream stops as soon as a code is read, or the
 * component leaves the screen.
 */
export function QrScanner({ onCode, busy = false }: { onCode: (token: string) => void; busy?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState<CameraState>({ kind: "starting" })
  const [typed, setTyped] = useState("")
  const [typedError, setTypedError] = useState<string | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const done = useRef(false)
  const onCodeRef = useRef(onCode)

  useEffect(() => {
    onCodeRef.current = onCode
  }, [onCode])

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let alive = true
    done.current = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera({ kind: "unavailable", message: "La caméra n'est pas disponible sur ce navigateur. Saisissez le code du bon." })
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch (error) {
        if (!alive) return
        const name = error instanceof DOMException ? error.name : ""
        if (name === "NotAllowedError" || name === "SecurityError") setCamera({ kind: "denied" })
        else setCamera({ kind: "unavailable", message: "Aucune caméra n'a pu être ouverte. Saisissez le code du bon." })
        return
      }
      if (!alive || !video.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.current.srcObject = stream
      await video.current.play().catch(() => {})
      setCamera({ kind: "scanning" })

      const decode = await decoder()
      const canvas = document.createElement("canvas")
      const tick = async () => {
        if (!alive || done.current || !video.current) return
        let text: string | null = null
        try {
          if (video.current.readyState >= 2) text = await decode(video.current, canvas)
        } catch {
          // A frame the decoder choked on: try the next one.
        }
        if (text !== null && alive && !done.current) {
          const token = parseBonCode(text)
          if (token) {
            done.current = true
            stream?.getTracks().forEach((t) => t.stop())
            navigator.vibrate?.(60)
            onCodeRef.current(token)
            return
          }
          // A QR, but not a bon's: say so, keep looking.
          setUnreadable(true)
        }
        timer = setTimeout(() => void tick(), 180)
      }
      void tick()
    }

    void start()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function submitTyped(event: FormEvent) {
    event.preventDefault()
    const token = parseBonCode(typed)
    if (!token) {
      setTypedError("Code incomplet. Il commence par « BP. » et figure sous le QR du bon.")
      return
    }
    setTypedError(null)
    onCode(token)
  }

  return (
    <div>
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-ink">
        <video ref={video} playsInline muted className="size-full object-cover" aria-label="Aperçu de la caméra" />
        {camera.kind === "scanning" && (
          <>
            <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/85 shadow-[0_0_0_999px_rgba(13,42,48,.45)]" />
            <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-white drop-shadow">
              {unreadable ? "Ce QR n'est pas un bon de pharmacie IPM." : "Placez le QR du bon dans le cadre"}
            </p>
          </>
        )}
        {camera.kind === "starting" && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-white/80" role="status">
            <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" /> Ouverture de la caméra…
          </p>
        )}
        {(camera.kind === "denied" || camera.kind === "unavailable") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-sunken p-6 text-center text-ink-2">
            <HugeiconsIcon icon={CameraOff01Icon} className="size-10 text-ink-3" />
            <p className="text-[0.95rem]">
              {camera.kind === "denied"
                ? "L'accès à la caméra est refusé. Autorisez-le dans les réglages du navigateur, ou saisissez le code ci-dessous."
                : camera.message}
            </p>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/60 text-white" role="status">
            <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin" /> Recherche du bon…
          </div>
        )}
      </div>

      <form onSubmit={submitTyped} className="mt-5">
        <label htmlFor="bon-code" className="text-sm font-medium text-ink-2">
          Ou saisissez le code du bon
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="bon-code"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              setTypedError(null)
            }}
            placeholder="BP.xxxx xxxx …"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            className="h-14 min-w-0 flex-1 rounded-2xl bg-surface px-4 font-mono text-lg ring-1 ring-line outline-none focus:ring-2 focus:ring-mint-deep"
          />
          <Button type="submit" disabled={busy || !typed.trim()} aria-label="Rechercher le bon" className="h-14 w-14 rounded-2xl">
            <HugeiconsIcon icon={Search01Icon} className="size-6" />
          </Button>
        </div>
        {typedError && <p className="mt-1.5 text-sm font-medium text-red">{typedError}</p>}
        <p className="mt-1.5 text-xs text-ink-3">Respectez les majuscules et minuscules ; les espaces sont ignorés.</p>
      </form>
    </div>
  )
}

/** The fastest decoder this browser has. */
async function decoder(): Promise<Decode> {
  const Native = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector & object }).BarcodeDetector
  if (Native) {
    try {
      const formats: string[] = await (Native as unknown as { getSupportedFormats: () => Promise<string[]> }).getSupportedFormats()
      if (formats.includes("qr_code")) {
        const detector = new Native({ formats: ["qr_code"] })
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null
      }
    } catch {
      // Fall through to jsQR.
    }
  }
  const { default: jsQR } = await import("jsqr")
  return async (video, canvas) => {
    // Downscaled: a QR on a phone screen decodes fine at 640 px, and an
    // entry-level Android keeps up.
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
    const width = Math.round(video.videoWidth * scale)
    const height = Math.round(video.videoHeight * scale)
    if (!width || !height) return null
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d", { willReadFrequently: true })!
    context.drawImage(video, 0, 0, width, height)
    const { data } = context.getImageData(0, 0, width, height)
    return jsQR(data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? null
  }
}
