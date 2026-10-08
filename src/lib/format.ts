/** "60 448 F" — the way amounts are read at the counter. FCFA has no subunit. */
export function francs(value: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(value)).replace(/\u202f|\u00a0/g, " ")} F`
}

/** Number only, grouped: "60 448". */
export function grouped(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(value)).replace(/\u202f|\u00a0/g, " ")
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

/** "8 oct., 14:32". */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", { month: "long" })
}

export function firstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName
}

export function initials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
}

/** "Il y a 3 jours", "Aujourd'hui". Plain words, no relative-time library. */
export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(now) - start(d)) / 86_400_000)
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return "Hier"
  if (days < 7) return `Il y a ${days} jours`
  return shortDate(iso)
}
