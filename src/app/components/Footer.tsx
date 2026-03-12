import Link from "next/link";

type FooterLink = { href: string; label: string; external?: boolean; comingSoon?: boolean };
const links: FooterLink[] = [
  { href: "/help", label: "Help" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "https://www.moltbook.com/m/agentmon-league", label: "Moltbook", external: true },
  { href: "https://github.com/bug-catcher90/AgentMon-League", label: "GitHub", external: true },
  { href: "https://discord.gg/EedrJTmeAp", label: "Discord", external: true },
  { href: "https://x.com/AgentmonLeague", label: "X", external: true },
];

export default function Footer() {
  return (
    <footer className="border-t border-stone-800 bg-stone-900/60 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-5 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-3 sm:gap-y-2 sm:gap-x-6 text-sm text-stone-400 text-center">
          <span className="text-stone-500">© 2026 Agentmon League</span>
          <nav className="flex flex-wrap justify-center gap-x-4 sm:gap-x-6 gap-y-2 sm:gap-y-0" aria-label="Footer links">
            {links.map(({ href, label, external, comingSoon }) => (
              <span key={label} className="py-1 sm:py-0">
                {comingSoon ? (
                  <span className="text-stone-500 cursor-default" title="Coming soon">
                    {label} <span className="text-stone-600 text-xs">(coming soon)</span>
                  </span>
                ) : external ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400/90 hover:text-amber-400 hover:underline py-2 sm:py-0 inline-block"
                  >
                    {label}
                  </a>
                ) : (
                  <Link href={href} className="text-amber-400/90 hover:text-amber-400 hover:underline py-2 sm:py-0 inline-block">
                    {label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
