/**
 * 32 random hex characters — an idempotency key the server accepts
 * (`[A-Za-z0-9_-]{8,64}`).
 *
 * Not `crypto.randomUUID()`: browsers expose it only in a secure context
 * (HTTPS or localhost), so on a phone testing over `http://<LAN IP>` it is
 * undefined and the submit dies before sending anything. `getRandomValues`
 * works everywhere.
 */
export function randomId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
