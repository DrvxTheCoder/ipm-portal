"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { api, ApiError, clearToken, FIRM_SLUG, getToken, onUnauthorized, setToken } from "@/lib/api"
import type {
  CreateVoucherResponse,
  Db,
  IpmVoucher,
  NotificationsResponse,
  PortalNotification,
  SessionResponse,
  VoucherDraft,
} from "@/lib/schema"

/**
 * The portal's data: multiapp's snapshot of the family, and the session.
 *
 * Pages read `db` exactly as they did the prototype's in-memory database; it
 * is now `GET /api/portail/snapshot`, refreshed after every write, on window
 * focus, and when a notification arrives. The last snapshot is cached in
 * localStorage and painted at once on load, so a slow or dead server still
 * shows the family's bons — with `stale` set, so the screen can say so.
 *
 * Writes go to the server, which decides. Nothing here is trusted.
 */

const SESSION_KEY = "ipm-portail:session"
const SNAPSHOT_KEY = "ipm-portail:snapshot"
const NOTIFIED_KEY = "ipm-portail:notified"
const POLL_MS = 30_000

type Session = { portalAccountId: string; memberId: string } | null

type Store = {
  /** Session restored from storage; until then, nothing is known. */
  ready: boolean
  /** A snapshot (cached or fresh) is in `db`. Pages render only once it is. */
  loaded: boolean
  db: Db
  session: Session
  /** The last refresh failed: what `db` shows may be out of date. */
  stale: boolean
  /** Why the last refresh failed, in French. */
  error: string | null
  refreshing: boolean
  /** Unread, newest first. */
  notifications: PortalNotification[]
  signIn: (phone: string, code: string) => Promise<void>
  signOut: () => void
  refresh: () => Promise<void>
  /** Issues the bon on the server and returns it as written. Throws `ApiError`. */
  /** `receipt` null: the participant skipped the photo, no `receipt` part is sent. */
  issue: (draft: VoucherDraft, receipt: Blob | null) => Promise<IpmVoucher>
  /** Throws `ApiError`. */
  cancel: (voucherId: string, reason: string) => Promise<IpmVoucher>
  /** Marks a bon's notifications read, if it has any. */
  markRead: (voucherId: string) => void
}

const EMPTY_DB: Db = {
  firmId: "",
  persons: [],
  categories: [],
  serviceTypes: [],
  specialties: [],
  plans: [],
  planRates: [],
  employerRates: [],
  employers: [],
  members: [],
  dependents: [],
  cards: [],
  providers: [],
  agreements: [],
  vouchers: [],
  voucherLines: [],
  consumptions: [],
  portalAccounts: [],
  settings: { firmId: "", reviewThresholdAmount: 0, reviewThresholdRatio: 0, unusualAmountMultiple: 0, ocrMismatchTolerance: 0 },
  bookings: [],
  ceilings: [],
  sequences: { PHARMACY: 0, OPTICAL: 0, GUARANTEE: 0, HOSPITALIZATION: 0 },
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota or blocked storage: the portal keeps working, without the cache.
  }
}

