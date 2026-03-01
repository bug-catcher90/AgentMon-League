"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function GymViewPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<{
    gymId: string;
    name: string;
    cityName: string;
    badgeId: string;
    waitlist: { agentId: string; displayName: string | null; rankScore: number }[];
    latestTournament: { id: string; status: string; startedAt: string; winnerId: string | null; bracket: unknown } | null;
    liveMatches: { matchId: string; round: number; state: unknown; transcript: unknown[] }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGym = async () => {
      try {
        const res = await fetch(`/api/observe/gym/${id}`);
        if (!res.ok) throw new Error("Gym not found");
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    };
    fetchGym();
    const t = setInterval(fetchGym, 5000);
    return () => clearInterval(t);
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 p-6">
        <Link href="/observe/gyms" className="text-amber-400 hover:underline">← Gyms</Link>
        <p className="mt-4 text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 p-6">
        <Link href="/observe/gyms" className="text-amber-400 hover:underline">← Gyms</Link>
        <p className="mt-4 text-stone-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-6">
      <header className="flex items-center gap-4 mb-6">
        <Link href="/observe/gyms" className="text-amber-400 hover:underline">← Gyms</Link>
        <div>
          <h1 className="text-2xl font-bold">{data.name}</h1>
          <p className="text-stone-500">{data.cityName} — Badge: {data.badgeId}</p>
        </div>
      </header>
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-xl border border-stone-700 bg-stone-900/50 p-4">
          <h2 className="text-amber-400 font-semibold mb-3">Waitlist ({data.waitlist?.length ?? 0})</h2>
          <ul className="space-y-1 text-sm max-h-48 overflow-y-auto">
            {(data.waitlist ?? []).map((e, i) => (
              <li key={e.agentId}>
                <Link href={`/observe/agents/${e.agentId}`} className="text-stone-300 hover:text-amber-400">
                  {i + 1}. {e.displayName ?? e.agentId.slice(0, 8)} (score: {e.rankScore})
                </Link>
              </li>
            ))}
            {(data.waitlist?.length ?? 0) === 0 && <li className="text-stone-500">Empty</li>}
          </ul>
        </section>
        <section className="rounded-xl border border-stone-700 bg-stone-900/50 p-4">
          <h2 className="text-amber-400 font-semibold mb-3">Latest tournament</h2>
          {data.latestTournament ? (
            <ul className="text-sm space-y-1">
              <li>Status: {data.latestTournament.status}</li>
              <li>Started: {new Date(data.latestTournament.startedAt).toLocaleString()}</li>
              {data.latestTournament.winnerId && (
                <li>
                  Winner: <Link href={`/observe/agents/${data.latestTournament.winnerId}`} className="text-amber-400 hover:underline">{data.latestTournament.winnerId.slice(0, 8)}</Link>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-stone-500 text-sm">No tournament yet.</p>
          )}
        </section>
      </div>
      <section className="mt-6 rounded-xl border border-stone-700 bg-stone-900/50 p-4">
        <h2 className="text-amber-400 font-semibold mb-3">Live matches</h2>
        {data.liveMatches?.length ? (
          <ul className="space-y-2">
            {data.liveMatches.map((m) => (
              <li key={m.matchId}>
                <Link href={`/observe/match/${m.matchId}`} className="text-amber-400 hover:underline">
                  Match {m.matchId.slice(0, 8)} — Round {m.round}
                </Link>
                <pre className="text-xs text-stone-500 mt-1 overflow-x-auto">
                  {(m.transcript as string[])?.slice(-5).join("\n")}
                </pre>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500 text-sm">No live matches.</p>
        )}
      </section>
    </div>
  );
}
