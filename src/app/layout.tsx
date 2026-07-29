import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ConfigureAmplify from "@/components/ConfigureAmplify";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SEC Filing Analyst",
  description:
    "Ask questions about SEC filings in plain English, compare companies on the numbers, and track how risk language changes over time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      {/* suppressHydrationWarning is scoped to this one element's own
          attributes only — it won't hide a real mismatch anywhere else in
          the tree. Needed because extensions like Grammarly inject
          data-gr-ext-installed / data-new-gr-c-s-check-loaded onto <body>
          before React hydrates, which otherwise trips this exact warning
          on every load regardless of anything in this app's own code. */}
      <body
        className="min-h-full flex flex-col"
        suppressHydrationWarning
      >
        <ConfigureAmplify />
        {children}
      </body>
    </html>
  );
}
