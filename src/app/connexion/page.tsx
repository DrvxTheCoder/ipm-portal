"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { BackLink } from "@/components/portal/app-shell"
import { useStore } from "@/lib/store"
import { api, ApiError, FIRM_SLUG, NETWORK_MESSAGE } from "@/lib/api"
import type { AccessRequestRequest, AccessRequestResponse } from "@/lib/schema"

/**
 * Connexion par numéro de téléphone et code SMS — no password to forget,
 * nothing to type but digits. The phone and the code go to the server
 * together (`POST /api/portail/session`), which says whether they match.
 *
 * A participant who gets no SMS asks the IPM for an access code
 * (`POST /api/portail/access-request`). A manager passes it on; it is six
 * digits and goes in the same field, to the same `/session`.
 *
 * In the demo every account signs in with multiapp's DEMO_OTP; set
 * NEXT_PUBLIC_DEMO_CODE to the same value to show it on screen.
 */
const DEMO_CODE = process.env.NEXT_PUBLIC_DEMO_CODE || null

const SMS_CODE_LENGTH = 4
const ACCESS_CODE_LENGTH = 6

function formatPhone(digits: string) {
  return digits.replace(/(\d{2})(\d{0,3})(\d{0,2})(\d{0,2})/, (_, a, b, c, d) => [a, b, c, d].filter(Boolean).join(" "))
}

