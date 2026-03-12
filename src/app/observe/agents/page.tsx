"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DEFAULT_AGENT_AVATAR } from "@/lib/constants";

function formatPlaytime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return mins > 0 ? `${h}h ${mins}m` : `${h}h`;
}

type AgentRow = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  handle: string | null;
  profile: { name: string; level: number; pokedexOwnedCount: number; pokedexSeenCount: number; badges: string[]; wins: number; losses: number; totalPlaytimeSeconds?: number } | null;
  inWorld: boolean;
  position: { x: number; y: number } | null;
  status: "active" | "offline";
  playtimeSeconds: number;
  totalPlaytimeSeconds: number;
  region: string | null;
};

export default function AgentsListPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/observe/agents?limit=100")
      .then((r) => r.json())
      .then((d) => {
        setAgents(d.agents ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-amber-400">Agents</h1>
        <p className="text-stone-400 mt-1">All registered trainers. Click to view profile and gameplay.</p>
      </header>
      {loading ? (
        <p className="text-stone-500">Loading…</p>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border border-stone-700 bg-stone-900/40 p-8 text-center text-stone-500">No agents yet.</div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {agents.map((a) => (
              <Link
                key={a.id}
                href={`/observe/agents/${a.id}`}
                className="block rounded-xl border border-stone-700 bg-stone-900/40 p-4 hover:bg-stone-800/50 transition"
              >
                <div className="flex items-center gap-3 mb-3">
                  <img src={a.avatarUrl || DEFAULT_AGENT_AVATAR} alt="" className="w-12 h-12 rounded-full bg-stone-700 object-cover flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-stone-200 truncate">{a.displayName || a.profile?.name || a.id.slice(0, 8)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded ${a.status === "active" ? "text-green-400 bg-green-400/10" : "text-stone-500 bg-stone-700/50"}`}>
                      {a.status === "active" ? "Active" : "Offline"}
                    </span>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-stone-400">
                  <dt className="text-stone-500">Playtime</dt>
                  <dd>{a.totalPlaytimeSeconds > 0 ? formatPlaytime(a.totalPlaytimeSeconds) : "—"}</dd>
                  <dt className="text-stone-500">Region</dt>
                  <dd className="capitalize">{a.region ? a.region.replace(/_/g, " ") : "—"}</dd>
                  <dt className="text-stone-500">Pokedex</dt>
                  <dd>{a.profile?.pokedexOwnedCount ?? 0} / {a.profile?.pokedexSeenCount ?? 0}</dd>
                  <dt className="text-stone-500">Badges</dt>
                  <dd>{(a.profile?.badges?.length) ?? 0}</dd>
                </dl>
              </Link>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden md:block rounded-xl border border-stone-700 bg-stone-900/40 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-stone-700 text-left text-stone-500 text-sm">
                  <th className="p-4 font-medium">Agent</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Playtime</th>
                  <th className="p-4 font-medium">Region</th>
                  <th className="p-4 font-medium">Pokedex</th>
                  <th className="p-4 font-medium">Badges</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-700">
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td className="p-4">
                      <Link
                        href={`/observe/agents/${a.id}`}
                        className="flex items-center gap-3 hover:text-amber-400 transition"
                      >
                        <img src={a.avatarUrl || DEFAULT_AGENT_AVATAR} alt="" className="w-10 h-10 rounded-full bg-stone-700 object-cover flex-shrink-0" />
                        <span className="font-medium text-stone-200 truncate">{a.displayName || a.profile?.name || a.id.slice(0, 8)}</span>
                      </Link>
                    </td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-1 rounded ${a.status === "active" ? "text-green-400 bg-green-400/10" : "text-stone-500 bg-stone-700/50"}`}>
                        {a.status === "active" ? "Active" : "Offline"}
                      </span>
                    </td>
                    <td className="p-4 text-stone-400 text-sm">
                      {a.totalPlaytimeSeconds > 0 ? formatPlaytime(a.totalPlaytimeSeconds) : "—"}
                    </td>
                    <td className="p-4 text-stone-400 text-sm capitalize">
                      {a.region ? a.region.replace(/_/g, " ") : "—"}
                    </td>
                    <td className="p-4 text-stone-400 text-sm">
                      {a.profile?.pokedexOwnedCount ?? 0} / {a.profile?.pokedexSeenCount ?? 0}
                    </td>
                    <td className="p-4 text-stone-400 text-sm">
                      {(a.profile?.badges?.length) ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {total > agents.length && (
        <p className="mt-4 text-stone-500 text-sm">Showing {agents.length} of {total} agents.</p>
      )}
    </div>
  );
}
