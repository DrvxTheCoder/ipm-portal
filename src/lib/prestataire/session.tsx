"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ApiError, send, type SendOptions } from "@/lib/api"
import type { ProviderChangePasswordRequest, ProviderLoginResponse } from "@/lib/schema"

/**
 * La session d'une pharmacie — separate from the participant's in every way:
 * its own login (`/prestataire/login`), its own bearer token under its own
 * storage key, and its own reaction to a refused token. No participant route
 * accepts this token, and this client never sends the participant's.
 *
 * Nothing about the bons is kept here: every screen reads the API afresh, so
 * an amount the IPM corrected shows as corrected on the next visit.
 */

const SESSION_KEY = "ipm-prestataire:session"

export type ProviderSession = {
  token: string
  expiresAt: string
  mustChangePassword: boolean
  provider: ProviderLoginResponse["provider"]
}

type Context = {
  ready: boolean
  session: ProviderSession | null
  signIn: (code: string, password: string) => Promise<ProviderSession>
  /** Ends the session on the server too (best effort) and forgets it here. */
  signOut: () => Promise<void>
  changePassword: (input: ProviderChangePasswordRequest) => Promise<void>
  /** A provider route. Throws `ApiError`; a dead session signs out. */
  request: <T>(path: string, options?: Omit<SendOptions, "token">) => Promise<T>
}

function readSession(): ProviderSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const session = raw ? (JSON.parse(raw) as ProviderSession) : null
    if (!session?.token || new Date(session.expiresAt) <= new Date()) return null
    return session
  } catch {
    return null
  }
}

function writeSession(session: ProviderSession | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // Blocked storage: the session lasts as long as the tab.
  }
}

const PrestataireContext = createContext<Context | null>(null)

export function PrestataireProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<ProviderSession | null>(null)
  const sessionRef = useRef<ProviderSession | null>(null)

  const apply = useCallback((next: ProviderSession | null) => {
    sessionRef.current = next
    writeSession(next)
    setSession(next)
  }, [])

  useEffect(() => {
    const saved = readSession()
    sessionRef.current = saved
    setSession(saved)
    if (!saved) writeSession(null)
    setReady(true)
  }, [])

  const request = useCallback(
    async <T,>(path: string, options: Omit<SendOptions, "token"> = {}): Promise<T> => {
      const current = sessionRef.current
      try {
        return await send<T>(`/prestataire${path}`, { ...options, token: current?.token ?? null })
      } catch (failure) {
        if (failure instanceof ApiError && sessionRef.current === current) {
          // Closed, expired or revoked: back to the login.
          if (failure.status === 401) apply(null)
          // A temporary password: only the change-password screen may follow.
          else if (failure.code === "PASSWORD_CHANGE_REQUIRED" && current) apply({ ...current, mustChangePassword: true })
        }
        throw failure
      }
    },
    [apply]
  )

  const signIn = useCallback(
    async (code: string, password: string) => {
      const answer = await send<ProviderLoginResponse>("/prestataire/login", {
        method: "POST",
        json: { code, password },
        token: null,
      })
      const next: ProviderSession = {
        token: answer.token,
        expiresAt: answer.expiresAt,
        mustChangePassword: answer.mustChangePassword,
        provider: answer.provider,
      }
      apply(next)
      return next
    },
    [apply]
  )

  const signOut = useCallback(async () => {
    const current = sessionRef.current
    apply(null)
    if (!current) return
    // Best effort: the token is forgotten here whatever the server says.
    await send("/prestataire/logout", { method: "POST", token: current.token }).catch(() => {})
  }, [apply])

  const changePassword = useCallback(
    async (input: ProviderChangePasswordRequest) => {
      await request<{ mustChangePassword: false }>("/change-password", { method: "POST", json: input })
      const current = sessionRef.current
      if (current) apply({ ...current, mustChangePassword: false })
    },
    [request, apply]
  )

  const value = useMemo<Context>(
    () => ({ ready, session, signIn, signOut, changePassword, request }),
    [ready, session, signIn, signOut, changePassword, request]
  )
  return <PrestataireContext.Provider value={value}>{children}</PrestataireContext.Provider>
}

export function usePrestataire(): Context {
  const context = useContext(PrestataireContext)
  if (!context) throw new Error("usePrestataire outside PrestataireProvider")
  return context
}
