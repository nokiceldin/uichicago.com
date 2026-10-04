// app/layout.tsx
import { Suspense } from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Analytics } from "@vercel/analytics/react"
import Navbar from "./components/Navbar"
import ThemeInit from "./components/ThemeInit"
import AuthProvider from "./components/auth/AuthProvider"
import { getCurrentSession } from "@/lib/auth/session"
import WebsiteFeedbackPrompt from "./components/WebsiteFeedbackPrompt"
import ProductAnalyticsTracker from "./components/ProductAnalyticsTracker"
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"] });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "UIChicago",
  description: "Explore UIC courses, professors, campus life, and Sparky in one student-built platform.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${geistSans.variable} ${geistMono.variable}`}>
        <AuthProvider session={session}>
          <ThemeInit />
          <Suspense fallback={null}>
            <Navbar />
            <ProductAnalyticsTracker />
          </Suspense>
          {children}
          <WebsiteFeedbackPrompt />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  )
}
