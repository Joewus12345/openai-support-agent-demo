import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import SessionInitializer from "@/components/SessionInitializer";
import Toaster from "@/components/Toaster";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "TAGG Support Operations",
    template: "%s | TAGG Support Operations",
  },
  description: "Secure, multi-account customer support operations by TAGG.",
  icons: {
    icon: [{ url: "/download%20(3).png", type: "image/png", sizes: "28x28" }],
    shortcut: "/download%20(3).png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        // Password-manager and keyboard-shortcut extensions can add body
        // attributes before hydration. The app itself renders deterministic markup.
        suppressHydrationWarning
      >
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-background px-4 py-2 text-sm font-medium shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <SessionInitializer />
        <main id="main-content" className="min-h-screen bg-background text-foreground">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
