import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { CookieProvider } from "@/components/CookieProvider";
import { PageVisibilityProvider } from "@/contexts/PageVisibilityContext";
import { LockedPagePopup } from "@/components/LockedPagePopup";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AU-Monitoring - Course Monitoring",
  description: "Assumption University Student Registration & Monitoring Platform",
  icons: {
    icon: "/au-monitor-big.png",
    apple: "/au-monitor-big.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased overflow-x-hidden`}
      >
        <PageVisibilityProvider>
          {children}
          <LockedPagePopup />
        </PageVisibilityProvider>
        <CookieProvider />
        <div id="modal-root" />
      </body>
    </html>
  )
}
