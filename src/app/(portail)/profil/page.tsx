"use client"

import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { Call02Icon, Logout03Icon } from "@hugeicons/core-free-icons"
import { PageHeader } from "@/components/portal/app-shell"
import { Avatar } from "@/components/portal/avatar"
import { Button } from "@/components/ui/button"
import { useStore } from "@/lib/store"
import { longDate } from "@/lib/format"

export default function ProfilPage() {
  const router = useRouter()
  const { db, session, signOut } = useStore()
  const member = db.members.find((m) => m.id === session!.memberId)!
  const person = db.persons.find((p) => p.id === member.personId)!
  const employer = db.employers.find((e) => e.id === member.employerId)!
  // No formule for an employer on a negotiated flat rate.
  const plan = employer.planId ? db.plans.find((p) => p.id === employer.planId) : undefined

  const rows: Array<[string, string]> = [
    ["Matricule", member.matricule],
    ["Employeur", employer.name],
    ["Formule", plan?.name ?? "Tarif négocié par l'employeur"],
    ["Affilié depuis", longDate(member.affiliationDate)],
    ["Téléphone", person.phone?.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4") ?? "—"],
  ]

  return (
    <div>
      <PageHeader title="Profil" />
      <div className="mt-2 space-y-4 px-4">
        <section className="flex items-center gap-4 rounded-3xl bg-surface p-5 ring-1 ring-line">
          <Avatar person={person} className="size-16 text-2xl" />
          <div>
            <p className="figure text-2xl font-bold">{person.firstName} {person.lastName}</p>
            <p className="text-ink-3">{member.jobTitle}</p>
          </div>
        </section>
        <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <dl className="space-y-3">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-ink-3">{label}</dt>
                <dd className="figure text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <a href="tel:+221338014929" className="flex items-center gap-3 rounded-3xl bg-mint-wash p-5 text-teal-deep">
          <HugeiconsIcon icon={Call02Icon} className="size-6" />
          <span>
            <span className="block font-semibold">Une question ? Appelez l&apos;IPM</span>
            <span className="block text-sm">Du lundi au vendredi, 8 h à 17 h</span>
          </span>
        </a>
        <div className="grid gap-2 pt-2">
          <Button
            variant="ghost"
            className="h-12 rounded-2xl text-red hover:bg-red-tint hover:text-red"
            onClick={() => {
              signOut()
              router.replace("/connexion")
            }}
          >
            <HugeiconsIcon icon={Logout03Icon} className="size-5" /> Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  )
}
