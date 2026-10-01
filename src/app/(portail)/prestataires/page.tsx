"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Call02Icon, Navigation03Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { PageHeader } from "@/components/portal/app-shell"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

/**
 * Où me soigner — only agréé, active providers: a participant should never
 * pick somewhere their bon will be refused. The schema stores an address, not
 * coordinates, so directions hand the address to the phone's map app.
 */
export default function PrestatairesPage() {
  const { db } = useStore()
  const [query, setQuery] = useState("")
  const [specialty, setSpecialty] = useState<string | null>(null)

  const providers = db.providers
    .filter((p) => p.accredited && p.status === "ACTIVE")
    .filter((p) => !specialty || p.specialtyId === specialty)
    .filter((p) => !query || `${p.name} ${p.address}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <PageHeader title="Prestataires" back="/" />
      <div className="mt-2 px-4">
        <label className="flex h-14 items-center gap-2 rounded-2xl bg-surface px-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-mint-deep">
          <HugeiconsIcon icon={Search01Icon} className="size-5 text-ink-3" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom ou quartier" className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-ink-3" />
        </label>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {[{ id: null, label: "Tous" }, ...db.specialties.map((s) => ({ id: s.id, label: s.label }))].map((s) => (
            <button
              key={s.id ?? "all"}
              onClick={() => setSpecialty(s.id)}
              className={cn("h-10 shrink-0 rounded-full px-4 text-[0.95rem] font-medium ring-1", specialty === s.id ? "bg-teal text-white ring-teal" : "bg-surface text-ink-2 ring-line")}
            >
              {s.label}
            </button>
          ))}
        </div>
        <ul className="mt-3 space-y-2.5">
          {providers.map((provider) => {
            const spec = db.specialties.find((s) => s.id === provider.specialtyId)
            const destination = encodeURIComponent(`${provider.name}, ${provider.address ?? ""}, Sénégal`)
            return (
              <li key={provider.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
                <p className="text-sm text-teal">{spec?.label}</p>
                <p className="text-lg font-semibold">{provider.name}</p>
                <p className="text-ink-3">{provider.address}</p>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${destination}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-12 items-center justify-center gap-2 rounded-xl bg-teal font-semibold text-white"
                  >
                    <HugeiconsIcon icon={Navigation03Icon} className="size-5" /> Itinéraire
                  </a>
                  {provider.phone && (
                    <a href={`tel:+221${provider.phone}`} aria-label={`Appeler ${provider.name}`} className="flex size-12 items-center justify-center rounded-xl bg-mint-wash text-teal">
                      <HugeiconsIcon icon={Call02Icon} className="size-5" />
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
