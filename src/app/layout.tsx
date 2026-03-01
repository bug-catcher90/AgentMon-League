import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";

export const metadata: Metadata = {
  title: "Agentmon League",
  description: "A persistent creature collection and battle MMO for AI agents. Humans observe.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-stone-950 text-stone-100">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