/** A written bon, merged in before the refresh that will confirm it. */
function withVoucher(db: Db, { voucher, lines }: CreateVoucherResponse): Db {
  return {
    ...db,
    vouchers: [voucher, ...db.vouchers.filter((v) => v.id !== voucher.id)],
    voucherLines: [...db.voucherLines.filter((l) => l.voucherId !== voucher.id), ...lines],
  }
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [db, setDb] = useState<Db>(EMPTY_DB)
  const [session, setSession] = useState<Session>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [notifications, setNotifications] = useState<PortalNotification[]>([])
  const inflight = useRef<Promise<void> | null>(null)
  // Session at the time a request started: a late answer for a signed-out
  // session must not repaint the screen.
  const sessionRef = useRef<Session>(null)

  const apply = useCallback((next: Db, memberId: string) => {
    setDb(next)
    setLoaded(true)
    write(SNAPSHOT_KEY, { memberId, db: next })
  }, [])

  const clear = useCallback(() => {
    clearToken()
    write(SESSION_KEY, null)
    write(SNAPSHOT_KEY, null)
    sessionRef.current = null
    setSession(null)
    setDb(EMPTY_DB)
    setLoaded(false)
    setError(null)
    setNotifications([])
  }, [])

  const refresh = useCallback((): Promise<void> => {
    const current = sessionRef.current
    if (!current || !getToken()) return Promise.resolve()
    // One snapshot request at a time: focus, poll and a write can coincide.
    if (inflight.current) return inflight.current
    setRefreshing(true)
    const run = api<Db>("/snapshot")
      .then((next) => {
        if (sessionRef.current?.memberId !== current.memberId) return
        apply(next, current.memberId)
        setError(null)
      })
      .catch((failure: unknown) => {
        if (failure instanceof ApiError && failure.status === 401) return
        setError(failure instanceof ApiError ? failure.message : "Les données n'ont pas pu être chargées.")
      })
      .finally(() => {
        inflight.current = null
        setRefreshing(false)
      })
    inflight.current = run
    return run
  }, [apply])

  const pollNotifications = useCallback(async () => {
    if (!sessionRef.current || !getToken()) return
    let list: PortalNotification[]
    try {
      list = (await api<NotificationsResponse>("/notifications")).notifications
    } catch {
      return // The snapshot refresh reports connectivity; stay quiet here.
    }
    setNotifications(list)

    const notified = new Set(read<string[]>(NOTIFIED_KEY) ?? [])
    const fresh = list.filter((n) => !notified.has(n.id))
    if (fresh.length === 0) return
    for (const n of fresh) {
      const approved = n.kind === "VOUCHER_APPROVED"
      const message = approved
        ? `Votre bon ${n.voucher.number} est validé`
        : `Votre bon ${n.voucher.number} a été refusé`
      const options = {
        description: approved ? "Il est prêt à être présenté." : (n.voucher.reviewReason ?? undefined),
        action: { label: "Voir", onClick: () => router.push(`/bons/${n.voucher.id}`) },
      }
      if (approved) toast.success(message, options)
      else toast.error(message, options)
    }
    write(NOTIFIED_KEY, [...fresh.map((n) => n.id), ...notified].slice(0, 200))
    // The bon's status changed on the server: show it everywhere.
    void refresh()
  }, [refresh, router])

  // Restore the session, and paint the cached snapshot before the network answers.
  useEffect(() => {
    const saved = read<NonNullable<Session>>(SESSION_KEY)
    if (saved && getToken()) {
      setSession(saved)
      sessionRef.current = saved
      const cached = read<{ memberId: string; db: Db }>(SNAPSHOT_KEY)
      // A snapshot from an older contract would crash the pages: drop it.
      if (cached?.memberId === saved.memberId && Array.isArray(cached.db.bookings) && Array.isArray(cached.db.ceilings)) {
        setDb(cached.db)
        setLoaded(true)
      }
    } else {
      clearToken()
      write(SESSION_KEY, null)
    }
    setReady(true)
  }, [])

  useEffect(() => onUnauthorized(clear), [clear])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // While signed in: refresh now, on focus, and poll notifications.
  useEffect(() => {
    if (!session) return
    void refresh()
    void pollNotifications()
    const onFocus = () => {
      void refresh()
      void pollNotifications()
    }
    const onVisible = () => document.visibilityState === "visible" && onFocus()
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void pollNotifications()
    }, POLL_MS)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [session, refresh, pollNotifications])

  const signIn = useCallback(async (phone: string, code: string) => {
    const { token, account } = await api<SessionResponse>("/session", {
      method: "POST",
      auth: false,
      json: { firmSlug: FIRM_SLUG, phone, code },
    })
    setToken(token)
    const next = { portalAccountId: account.id, memberId: account.memberId }
    write(SESSION_KEY, next)
    write(SNAPSHOT_KEY, null)
    setDb(EMPTY_DB)
    setLoaded(false)
    setError(null)
    sessionRef.current = next
    setSession(next)
  }, [])

  const issue = useCallback(
    async (draft: VoucherDraft, receipt: Blob | null) => {
      const form = new FormData()
      form.append("draft", JSON.stringify(draft))
      if (receipt) {
        const extension = receipt.type === "image/png" ? "png" : receipt.type === "image/webp" ? "webp" : "jpg"
        form.append("receipt", receipt, `recu.${extension}`)
      }
      const created = await api<CreateVoucherResponse>("/vouchers", { method: "POST", form })
      setDb((current) => withVoucher(current, created))
      void refresh()
      return created.voucher
    },
    [refresh]
  )

  const cancel = useCallback(
    async (voucherId: string, reason: string) => {
      const updated = await api<CreateVoucherResponse>(`/vouchers/${encodeURIComponent(voucherId)}/cancel`, {
        method: "POST",
        json: { reason },
      })
      setDb((current) => withVoucher(current, updated))
      void refresh()
      return updated.voucher
    },
    [refresh]
  )

  const markRead = useCallback(
    (voucherId: string) => {
      const ids = notifications.filter((n) => n.voucher.id === voucherId).map((n) => n.id)
      if (ids.length === 0) return
      setNotifications((list) => list.filter((n) => !ids.includes(n.id)))
      // Best effort: if it fails, the next poll brings them back.
      api("/notifications/read", { method: "POST", json: { ids } }).catch(() => {})
    },
    [notifications]
  )

  const value = useMemo<Store>(
    () => ({
      ready,
      loaded,
      db,
      session,
      stale: error !== null,
      error,
      refreshing,
      notifications,
      signIn,
      signOut: clear,
      refresh,
      issue,
      cancel,
      markRead,
    }),
    [ready, loaded, db, session, error, refreshing, notifications, signIn, clear, refresh, issue, cancel, markRead]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error("useStore outside StoreProvider")
  return store
}
