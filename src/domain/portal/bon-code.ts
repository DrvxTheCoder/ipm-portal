/**
 * The code behind a bon de pharmacie's QR: `BP.` and 24 base64url characters
 * (multiapp `newBonToken`). Case matters, so a pharmacist typing it from the
 * screen gets it in groups of four, and whatever they type — or a scanner
 * reads — is normalised before the lookup.
 */

/** "BP.AbCd EfGh …" — the token in groups of four, for a pharmacy to type. */
export function groupedCode(token: string): string {
  const dot = token.indexOf(".")
  const prefix = dot === -1 ? "" : token.slice(0, dot + 1)
  const rest = dot === -1 ? token : token.slice(dot + 1)
  return `${prefix}${(rest.match(/.{1,4}/g) ?? []).join(" ")}`
}

/**
 * The token in what was scanned or typed, or null when there is none worth
 * sending. Accepts the bare token (what a pharmacy bon's QR holds), the same
 * with spaces or a lower-case prefix, and a verification URL ending in
 * `/v/<token>` (a bon printed before the QR changed).
 */
export function parseBonCode(input: string): string | null {
  let text = input.trim()
  if (!text) return null
  try {
    const url = new URL(text)
    const match = /\/v\/([^/?#]+)/.exec(url.pathname)
    if (!match) return null
    text = decodeURIComponent(match[1])
  } catch {
    // Not a URL: the token itself.
  }
  text = text.replace(/\s+/g, "")
  if (/^bp\./i.test(text)) text = "BP." + text.slice(3)
  // The server's lookup wants 8 to 200 characters; nothing else is a token.
  if (text.length < 8 || text.length > 200 || !/^[A-Za-z0-9._~-]+$/.test(text)) return null
  return text
}
