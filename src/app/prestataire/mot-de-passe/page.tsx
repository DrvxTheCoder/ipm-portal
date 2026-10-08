"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Loading03Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/prestataire/field"
import { PrestataireHeader } from "@/components/prestataire/shell"
import { usePrestataire } from "@/lib/prestataire/session"
import { ApiError, NETWORK_MESSAGE } from "@/lib/api"

/** Same rules as the server's `passwordProblem`, checked before sending. */
const MIN_LENGTH = 10

function problem(password: string, code: string): string | null {
  if (password.length < MIN_LENGTH) return `Au moins ${MIN_LENGTH} caractères.`
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Des lettres et des chiffres."
  if (code && password.toUpperCase().includes(code.toUpperCase())) return "Sans le code prestataire."
  return null
}

/**
 * Required after a creation or a reset: until the temporary password is
 * replaced, the server answers nothing else, and the shell shows nothing else.
 */
export default function PrestatairePasswordPage() {
  const { session, changePassword } = usePrestataire()
  const router = useRouter()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string; form?: string }>({})
  const code = session?.provider.code ?? ""

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    const nextProblem = problem(next, code)
    const mismatch = next !== confirm ? "Les deux mots de passe ne correspondent pas." : undefined
    if (nextProblem || mismatch || !current) {
      setErrors({ current: current ? undefined : "Saisissez le mot de passe reçu.", next: nextProblem ?? undefined, confirm: mismatch })
      return
    }
    setSubmitting(true)
    setErrors({})
    try {
      await changePassword({ currentPassword: current, newPassword: next })
      router.replace("/prestataire")
    } catch (failure) {
      if (failure instanceof ApiError && !failure.isNetwork) {
        setErrors({
          current: failure.fields.currentPassword?.[0],
          next: failure.fields.newPassword?.[0],
          form: failure.fields.currentPassword || failure.fields.newPassword ? undefined : failure.message,
        })
      } else {
        setErrors({ form: NETWORK_MESSAGE })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <PrestataireHeader title="Nouveau mot de passe" />
      <form onSubmit={(e) => void submit(e)} className="flex flex-1 flex-col px-5">
        <p className="text-ink-2">
          Le mot de passe remis par l&apos;IPM est provisoire. Choisissez le vôtre pour continuer : au moins {MIN_LENGTH} caractères, avec des lettres et des chiffres.
        </p>

        <Field
          id="current"
          label="Mot de passe provisoire"
          type="password"
          className="mt-6"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current}
          disabled={submitting}
        />
        <Field
          id="next"
          label="Nouveau mot de passe"
          type="password"
          className="mt-4"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={errors.next}
          disabled={submitting}
        />
        <Field
          id="confirm"
          label="Confirmer le nouveau mot de passe"
          type="password"
          className="mt-4"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          disabled={submitting}
        />

        {errors.form && (
          <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-red-tint p-4 text-[0.95rem] text-red">
            <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-5 shrink-0" />
            {errors.form}
          </p>
        )}

        <Button type="submit" disabled={submitting} aria-busy={submitting} className="mt-auto mb-2 h-14 w-full rounded-2xl text-lg font-semibold">
          {submitting && <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" />}
          {submitting ? "Enregistrement…" : "Enregistrer et continuer"}
        </Button>
      </form>
    </div>
  )
}
