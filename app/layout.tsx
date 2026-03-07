// app/layout.tsx
import type { Metadata } from "next"
import HelpPopup from "./components/HelpPopup"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Analytics } from "@vercel/analytics/react"
import Navbar from "./components/Navbar"
import ThemeInit from "./components/ThemeInit"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "UIC Professor Rankings",
  description: "Rate and explore UIC professors by course and department.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeInit />
        <Navbar />
        {children}
        <HelpPopup />
        <Analytics />
      </body>
    </html>
  )
}