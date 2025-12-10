import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import SessionInitializer from "@/components/SessionInitializer";
import AppHeader from "@/components/AppHeader";
import SidebarNav from "@/components/SidebarNav";
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
  title: "Customer Service Demo",
  description: "Customer Service Demo with support agent and user view",
  icons: {
    icon: "/openai_logo.svg",
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
      >
        <SessionInitializer />
        <div className="flex min-h-screen w-full bg-gray-200 text-stone-900">
          <SidebarNav />
          <div className="flex min-h-screen flex-1 flex-col">
            <AppHeader />
            <main className="flex-1 overflow-y-auto pb-6">{children}</main>
          </div>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
