"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { BackLink } from "@/components/portal/app-shell"
import { useStore } from "@/lib/store"

/**
 * Connexion par numéro de téléphone et code SMS — no password to forget,
 * nothing to type but digits. PortalAccount.phone is Person.phone at
 * activation. In the prototype the code is shown on screen.
 */
const DEMO_CODE = "2026"

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
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ready && session) router.replace("/")
  }, [ready, session, router])

  useEffect(() => {
    if (step === "code") codeRef.current?.focus()
  }, [step])

  const digits = phone.replace(/\D/g, "")

  function sendCode() {
    if (!/^7[05678]\d{7}$/.test(digits)) {
      setError("Entrez un numéro à 9 chiffres, par exemple 77 123 45 67.")
      return
    }
    setError(null)
    setStep("code")
  }

  function verify(value: string) {
    if (value.length < 4) return
    if (value !== DEMO_CODE) {
      setError("Ce code ne correspond pas. Vérifiez le SMS reçu.")
      setCode("")
      return
    }
    if (!signIn(digits)) {
      setError("Aucun compte IPM n'est lié à ce numéro. Contactez votre gestionnaire.")
      setStep("phone")
      setCode("")
      return
    }
    router.replace("/")
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
              <p className="text-center text-sm text-ink-3">
                Démo : <button className="font-semibold text-teal underline-offset-2 hover:underline" onClick={() => setPhone("771234567")}>77 123 45 67</button>
              </p>
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
              <BackLink onClick={() => { setStep("phone"); setCode(""); setError(null) }} />
            </div>
            <h1 className="figure text-[2.4rem] leading-none font-bold">Code reçu par SMS</h1>
            <p className="mt-2 text-ink-2">Envoyé au {formatPhone(digits)}.</p>

            <label htmlFor="code" className="sr-only">Code à 4 chiffres</label>
            <div className="relative mt-8" onClick={() => codeRef.current?.focus()}>
              <input
                ref={codeRef}
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 4)
                  setCode(v)
                  setError(null)
                  if (v.length === 4) verify(v)
                }}
                className="absolute inset-0 opacity-0"
              />
              <div className="grid grid-cols-4 gap-3" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`figure flex h-20 items-center justify-center rounded-2xl bg-surface text-[2.6rem] font-bold ring-1 ${
                      i === code.length ? "ring-2 ring-mint-deep" : "ring-line"
                    }`}
                  >
                    {code[i] ?? ""}
                  </div>
                ))}
              </div>
            </div>
            {error && <p className="mt-3 text-sm font-medium text-red">{error}</p>}

            <p className="mt-auto pt-10 text-center text-sm text-ink-3">
              Démo : le code est <span className="figure text-base font-semibold text-teal">{DEMO_CODE}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
