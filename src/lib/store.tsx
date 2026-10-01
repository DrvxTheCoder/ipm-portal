"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { seed, type Db } from "@/lib/mock-data"
import { cancel as cancelVoucher, issue as issueVoucher, type VoucherDraft } from "@/domain/portal/issue"
import type { IpmVoucher } from "@/lib/schema"

/**
 * The prototype's database and session, in memory and mirrored to
 * localStorage so a bon created during the demo survives a reload.
 * In the real portal both live on the server; nothing here is trusted.
 */

const STORAGE_KEY = "ipm-portail:v1"
const SESSION_KEY = "ipm-portail:session"

type Session = { portalAccountId: string; memberId: string } | null

type Store = {
  ready: boolean
  db: Db
  session: Session
  signIn: (phone: string) => boolean
  signOut: () => void
  issue: (draft: VoucherDraft) => IpmVoucher
  cancel: (voucherId: string, reason: string) => void
  reset: () => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [db, setDb] = useState<Db>(() => seed())
  const [session, setSession] = useState<Session>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setDb(JSON.parse(saved) as Db)
      const savedSession = localStorage.getItem(SESSION_KEY)
      if (savedSession) setSession(JSON.parse(savedSession) as Session)
    } catch {
      // Corrupt or blocked storage: start from the seed.
    }
    setReady(true)
  }, [])

  const persist = useCallback((next: Db) => {
    setDb(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Quota: receipts are data URLs. The demo keeps working in memory.
    }
  }, [])

  const value = useMemo<Store>(
    () => ({
      ready,
      db,
      session,
      signIn: (phone) => {
        const digits = phone.replace(/\D/g, "").replace(/^221/, "")
        const account = db.portalAccounts.find((a) => a.phone === digits && a.status === "ACTIVE")
        if (!account) return false
        const next = { portalAccountId: account.id, memberId: account.memberId }
        setSession(next)
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify(next))
        } catch {}
        return true
      },
      signOut: () => {
        setSession(null)
        try {
          localStorage.removeItem(SESSION_KEY)
        } catch {}
      },
      issue: (draft) => {
        if (!session) throw new Error("Session expirée.")
        const result = issueVoucher(db, session.memberId, session.portalAccountId, draft)
        persist(result.db)
        return result.voucher
      },
      cancel: (voucherId, reason) => persist(cancelVoucher(db, voucherId, reason)),
      reset: () => {
        const fresh = seed()
        persist(fresh)
      },
    }),
    [ready, db, session, persist]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error("useStore outside StoreProvider")
  return store
}
