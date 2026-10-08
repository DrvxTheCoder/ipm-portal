import type { ApiError as ApiErrorBody } from "@/lib/schema"

/**
 * Client for multiapp's `/api/portail/*`.
 *
 * Every failure becomes an `ApiError` carrying a French sentence the screen can
 * show as is: the server's own message when it answered, a fixed one when it
 * could not be reached. Callers never see a raw `TypeError` or `AbortError`.
 */

/**
 * Same origin by default: `next.config.ts` forwards `/api/portail/*` to
 * multiapp, so the portal works from any address it is opened on. Set
 * `NEXT_PUBLIC_API_URL` only to call multiapp directly (it must then allow
 * this origin in its `PORTAL_ORIGIN`).
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "/api/portail").replace(/\/$/, "")
export const FIRM_SLUG = process.env.NEXT_PUBLIC_PORTAL_FIRM_SLUG ?? "ipm-tawfeikh"

const TOKEN_KEY = "ipm-portail:token"
const TIMEOUT_MS = 15_000

export const NETWORK_MESSAGE = "Connexion impossible. Vérifiez votre réseau et réessayez."

export class ApiError extends Error {
  /** 0 when the server was not reached (network failure or timeout). */
  readonly status: number
  readonly code: string
  readonly refusals: string[]
  readonly fields: Record<string, string[]>
  /** Seconds, from `Retry-After` (429 on login). */
  readonly retryAfter: number | null

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ApiErrorBody["error"]["details"],
    retryAfter: number | null = null
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.refusals = details?.refusals ?? []
    this.fields = details?.fields ?? {}
    this.retryAfter = retryAfter
  }

  /** The request may have gone through, or not: retry with the same idempotency key. */
  get isNetwork(): boolean {
    return this.status === 0
  }
}

/* ------------------------------------------------------------------------ */
/* Token                                                                    */

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Blocked storage: the session lasts as long as the tab.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

/* ------------------------------------------------------------------------ */
/* Sign-out on 401                                                          */

const unauthorizedListeners = new Set<() => void>()

/** Called when the server refuses the token. The store clears its session. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

/* ------------------------------------------------------------------------ */
/* Requests                                                                 */

type RequestOptions = {
  method?: "GET" | "POST"
  json?: unknown
  form?: FormData
  /** False only for `/session`, which is where a token comes from. */
  auth?: boolean
}

export type SendOptions = {
  method?: "GET" | "POST"
  json?: unknown
  form?: FormData
  /** Sent as `Authorization: Bearer`; null sends none. */
  token: string | null
}

/**
 * One request to `/api/portail/*`, nothing else: no token of its own, no
 * sign-out. The participant client (`api`) and the pharmacy's
 * (`lib/prestataire/api`) each add their own token and their own reaction to
 * a refused one, so neither session can leak into the other.
 */
export async function send<T>(path: string, { method = "GET", json, form, token }: SendOptions): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers["Content-Type"] = "application/json"

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
      signal: controller.signal,
      cache: "no-store",
    })
  } catch {
    throw new ApiError(0, "NETWORK", NETWORK_MESSAGE)
  } finally {
    clearTimeout(timer)
  }

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // An HTML error page from a proxy, or an empty body.
  }

  if (response.ok) return body as T

  const error = (body as ApiErrorBody | null)?.error
  const retryAfter = Number(response.headers.get("Retry-After")) || null
  throw new ApiError(
    response.status,
    error?.code ?? "HTTP_" + response.status,
    error?.message ?? "Une erreur inattendue est survenue. Réessayez.",
    error?.details,
    retryAfter
  )
}

export async function api<T>(path: string, { method = "GET", json, form, auth = true }: RequestOptions = {}): Promise<T> {
  try {
    return await send<T>(path, { method, json, form, token: auth ? getToken() : null })
  } catch (failure) {
    // A refused token, or a locked account: this session is over. Not on
    // `/session` itself, where 401 means a wrong code.
    if (
      auth &&
      failure instanceof ApiError &&
      (failure.status === 401 || failure.code === "ACCOUNT_LOCKED")
    ) {
      clearToken()
      for (const listener of unauthorizedListeners) listener()
    }
    throw failure
  }
}

/**
 * A link multiapp minted to one of its own `/api/portail/*` routes (the
 * signed ordonnance link), made to go through the same route as every other
 * call. multiapp writes its own origin into the link (its `AUTH_URL`), which
 * a phone on the LAN may not reach and an HTTPS page may not load; the path
 * and its signature are all that matter.
 */
export function viaApi(url: string | null): string | null {
  if (!url || !API_URL.startsWith("/")) return url
  try {
    const parsed = new URL(url)
    return parsed.pathname.startsWith("/api/portail/") ? parsed.pathname + parsed.search : url
  } catch {
    return url
  }
}

/** A data URL (what the receipt capture produces) as a Blob for multipart. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const [meta, data] = dataUrl.split(",", 2)
  const type = /^data:([^;,]+)/.exec(meta)?.[1] ?? "image/jpeg"
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}