export default function ConnexionPage() {
  const router = useRouter()
  const { ready, session, signIn } = useStore()
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [codeLength, setCodeLength] = useState(SMS_CODE_LENGTH)
  const [requesting, setRequesting] = useState(false)
  const [accessRequested, setAccessRequested] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ready && session) router.replace("/")
  }, [ready, session, router])

  useEffect(() => {
    if (step === "code") codeRef.current?.focus()
  }, [step])

  const digits = phone.replace(/\D/g, "")

  function validPhone() {
    if (/^7[05678]\d{7}$/.test(digits)) return true
    setStep("phone")
    setError("Entrez un numéro à 9 chiffres, par exemple 77 123 45 67.")
    return false
  }

  function sendCode() {
    if (!validPhone()) return
    setError(null)
    setStep("code")
  }

  function switchCodeLength(length: number) {
    setCodeLength(length)
    setCode("")
    setError(null)
    codeRef.current?.focus()
  }

  async function requestAccess() {
    if (requesting || !validPhone()) return
    setRequesting(true)
    setError(null)
    try {
      const body: AccessRequestRequest = { firmSlug: FIRM_SLUG, phone: digits }
      await api<AccessRequestResponse>("/access-request", { method: "POST", auth: false, json: body })
      setAccessRequested(true)
      setCodeLength(ACCESS_CODE_LENGTH)
      setCode("")
      setStep("code")
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "INVALID_PHONE") setStep("phone")
      // TOO_MANY_ATTEMPTS: the server's message says when to try again.
      setError(failure instanceof ApiError ? failure.message : NETWORK_MESSAGE)
    } finally {
      setRequesting(false)
    }
  }

  async function verify(value: string) {
    if (value.length < codeLength || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await signIn(digits, value)
      router.replace("/")
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : NETWORK_MESSAGE)
      // A wrong code is retyped; anything else (network, too many attempts)
      // keeps it, so "Valider" can simply be pressed again.
      if (failure instanceof ApiError && failure.status === 401) setCode("")
      codeRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper px-6 pt-[max(env(safe-area-inset-top),28px)] pb-8">
      <div className="relative -mx-6 mb-8 h-56 overflow-hidden">
        <div className="shield-mask absolute -top-10 left-1/2 h-72 w-60 -translate-x-1/2 bg-gradient-to-b from-mint-wash to-paper" />
        <Image
          src="/brand/ipm-tawfeikh.png"
          alt="IPM Tawfeikh"
          width={590}
          height={371}
          priority
          className="relative mx-auto mt-10 h-auto w-44"
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {step === "phone" ? (
          <motion.div
            key="phone"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex flex-1 flex-col"
          >
            <h1 className="figure text-[2.4rem] leading-none font-bold">Mon espace santé</h1>
            <p className="mt-2 text-ink-2">Entrez le numéro de téléphone que vous avez donné à l&apos;IPM.</p>

            <label htmlFor="phone" className="mt-8 text-sm font-medium text-ink-2">
              Numéro de téléphone
            </label>
            <div className="mt-2 flex h-16 items-center rounded-2xl bg-surface ring-1 ring-line focus-within:ring-2 focus-within:ring-mint-deep">
              <span className="figure border-r border-line px-4 text-2xl text-ink-3">+221</span>
              <input
                id="phone"
                inputMode="tel"
                autoComplete="tel-national"
                value={formatPhone(digits.slice(0, 9))}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendCode()}
                placeholder="77 123 45 67"
                className="figure h-full min-w-0 flex-1 bg-transparent px-4 text-[1.75rem] font-semibold tracking-wide outline-none placeholder:text-ink-3/50"
              />
            </div>
            {error && <p className="mt-3 text-sm font-medium text-red">{error}</p>}

            <div className="mt-auto space-y-3 pt-10">
              <Button onClick={sendCode} className="h-14 w-full rounded-2xl text-lg font-semibold">
                Recevoir le code par SMS
              </Button>
              <Button
                variant="ghost"
                onClick={() => void requestAccess()}
                disabled={requesting}
                className="h-12 w-full rounded-2xl text-base text-teal"
              >
                {requesting && <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" />}
                Je ne reçois pas le code
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="code"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className="flex flex-1 flex-col"
          >
            <div className="mb-4">
              <BackLink onClick={() => { setStep("phone"); setCode(""); setError(null); setAccessRequested(false); setCodeLength(SMS_CODE_LENGTH) }} />
            </div>
            {codeLength === ACCESS_CODE_LENGTH ? (
              <>
                <h1 className="figure text-[2.4rem] leading-none font-bold">Code d&apos;accès</h1>
                <p className="mt-2 text-ink-2">Le code à 6 chiffres que votre IPM vous a communiqué, pour le {formatPhone(digits)}.</p>
              </>
            ) : (
              <>
                <h1 className="figure text-[2.4rem] leading-none font-bold">Code reçu par SMS</h1>
                <p className="mt-2 text-ink-2">Envoyé au {formatPhone(digits)}.</p>
              </>
            )}
            {accessRequested && (
              <p role="status" className="mt-4 rounded-2xl bg-mint-wash p-4 text-[0.95rem] text-teal-deep">
                Votre demande a été transmise à votre IPM. Un gestionnaire vous communiquera un code d&apos;accès à saisir ici.
              </p>
            )}

            <label htmlFor="code" className="sr-only">Code à {codeLength} chiffres</label>
            <div className="relative mt-8" onClick={() => codeRef.current?.focus()}>
              <input
                ref={codeRef}
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={codeLength}
                value={code}
                disabled={submitting}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, codeLength)
                  setCode(v)
                  setError(null)
                  if (v.length === codeLength) void verify(v)
                }}
                className="absolute inset-0 opacity-0"
              />
              <div className={`grid gap-3 ${codeLength === ACCESS_CODE_LENGTH ? "grid-cols-6" : "grid-cols-4"}`} aria-hidden>
                {Array.from({ length: codeLength }, (_, i) => (
                  <div
                    key={i}
                    className={`figure flex items-center justify-center rounded-2xl bg-surface font-bold ring-1 ${
                      codeLength === ACCESS_CODE_LENGTH ? "h-16 text-[2rem]" : "h-20 text-[2.6rem]"
                    } ${i === code.length ? "ring-2 ring-mint-deep" : "ring-line"}`}
                  >
                    {code[i] ?? ""}
                  </div>
                ))}
              </div>
            </div>
            {error && <p className="mt-3 text-sm font-medium text-red">{error}</p>}

            <div className="mt-auto space-y-3 pt-10">
              <Button
                onClick={() => void verify(code)}
                disabled={code.length < codeLength || submitting}
                className="h-14 w-full rounded-2xl text-lg font-semibold"
              >
                {submitting && <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" />}
                {submitting ? "Vérification…" : "Valider"}
              </Button>
              {codeLength === SMS_CODE_LENGTH ? (
                <div className="grid gap-1">
                  <Button
                    variant="ghost"
                    onClick={() => void requestAccess()}
                    disabled={requesting}
                    className="h-12 w-full rounded-2xl text-base text-teal"
                  >
                    {requesting && <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" />}
                    Je ne reçois pas le code : demander un code d&apos;accès
                  </Button>
                  <Button variant="ghost" onClick={() => switchCodeLength(ACCESS_CODE_LENGTH)} className="h-10 w-full rounded-2xl text-sm text-ink-2">
                    J&apos;ai déjà un code d&apos;accès
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => switchCodeLength(SMS_CODE_LENGTH)} className="h-10 w-full rounded-2xl text-sm text-ink-2">
                  Saisir le code reçu par SMS
                </Button>
              )}
              {DEMO_CODE && (
                <p className="text-center text-sm text-ink-3">
                  Démo : le code est <span className="figure text-base font-semibold text-teal">{DEMO_CODE}</span>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
