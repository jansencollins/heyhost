import type { Metadata } from "next";
import { PT_Sans_Caption, Nunito } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const ptSansCaption = PT_Sans_Caption({
  variable: "--font-pt-sans-caption",
  subsets: ["latin"],
  weight: ["700"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["600"],
});

export const metadata: Metadata = {
  title: "HeyHost - Interactive Trivia Games",
  description: "Create and host live trivia games for any audience",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${ptSansCaption.variable} ${nunito.variable}`}>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
