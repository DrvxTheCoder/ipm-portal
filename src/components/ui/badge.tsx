import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/** ReUI-style badge: light fill, coloured text, one shape. */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.78rem] font-semibold whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        mint: "bg-mint-wash text-teal-deep",
        teal: "bg-teal text-white",
        amber: "bg-amber-tint text-amber",
        red: "bg-red-tint text-red",
        neutral: "bg-sunken text-ink-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />
}
