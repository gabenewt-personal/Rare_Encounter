import type { Metadata, Viewport } from "next";
import { Pixelify_Sans, Press_Start_2P } from "next/font/google";
import "./globals.css";

const display = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Pixelify_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Rare Encounter — the daily Pokémon rarity game",
  description: "Five Pokémon prompts a day. The rarer your correct answer, the higher your score.",
  appleWebApp: { capable: true, title: "Rare Encounter", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b231d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
