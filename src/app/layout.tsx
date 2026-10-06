import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Scanner — Remote Job Hunter with AI",
  description:
    "AI-powered remote job scanner that matches jobs to your profile, generates cover letters, and notifies you on WhatsApp. Scans 6 free job boards every hour.",
  keywords: ["job scanner", "remote jobs", "AI job matcher", "cover letter generator", "WhatsApp alerts"],
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
