import type { Metadata, Viewport } from "next"
import "@fontsource-variable/figtree"
import "@fontsource/barlow-condensed/500.css"
import "@fontsource/barlow-condensed/600.css"
import "@fontsource/barlow-condensed/700.css"
import "@fontsource/montserrat/400.css"
import "@fontsource/montserrat/700.css"
import "./globals.css"
import { Toaster } from "sonner"
import { StoreProvider } from "@/lib/store"
import { ServiceWorkerRegistration } from "@/lib/pwa"

export const metadata: Metadata = {
  title: "IPM Tawfeikh — Mon espace",
  description: "Créez vos bons de prise en charge et suivez votre couverture santé.",
  applicationName: "IPM Tawfeikh",
  appleWebApp: { capable: true, title: "IPM Tawfeikh", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eef5f3",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <StoreProvider>{children}</StoreProvider>
        <Toaster position="top-center" richColors />
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
