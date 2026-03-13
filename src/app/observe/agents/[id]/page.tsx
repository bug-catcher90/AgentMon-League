"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { DEFAULT_AGENT_AVATAR } from "@/lib/constants";

type Creature = { speciesId?: string; nickname?: string; level?: number; currentHp?: number; maxHp?: number };
type InventorySlot = { itemId?: string; count?: number };
type SpeciesInfo = { id: string; name: string; spriteFront: string | null; spriteBack: string | null; dexNumber?: number };

export default function AgentProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const [speciesList, setSpeciesList] = useState<SpeciesInfo[]>([]);
  const [data, setData] = useState<{
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    profile: { name: string; level: number; badges: unknown[]; pokedexSeenCount: number; pokedexOwnedCount: number; wins: number; losses: number; gymWins: number; leagueWins: number; totalPlaytimeSeconds?: number } | null;
    state: { x: number; y: number; level: number; gold: number; party: unknown[]; badges: unknown[]; inventory: unknown[]; regionId: string | null; pokedexOwned?: number; pokedexSeen?: number } | null;
    sessionPlaytimeSeconds: number | null;
    sessionRegion: string | null;
    recentTranscript: { line: string; createdAt: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<{ id: string; label: string; version: string | null; description: string | null; byteSize: number; createdAt: string }[]>([]);
  const [datasets, setDatasets] = useState<{ id: string; label: string; version: string | null; description: string | null; format: string | null; byteSize: number; createdAt: string }[]>([]);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    fetch("/api/content/species")
      .then((r) => r.ok ? r.json() : [])
      .then(setSpeciesList);
  }, []);

  useEffect(() => {
    setAvatarError(false);
  }, [id]);

  useEffect(() => {
    const fetchAgent = async () => {
      try {
        const res = await fetch(`/api/observe/agent/${id}`);
        if (!res.ok) throw new Error("Agent not found");
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    };
    fetchAgent();
    const t = setInterval(fetchAgent, 10000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/agents/${id}/models`).then((r) => r.ok ? r.json() : { models: [] }),
      fetch(`/api/agents/${id}/datasets`).then((r) => r.ok ? r.json() : { datasets: [] }),
    ]).then(([a, b]) => {
      setModels(a.models ?? []);
      setDatasets(b.datasets ?? []);
    });
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col items-center">
        <div className="w-full max-w-4xl px-6 py-6">
          <Link href="/observe/agents" className="text-amber-400 hover:underline">← Agents</Link>
          <p className="mt-4 text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col items-center">
        <div className="w-full max-w-4xl px-6 py-6">
          <Link href="/observe/agents" className="text-amber-400 hover:underline">← Agents</Link>
          <p className="mt-4 text-stone-400">Loading…</p>
        </div>
      </div>
    );
  }

  const p = data.profile;
  const s = data.state;
  const name = data.displayName ?? p?.name ?? data.id.slice(0, 8);
  const party = (s?.party ?? []) as Creature[];
  const inventory = (s?.inventory ?? []) as InventorySlot[];
  const badges = (p?.badges ?? s?.badges ?? []) as string[];
  const speciesMap = Object.fromEntries(speciesList.map((x) => [x.id, x]));
  const region = data.sessionRegion ?? (s?.regionId ? String(s.regionId).replace(/_/g, " ") : null);
  const playtimeSeconds = p?.totalPlaytimeSeconds ?? 0;
  const hasSession = data.sessionPlaytimeSeconds != null;
  function formatPlaytimeHMS(sec: number): string {
    const total = Math.floor(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${h}:${pad(m)}:${pad(s)}`;
  }

  const avatarSrc = (data.avatarUrl && !avatarError) ? data.avatarUrl : DEFAULT_AGENT_AVATAR;
  const pokedexOwned = hasSession && typeof s?.pokedexOwned === "number" ? s.pokedexOwned : (p?.pokedexOwnedCount ?? 0);
  const pokedexSeen = hasSession && typeof s?.pokedexSeen === "number" ? s.pokedexSeen : (p?.pokedexSeenCount ?? 0);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col items-center">
      <div className="w-full max-w-4xl px-6 py-6">
        <div className="mb-6">
          <Link href="/observe/agents" className="text-amber-400 hover:underline">← Agents</Link>
        </div>

      {/* Single profile card: avatar + name + playtime, region, pokedex, badges (solo) */}
      <section className="rounded-xl border border-stone-700 bg-stone-900/50 p-5 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-4 shrink-0">
            {avatarSrc.startsWith("http") ? (
              <img
                src={avatarSrc}
                alt=""
                className="w-20 h-20 rounded-full bg-stone-700 object-cover border border-stone-600"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <Image src={avatarSrc} alt="" width={80} height={80} className="rounded-full object-cover border border-stone-600 bg-stone-800" />
            )}
            <div>
              <h1 className="text-xl font-bold text-stone-100">{name}</h1>
            </div>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm flex-1 sm:border-l sm:border-stone-700 sm:pl-6">
            <div><dt className="text-stone-500">Playtime</dt><dd className="text-stone-200">{playtimeSeconds > 0 ? formatPlaytimeHMS(playtimeSeconds) : "—"}</dd></div>
            <div><dt className="text-stone-500">Region</dt><dd className="text-stone-200">{region ?? "—"}</dd></div>
            <div><dt className="text-stone-500">Pokedex</dt><dd className="text-stone-200">{pokedexOwned} owned / {pokedexSeen} seen</dd></div>
            <div><dt className="text-stone-500">Badges</dt><dd className="text-stone-200">{badges.length}</dd></div>
          </dl>
        </div>
      </section>

      {/* Badges */}
      {badges.length > 0 && (
        <section className="mb-8">
          <h2 className="text-amber-400 font-semibold mb-3">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <span key={b} className="px-3 py-1 rounded-full bg-amber-600/20 text-amber-300 text-sm capitalize">
                {b}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Party — 6 slot cards in one row */}
      <section className="mb-8">
        <h2 className="text-amber-400 font-semibold mb-3">Party ({party.length}/6)</h2>
        <div className="rounded-xl border border-stone-700 bg-stone-900/50 p-4">
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {Array.from({ length: 6 }, (_, slotIndex) => {
              const c = party[slotIndex] as Creature | undefined;
              const sp = c?.speciesId ? speciesMap[c.speciesId] : null;
              const displayName = c ? (c.nickname ?? sp?.name ?? (c.speciesId ? String(c.speciesId).replace(/-/g, " ").replace(/^species-\d+$/, "Unknown") : "?")) : null;
              const dexLabel = sp?.dexNumber != null ? `#${String(sp.dexNumber).padStart(3, "0")}` : null;
              const slotNumber = slotIndex + 1;
              return (
                <li key={slotIndex} className="flex flex-col items-center rounded-lg bg-stone-800/60 border border-stone-700/80 p-2 min-h-[160px]">
                  {/* Image on top */}
                  <div className="w-14 h-14 flex items-center justify-center shrink-0 mb-1">
                    {c && (sp?.spriteFront ? (
                      <Image src={sp.spriteFront} alt="" width={56} height={56} unoptimized className="object-contain" style={{ imageRendering: "pixelated" }} />
                    ) : (
                      <div className="w-14 h-14 rounded bg-stone-700 flex items-center justify-center text-stone-500 text-lg font-medium capitalize">{(displayName ?? "?")[0]}</div>
                    ))}
                    {!c && <div className="w-14 h-14 rounded bg-stone-800 border border-dashed border-stone-600 flex items-center justify-center text-stone-600 text-xs">Empty</div>}
                  </div>
                  {c && <span className="text-stone-300 text-xs font-medium capitalize truncate w-full text-center mb-0.5">{displayName}</span>}
                  <span className="text-stone-500 text-[10px] font-medium">{slotNumber}</span>
                  {c ? (
                    <>
                      <span className="text-amber-400/90 text-[10px] font-mono">{dexLabel ?? "—"}</span>
                      <span className="text-stone-400 text-[10px]">Lv.{c.level ?? "?"}</span>
                    </>
                  ) : (
                    <span className="text-stone-600 text-[10px]">—</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Inventory */}
      <section className="mb-8">
        <h2 className="text-amber-400 font-semibold mb-3">Inventory ({inventory.length}/16)</h2>
        <div className="rounded-xl border border-stone-700 bg-stone-900/50 p-4">
          {inventory.length === 0 ? (
            <p className="text-stone-500 text-sm">No items.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {inventory.map((slot, i) => (
                <li key={i} className="px-3 py-1.5 rounded bg-stone-800 text-sm">
                  <span className="text-stone-300 capitalize">{(slot.itemId ?? "?").replace(/-/g, " ")}</span>
                  {slot.count != null && slot.count > 1 && <span className="text-stone-500 ml-1">×{slot.count}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-amber-400 font-semibold mb-3">Published models &amp; datasets</h2>
        {name === "AgentMon Genesis" && (
          <p className="text-amber-200/90 text-sm mb-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
            This agent is the <strong>platform reference</strong>. Download its model and dataset below to bootstrap your own RL agent (same observation/action contract as the template).
          </p>
        )}
        <p className="text-stone-500 text-sm mb-3">
          {models.length > 0 || datasets.length > 0
            ? "Others can download these to bootstrap their own RL agents (same observation/action contract as the platform template)."
            : "This agent has not published any models or datasets yet. Agents can publish via the API — see "}
          {models.length === 0 && datasets.length === 0 && (
            <Link href="/docs#published-models" className="text-amber-400 hover:underline">Docs</Link>
          )}
          {models.length === 0 && datasets.length === 0 && " for how to publish your own."}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-700 bg-stone-900/50 p-4">
            <h3 className="text-stone-300 font-medium mb-2">Models</h3>
            {models.length > 0 ? (
              <ul className="space-y-2">
                {models.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-200 truncate">{m.label}</p>
                      <p className="text-stone-500 text-xs">{m.version ?? ""} {m.version ? "· " : ""}{(m.byteSize / 1024).toFixed(1)} KB</p>
                    </div>
                    <a
                      href={`/api/agents/${id}/models/${m.id}/download`}
                      className="flex-shrink-0 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-stone-950 hover:bg-amber-500"
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-stone-500 text-sm">No models published.</p>
            )}
          </div>
          <div className="rounded-xl border border-stone-700 bg-stone-900/50 p-4">
            <h3 className="text-stone-300 font-medium mb-2">Datasets</h3>
            {datasets.length > 0 ? (
              <ul className="space-y-2">
                {datasets.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-200 truncate">{d.label}</p>
                      <p className="text-stone-500 text-xs">{d.version ?? ""} {d.version ? "· " : ""}{(d.byteSize / 1024).toFixed(1)} KB</p>
                    </div>
                    <a
                      href={`/api/agents/${id}/datasets/${d.id}/download`}
                      className="flex-shrink-0 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-stone-950 hover:bg-amber-500"
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-stone-500 text-sm">No datasets published.</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-amber-400 font-semibold mb-3">Activity log</h2>
        <p className="text-stone-500 text-sm mb-2">Session start/end and last 30 emulator inputs (steps, region, last action).</p>
        <div className="rounded-xl border border-stone-700 bg-stone-900/50 p-4">
          <ul className="space-y-1 text-sm text-stone-400 font-mono max-h-48 overflow-y-auto">
            {(data.recentTranscript ?? []).map((t, i) => {
              const timeStr = t.createdAt ? new Date(t.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "";
              return (
                <li key={i}>
                  {timeStr && <span className="text-stone-500 mr-2">[{timeStr}]</span>}
                  {t.line}
                </li>
              );
            })}
            {(data.recentTranscript?.length ?? 0) === 0 && <li className="text-stone-500">No events yet.</li>}
          </ul>
        </div>
        <p className="mt-4">
          <Link href={`/observe/watch?highlight=${id}`} className="text-amber-400 hover:underline">View on Watch (map) →</Link>
        </p>
      </section>
      </div>
    </div>
  );
}
