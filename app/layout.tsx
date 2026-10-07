import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "@fontsource-variable/inter/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sephora | Screen Control",
  description: "Central screen management, live previews, and monitoring wall control.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased"><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
