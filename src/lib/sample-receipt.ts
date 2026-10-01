/**
 * A drawn pharmacy ticket for the seeded history, so older portal bons show a
 * receipt like a real one would. Never used for anything a participant enters.
 */
const PROVIDER_LABELS: Record<string, string> = {
  prov_guigon: "PHARMACIE GUIGON",
  prov_mame_diarra: "PHARMACIE MAME DIARRA",
  prov_keur_massar: "PHARMACIE KEUR MASSAR",
  prov_liberte6: "PHARMACIE LIBERTE 6",
  prov_madeleine: "CLINIQUE DE LA MADELEINE",
}

export function sampleReceipt(
  providerId: string,
  lines: Array<[string, number, number]>,
  issueDate: string
): string {
  const title = PROVIDER_LABELS[providerId] ?? "RECU"
  const total = lines.reduce((sum, [, q, u]) => sum + q * u, 0)
  const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(n).replace(/\u202f|\u00a0/g, " ")
  const date = new Date(issueDate).toLocaleDateString("fr-FR")
  const rows = lines
    .map(([label, q, u], i) => {
      const y = 150 + i * 34
      const short = label.length > 26 ? `${label.slice(0, 25)}…` : label
      return `<text x="24" y="${y}">${q} x ${short}</text><text x="296" y="${y}" text-anchor="end">${fmt(q * u)}</text>`
    })
    .join("")
  const end = 150 + lines.length * 34
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${end + 120}" viewBox="0 0 320 ${end + 120}">
<rect width="100%" height="100%" fill="#fbfaf6"/>
<g font-family="Courier New, monospace" font-size="13" fill="#2b2b2b">
<text x="160" y="40" text-anchor="middle" font-weight="700" font-size="15">${title}</text>
<text x="160" y="62" text-anchor="middle">Dakar - Senegal</text>
<text x="24" y="100">Date : ${date}</text>
<line x1="24" y1="116" x2="296" y2="116" stroke="#999" stroke-dasharray="4 3"/>
${rows}
<line x1="24" y1="${end}" x2="296" y2="${end}" stroke="#999" stroke-dasharray="4 3"/>
<text x="24" y="${end + 34}" font-weight="700" font-size="15">TOTAL TTC</text>
<text x="296" y="${end + 34}" text-anchor="end" font-weight="700" font-size="15">${fmt(total)}</text>
<text x="160" y="${end + 80}" text-anchor="middle" font-size="11">Merci de votre visite</text>
</g></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
