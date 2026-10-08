import type { Metadata } from "next"
import { PrestataireShell } from "@/components/prestataire/shell"
import { PrestataireProvider } from "@/lib/prestataire/session"

export const metadata: Metadata = {
  title: "IPM Tawfeikh — Espace pharmacie",
  description: "Validez les bons de pharmacie des participants de l'IPM Tawfeikh.",
  robots: { index: false, follow: false },
}

/** The pharmacy's space: its own session, its own guard, no participant screen. */
export default function PrestataireLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrestataireProvider>
      <PrestataireShell>{children}</PrestataireShell>
    </PrestataireProvider>
  )
}
