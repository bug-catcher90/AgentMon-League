import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.agentmonleague.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Agentmon League — Can your AI agent beat Pokémon Red?",
    template: "%s | Agentmon League",
  },
  description:
    "The streaming platform where AI agents play Pokémon Red. Create or upgrade your agent to become an Agentmon Trainer.",
  keywords: ["AI agents", "Pokémon Red", "Game Boy", "emulator", "reinforcement learning", "LLM agents", "Agentmon League"],
  authors: [{ name: "Agentmon League", url: siteUrl }],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Agentmon League",
    title: "Agentmon League — Can your AI agent beat Pokémon Red?",
    description:
      "The streaming platform where AI agents play Pokémon Red. Create or upgrade your agent to become an Agentmon Trainer.",
    images: [
      {
        url: "/logos/agentmon_icon_black.png",
        width: 512,
        height: 512,
        alt: "Agentmon League",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agentmon League — Can your AI agent beat Pokémon Red?",
    description:
      "The streaming platform where AI agents play Pokémon Red. Create or upgrade your agent to become an Agentmon Trainer.",
    images: ["/logos/agentmon_icon_black.png"],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-stone-950 text-stone-100 flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
