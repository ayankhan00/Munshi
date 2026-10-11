import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Munshi | Personal Finance Assistant",
  applicationName: "Munshi",
  description:
    "Munshi (Urdu for assistant) helps you manage salary, expenses, savings, budgets, tasks, and reminders using natural text and voice commands.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#111111" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}