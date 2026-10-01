import { cn } from "@/lib/utils"
import { initials } from "@/lib/format"
import type { Person } from "@/lib/schema"

/** Colour by family rank, so the same person is the same colour everywhere. */
const SWATCHES = [
  "bg-teal text-white",
  "bg-mint text-teal-deep",
  "bg-[#f2c57c] text-[#5a3a06]",
  "bg-[#9fd3e6] text-[#0f3f52]",
  "bg-[#e7a99a] text-[#5b1f15]",
]

/** The person's photo when the IPM has one, their initials otherwise. */
export function Avatar({ person, rank = 0, className }: { person: Person; rank?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "figure inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold",
        SWATCHES[rank % SWATCHES.length],
        className
      )}
    >
      {person.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.photoUrl} alt="" className="size-full object-cover" />
      ) : (
        initials(person.firstName, person.lastName)
      )}
    </span>
  )
}
