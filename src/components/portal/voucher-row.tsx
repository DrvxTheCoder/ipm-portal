import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import { Badge } from "@/components/ui/badge"
import { STATUS_META, VOUCHER_TYPE_META } from "@/components/portal/meta"
import { francs, relativeDay } from "@/lib/format"
import type { IpmVoucher } from "@/lib/schema"

export function VoucherRow({ voucher, providerName }: { voucher: IpmVoucher; providerName: string }) {
  const type = VOUCHER_TYPE_META[voucher.type]
  const status = STATUS_META[voucher.status]
  return (
    <Link
      href={`/bons/${voucher.id}`}
      className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 ring-1 ring-line transition-colors active:bg-sunken"
    >
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-mint-wash text-teal">
        <HugeiconsIcon icon={type.icon} className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink capitalize">{voucher.beneficiaryName.toLowerCase()}</span>
        <span className="block truncate text-sm text-ink-2">{providerName}</span>
        <span className="mt-1 flex items-center gap-1.5">
          <Badge tone={status.tone}>
            <HugeiconsIcon icon={status.icon} />
            {status.label}
          </Badge>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="figure block text-xl font-semibold">{francs(voucher.totalAmount)}</span>
        <span className="block text-xs text-ink-3">{relativeDay(voucher.issueDate)}</span>
      </span>
    </Link>
  )
}
