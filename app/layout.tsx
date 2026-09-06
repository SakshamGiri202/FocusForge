import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Kalam, Playfair_Display } from "next/font/google";
import { HeroProvider } from "@/lib/hero";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const kalam = Kalam({
  variable: "--font-kalam",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

export const metadata: Metadata = {
  title: "FocusForge — A Chronicle of Tiny Victories",
  description:
    "An adaptive fantasy chronicle where every tiny real-world victory becomes part of your story.",
};

export const viewport: Viewport = {
  themeColor: "#07080d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${playfair.variable} ${kalam.variable} h-full antialiased`}
    >
      <body className="tome-bg tome-vignette grain min-h-full">
        <HeroProvider>{children}</HeroProvider>
      </body>
    </html>
  );
}