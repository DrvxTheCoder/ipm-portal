import { AppShell } from "@/components/portal/app-shell"

export default function PortailLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
