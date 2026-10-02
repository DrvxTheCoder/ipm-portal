"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Image01Icon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"

/**
 * A receipt photo from the file host. The URL may be null (back-office bons,
 * some seeded ones) or fail to load (host down, link expired): either way the
 * box keeps its size and shows a placeholder, so the layout never jumps.
 */
export function ReceiptImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)

  if (!src || failed === src) {
    return (
      <span role="img" aria-label={alt ? `${alt} indisponible` : undefined} className={cn("grid place-items-center bg-sunken text-ink-3", className)}>
        <HugeiconsIcon icon={Image01Icon} className="size-1/3 max-h-10 max-w-10" />
      </span>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setFailed(src)} className={className} />
}
