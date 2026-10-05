"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { cn } from "@/lib/utils"

/** Rendered client-side to SVG — crisp at any size, prints well. */
export function Qr({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState<string>("")
  useEffect(() => {
    let alive = true
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0d2a30", light: "#ffffff00" } })
      .then((out) => alive && setSvg(out))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [value])
  return (
    <div
      role="img"
      aria-label="Code QR de vérification"
      className={cn("aspect-square [&_svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export const verifyUrl = (token: string) => new URL(`/v/${token}`, process.env.NEXT_PUBLIC_URL).toString()
