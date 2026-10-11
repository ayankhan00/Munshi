import "./globals.css";

import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Munshi | Personal Finance Assistant",
  applicationName: "Munshi",
  description:
    "Munshi (Urdu for assistant) helps you manage salary, expenses, savings, budgets, tasks, and reminders using natural text and voice commands.",
  appleWebApp: {
    capable: true,
    title: "Munshi",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('munshi:theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();",
          }}
        />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}