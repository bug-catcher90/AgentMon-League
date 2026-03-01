"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";

type SpeciesInfo = { id: string; name: string; types: string[]; spriteFront: string | null; spriteBack: string | null };
type CreatureState = { speciesId: string; currentHp: number; maxHp: number };

export default function MatchViewPage() {
  const params = useParams();
  const id = params.id as string;
  const [speciesList, setSpeciesList] = useState<SpeciesInfo[]>([]);
  const [data, setData] = useState<{
    matchId: string;
    type: string;
    status: string;
    agentA: { id: string; displayName: string | null } | null;
    agentB: { id: string; displayName: string | null } | null;
    transcript: string[];
    state: unknown;
    winnerId: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/content/species")
      .then((r) => r.ok ? r.json() : [])
      .then(setSpeciesList);
  }, []);

  useEffect(() => {
    const fetchMatch = async () => {
      try {
        const res = await fetch(`/api/observe/match/${id}`);
        if (!res.ok) throw new Error("Match not found");
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    };
    fetchMatch();
    const t = setInterval(fetchMatch, 3000);
    return () => clearInterval(t);
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 p-6">
        <Link href="/" className="text-amber-400 hover:underline">← Home</Link>
        <p className="mt-4 text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 p-6">
        <Link href="/" className="text-amber-400 hover:underline">← Home</Link>
        <p className="mt-4 text-stone-400">Loading…</p>
      </div>
    );
  }

  const state = data.state as { sides?: { creatures: CreatureState[]; activeIndex: number }[] } | undefined;
  const sideA = state?.sides?.[0];
  const sideB = state?.sides?.[1];
  const activeA = sideA?.creatures?.[sideA.activeIndex];
  const activeB = sideB?.creatures?.[sideB.activeIndex];
  const speciesMap = Object.fromEntries(speciesList.map((s) => [s.id, s]));

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-6">
      <header className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-amber-400 hover:underline">← Home</Link>
        <h1 className="text-xl font-bold">Match {data.matchId.slice(0, 8)}</h1>
        <span className="text-stone-500">{data.type} · {data.status}</span>
      </header>

      {/* Gen1-style battle layout */}
      <div className="max-w-2xl mx-auto rounded-xl border-2 border-stone-600 overflow-hidden bg-stone-900 shadow-xl">
        <div className="aspect-[4/3] bg-gradient-to-b from-sky-300 to-green-200 relative flex flex-col justify-between p-4">
          {/* Opponent (wild/trainer) – top right, front sprite */}
          <div className="flex justify-end items-start">
            {activeB && (
              <div className="text-right">
                <p className="text-sm font-medium text-stone-800 capitalize mb-1">{speciesMap[activeB.speciesId]?.name ?? activeB.speciesId}</p>
                <div className="w-24 h-24 relative flex items-center justify-center bg-stone-400/30 rounded-lg">
                  {speciesMap[activeB.speciesId]?.spriteFront ? (
                    <Image
                      src={speciesMap[activeB.speciesId].spriteFront}
                      alt=""
                      width={96}
                      height={96}
                      unoptimized
                      className="object-contain pixelated"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <span className="text-stone-600 text-xs capitalize">{activeB.speciesId}</span>
                  )}
                </div>
                <div className="mt-1 h-2 bg-stone-700 rounded overflow-hidden min-w-[80px] inline-block">
                  <div className="h-full bg-green-600 transition-all" style={{ width: `${(activeB.currentHp / activeB.maxHp) * 100}%` }} />
                </div>
                <p className="text-xs text-stone-600">{activeB.currentHp}/{activeB.maxHp}</p>
              </div>
            )}
          </div>

          {/* Player – bottom left, back sprite */}
          <div className="flex justify-start items-end">
            {activeA && (
              <div>
                <div className="w-28 h-28 relative flex items-center justify-center bg-stone-500/30 rounded-lg">
                  {speciesMap[activeA.speciesId]?.spriteBack ? (
                    <Image
                      src={speciesMap[activeA.speciesId].spriteBack}
                      alt=""
                      width={112}
                      height={112}
                      unoptimized
                      className="object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <span className="text-stone-500 text-sm capitalize">{activeA.speciesId}</span>
                  )}
                </div>
                <p className="text-sm font-medium text-stone-800 capitalize mt-1">{speciesMap[activeA.speciesId]?.name ?? activeA.speciesId}</p>
                <div className="h-2 bg-stone-700 rounded overflow-hidden min-w-[100px]">
                  <div className="h-full bg-green-600 transition-all" style={{ width: `${(activeA.currentHp / activeA.maxHp) * 100}%` }} />
                </div>
                <p className="text-xs text-stone-600">{activeA.currentHp} / {activeA.maxHp} HP</p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-stone-600 bg-stone-800 p-3">
          <p className="text-stone-400 text-sm">{data.agentA?.displayName ?? "Player"} vs {data.agentB?.displayName ?? "Wild"}</p>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-stone-700 bg-stone-900/50 p-4 max-w-2xl mx-auto">
        <h2 className="text-amber-400 font-semibold mb-3">Transcript</h2>
        <ul className="space-y-1 text-sm text-stone-400 font-mono">
          {(data.transcript ?? []).map((line: string, i: number) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        {data.winnerId && <p className="mt-3 text-amber-400">Winner: {data.winnerId}</p>}
      </section>
    </div>
  );
}
