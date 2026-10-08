"use client"

import Image from "next/image"
import Link from "next/link"
import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, LockPasswordIcon, Loading03Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/prestataire/field"
import { usePrestataire } from "@/lib/prestataire/session"
import { ApiError, NETWORK_MESSAGE } from "@/lib/api"

/**
 * Connexion pharmacie: code prestataire and password, nothing else. One
 * sentence for any wrong pair — the server does not say which part was wrong,
 * and neither does this screen.
 */
export default function PrestataireLoginPage() {
  const { signIn } = usePrestataire()
  const router = useRouter()
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<{ locked: boolean; message: string } | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting || !code.trim() || !password) return
    setSubmitting(true)
    setError(null)
    try {
      const session = await signIn(code.trim(), password)
      router.replace(session.mustChangePassword ? "/prestataire/mot-de-passe" : "/prestataire")
    } catch (failure) {
      setPassword("")
      setError(loginError(failure))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex min-h-dvh flex-col px-6 pt-[max(env(safe-area-inset-top),20px)] pb-8">
      <Image src="/brand/ipm-tawfeikh.png" alt="IPM Tawfeikh" width={590} height={371} priority className="mx-auto mt-8 h-auto w-36" />

      <h1 className="figure mt-8 text-[2.4rem] leading-none font-bold">Espace pharmacie</h1>
      <p className="mt-2 text-ink-2">Connectez-vous avec le code prestataire et le mot de passe remis par l&apos;IPM.</p>

      <Field
        id="code"
        label="Code prestataire"
        className="mt-8"
        value={code}
        onChange={(e) => {
          setCode(e.target.value.toUpperCase())
          setError(null)
        }}
        autoComplete="username"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        disabled={submitting}
      />
      <Field
        id="password"
        label="Mot de passe"
        type="password"
        className="mt-4"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setError(null)
        }}
        autoComplete="current-password"
        disabled={submitting}
      />

      {error && (
        <p role="alert" className={`mt-4 flex gap-2 rounded-2xl p-4 text-[0.95rem] ${error.locked ? "bg-amber-tint text-amber" : "bg-red-tint text-red"}`}>
          <HugeiconsIcon icon={error.locked ? LockPasswordIcon : Alert02Icon} className="mt-0.5 size-5 shrink-0" />
          {error.message}
        </p>
      )}

      <div className="mt-auto space-y-3 pt-10">
        <Button type="submit" disabled={submitting || !code.trim() || !password} aria-busy={submitting} className="h-14 w-full rounded-2xl text-lg font-semibold">
          {submitting && <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" />}
          {submitting ? "Connexion…" : "Se connecter"}
        </Button>
        <p className="text-center text-sm text-ink-3">Mot de passe oublié ? Contactez l&apos;IPM : un gestionnaire vous en remettra un nouveau.</p>
        <p className="text-center text-sm">
          <Link href="/connexion" className="font-medium text-teal">Vous êtes participant ? Mon espace santé</Link>
        </p>
      </div>
    </form>
  )
}

function loginError(failure: unknown): { locked: boolean; message: string } {
  if (!(failure instanceof ApiError) || failure.isNetwork) return { locked: false, message: NETWORK_MESSAGE }
  if (failure.code === "ACCOUNT_LOCKED") {
    const minutes = failure.retryAfter ? Math.max(1, Math.ceil(failure.retryAfter / 60)) : null
    return {
      locked: true,
      message: `Compte bloqué temporairement après plusieurs tentatives.${minutes ? ` Réessayez dans ${minutes} min` : " Réessayez plus tard"}, ou contactez l'IPM.`,
    }
  }
  if (failure.code === "INVALID_CREDENTIALS" || failure.code === "INVALID_INPUT") {
    return { locked: false, message: "Code prestataire ou mot de passe incorrect." }
  }
  // NOT_CONFIGURED and the like: the server's sentence is meant for this screen.
  return { locked: false, message: failure.message }
}
