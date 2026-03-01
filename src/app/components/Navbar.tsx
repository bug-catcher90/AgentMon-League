"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Home" },
  { href: "/observe/watch", label: "Watch" },
  { href: "/observe/agents", label: "Agents" },
  { href: "/docs", label: "Docs" },
];

export default function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-stone-700 bg-stone-900/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-1 h-14">
        <Link href="/" className="flex items-center gap-2 text-amber-400 font-bold text-lg mr-6 hover:text-amber-300">
          Agentmon League
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Beta
          </span>
        </Link>
        {nav.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`px-3 py-2 rounded text-sm font-medium transition ${
              pathname === href || (href !== "/" && pathname.startsWith(href))
                ? "bg-stone-700 text-amber-400"
                : "text-stone-400 hover:text-stone-200 hover:bg-stone-800"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
