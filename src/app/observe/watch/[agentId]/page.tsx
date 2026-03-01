"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

function formatPlaytime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return mins > 0 ? `${h}h ${mins}m` : `${h}h`;
}

function LiveFrame({ agentId }: { agentId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [failCount, setFailCount] = useState(0);

  useEffect(() => {
    setErr(false);
    setFailCount(0);
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setSrc(`/api/observe/emulator/frame?agentId=${encodeURIComponent(agentId)}&t=${Date.now()}`);
    };
    tick();
    const interval = setInterval(tick, 40);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [agentId]);

  const handleError = () => setFailCount((c) => c + 1) || setErr(true);
  const handleLoad = () => {
    setErr(false);
    setFailCount(0);
  };

  if (err && failCount >= 3) {
    return (
      <div className="flex items-center justify-center h-full min-h-[320px] text-stone-500 text-sm">
        Session ended or unavailable.
      </div>
    );
  }

  return (
    <img
      src={src ?? ""}
      alt="Game screen"
      className="w-full h-full object-fill block"
      style={{ imageRendering: "pixelated", width: 640, height: 576 }}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
}

export default function WatchAgentPage() {
  const params = useParams();
  const agentId = params.agentId as string;
  const [session, setSession] = useState<{ displayName: string; sessionTimeSeconds?: number; pokedexOwned?: number; pokedexSeen?: number; badges?: number; mapName?: string } | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/observe/emulator/sessions", { cache: "no-store" });
      const data = await res.json();
      const sessions = data.sessions ?? [];
      const s = sessions.find((x: { agentId: string }) => x.agentId === agentId);
      if (s) setSession({ displayName: s.displayName ?? agentId.slice(0, 8), sessionTimeSeconds: s.sessionTimeSeconds, pokedexOwned: s.pokedexOwned, pokedexSeen: s.pokedexSeen, badges: s.badges, mapName: s.mapName });
      else setSession(null);
    } catch {
      setSession(null);
    }
  }, [agentId]);

  useEffect(() => {
    fetchSession();
    const t = setInterval(fetchSession, 3000);
    return () => clearInterval(t);
  }, [fetchSession]);

  const name = session?.displayName ?? agentId.slice(0, 8);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
      <header className="border-b border-stone-700 px-4 py-3 flex items-center gap-4 flex-wrap">
        <Link href="/observe/watch" className="text-amber-400 hover:underline">← Watch</Link>
        <h1 className="text-xl font-semibold text-amber-400">{name}</h1>
        {session && (
          <span className="text-stone-500 text-sm">
            {formatPlaytime(session.sessionTimeSeconds ?? 0)} · {session.pokedexOwned ?? 0}/{session.pokedexSeen ?? 0} Pokedex · {session.badges ?? 0} badges
            {session.mapName && ` · ${session.mapName}`}
          </span>
        )}
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="rounded-xl border-2 border-stone-600 bg-stone-900 overflow-hidden">
          <div className="block overflow-hidden" style={{ width: 640, height: 576 }}>
            <LiveFrame agentId={agentId} />
          </div>
          <div className="p-2 border-t border-stone-700 text-center text-xs text-stone-500">
            Game Boy · Pokémon Red
          </div>
        </div>
      </main>
    </div>
  );
}
