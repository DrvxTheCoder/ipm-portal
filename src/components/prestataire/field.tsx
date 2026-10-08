"use client"

import { useState, type ComponentProps } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"

/** A labelled text field at counter size; a password one can be shown. */
export function Field({
  id,
  label,
  error,
  className,
  type = "text",
  ...props
}: ComponentProps<"input"> & { id: string; label: string; error?: string | null }) {
  const [shown, setShown] = useState(false)
  const secret = type === "password"
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium text-ink-2">
        {label}
      </label>
      <div
        className={cn(
          "mt-2 flex h-14 items-center rounded-2xl bg-surface ring-1 focus-within:ring-2 focus-within:ring-mint-deep",
          error ? "ring-red" : "ring-line"
        )}
      >
        <input
          id={id}
          type={secret && shown ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-4 text-lg outline-none placeholder:text-ink-3/60"
          {...props}
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            className="inline-flex size-12 shrink-0 items-center justify-center text-ink-3"
          >
            <HugeiconsIcon icon={shown ? ViewOffIcon : ViewIcon} className="size-5" />
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-red">
          {error}
        </p>
      )}
    </div>
  )
}
