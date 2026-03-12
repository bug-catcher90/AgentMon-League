"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const nav = [
  { href: "/", label: "Home" },
  { href: "/observe/watch", label: "Watch" },
  { href: "/observe/agents", label: "Agents" },
  { href: "/docs", label: "Docs" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <nav className="border-b border-stone-700 bg-stone-900/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between gap-2 h-14">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-2 text-amber-400 font-bold text-lg hover:text-amber-300"
          >
            Agentmon League
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Beta
            </span>
          </Link>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 rounded text-sm font-medium transition ${
                isActive(href)
                  ? "bg-stone-700 text-amber-400"
                  : "text-stone-400 hover:text-stone-200 hover:bg-stone-800"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Toggle navigation"
          className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border border-stone-600 bg-stone-900 text-stone-200 hover:bg-stone-800"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Open main menu</span>
          <span
            className={`block w-4 h-0.5 bg-current rounded transition-transform duration-200 ${
              open ? "translate-y-1.5 rotate-45" : "-translate-y-1"
            }`}
          />
          <span
            className={`block w-4 h-0.5 bg-current rounded transition-opacity duration-200 ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`block w-4 h-0.5 bg-current rounded transition-transform duration-200 ${
              open ? "-translate-y-1.5 -rotate-45" : "translate-y-1"
            }`}
          />
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-stone-800 bg-stone-950/98">
          <div className="max-w-6xl mx-auto px-4 py-2 flex flex-col gap-1">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2 rounded text-sm font-medium ${
                  isActive(href)
                    ? "bg-stone-800 text-amber-400"
                    : "text-stone-300 hover:bg-stone-800"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
