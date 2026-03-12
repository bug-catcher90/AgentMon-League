"use client";

import { DEFAULT_AGENT_AVATAR } from "@/lib/constants";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { KantoMapHtml } from "./KantoMapHtml";

type Session = {
  agentId: string;
  displayName: string;
  avatarUrl: string | null;
  mapName?: string;
  badges?: number;
  pokedexOwned?: number;
  pokedexSeen?: number;
  sessionTimeSeconds?: number;
};

type Region = { id: string; name: string; type: string; x: number; y: number; pixelX?: number; pixelY?: number };

type WatchConfig = {
  regions: Region[];
};

type SeasonInfo = {
  number: number;
  name: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
} | null;

function formatSeasonDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const sec = Math.floor((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

function formatPlaytime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return mins > 0 ? `${h}h ${mins}m` : `${h}h`;
}

/** Match session mapName to region (exact or region name contained in mapName for interiors). */
function sessionInRegion(session: Session, regionName: string): boolean {
  const map = session.mapName ?? "";
  if (map === regionName) return true;
  if (map.startsWith(regionName + " ") || map.startsWith(regionName + "(")) return true;
  return false;
}

/** Find region id for a session (first region whose name matches mapName). */
function getRegionIdForSession(session: Session, regions: Region[]): string | null {
  const map = session.mapName ?? "";
  for (const r of regions) {
    if (map === r.name || map.startsWith(r.name + " ") || map.startsWith(r.name + "(")) return r.id;
  }
  return null;
}

function WatchPageContent() {
  const searchParams = useSearchParams();
  const highlightAgentId = searchParams.get("highlight");
  const appliedHighlightRef = useRef(false);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [config, setConfig] = useState<WatchConfig | null>(null);
  const [season, setSeason] = useState<SeasonInfo>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [hoverRegion, setHoverRegion] = useState<Region | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/observe/emulator/sessions", { cache: "no-store" });
      const data = await res.json();
      setSessions(data.sessions ?? []);
      setError(data.error ?? (!res.ok ? "Failed to load sessions" : null));
    } catch {
      setSessions([]);
      setError("Could not reach server");
    }
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/observe/watch/config", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch {
        setConfig(null);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    const loadSeason = async () => {
      try {
        const res = await fetch("/api/observe/seasons/current", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setSeason(data.season ?? null);
        }
      } catch {
        setSeason(null);
      }
    };
    loadSeason();
    const t = setInterval(loadSeason, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetchSessions();
    const t = setInterval(fetchSessions, 3000);
    return () => clearInterval(t);
  }, [fetchSessions]);

  useEffect(() => {
    setLoading(false);
  }, [sessions, config]);

  const regions = config?.regions ?? [];
  const citiesAndRoutes = useMemo(
    () => regions.filter((r) => r.type === "city" || r.type === "route" || r.type === "cave"),
    [regions]
  );

  // When opening with ?highlight=agentId (e.g. from agent profile), pre-fill search and select region so agent appears in table
  useEffect(() => {
    if (!highlightAgentId || appliedHighlightRef.current || sessions.length === 0 || regions.length === 0) return;
    const match = sessions.find(
      (s) => s.agentId === highlightAgentId || (s.displayName ?? "").toLowerCase().includes(highlightAgentId.toLowerCase())
    );
    appliedHighlightRef.current = true;
    setSearchInput(highlightAgentId);
    setSearchApplied(highlightAgentId);
    if (match) {
      const regionId = getRegionIdForSession(match, regions);
      if (regionId) setSelectedRegionId(regionId);
    }
  }, [highlightAgentId, sessions, regions]);

  const agentsByRegion = useMemo(() => {
    const byId: Record<string, Session[]> = {};
    for (const r of regions) {
      byId[r.id] = sessions.filter((s) => sessionInRegion(s, r.name));
    }
    return byId;
  }, [sessions, regions]);

  const searchMatches = useMemo(() => {
    if (!searchApplied?.trim()) return null;
    const q = searchApplied.trim().toLowerCase();
    return sessions.filter(
      (s) =>
        (s.displayName ?? "").toLowerCase().includes(q) || (s.agentId ?? "").toLowerCase().includes(q)
    );
  }, [sessions, searchApplied]);

  const filteredSessions = useMemo(() => {
    if (searchMatches !== null) return searchMatches;
    if (!selectedRegionId) return sessions;
    return agentsByRegion[selectedRegionId] ?? [];
  }, [sessions, selectedRegionId, agentsByRegion, searchMatches]);

  const effectiveRegionId = searchMatches?.length === 1
    ? getRegionIdForSession(searchMatches[0], regions)
    : selectedRegionId;

  const handleSearch = () => {
    const q = searchInput.trim();
    setSearchApplied(q || null);
    if (q) {
      const matches = sessions.filter(
        (s) =>
          (s.displayName ?? "").toLowerCase().includes(q.toLowerCase()) ||
          (s.agentId ?? "").toLowerCase().includes(q.toLowerCase())
      );
      if (matches.length === 1) {
        setSelectedRegionId(getRegionIdForSession(matches[0], regions) ?? null);
      }
    } else {
      setSelectedRegionId(null);
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchApplied(null);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
      <header className="border-b border-stone-700 px-4 py-3 flex items-center gap-4 flex-wrap">
        <Link href="/" className="text-amber-400 hover:underline">← Home</Link>
        <h1 className="text-xl font-semibold text-amber-400">Watch — Kanto</h1>
        <span className="text-stone-500 text-sm">{sessions.length} agent{sessions.length !== 1 ? "s" : ""} playing</span>
      </header>

      {season && (
        <section className="border-b-2 border-amber-500/50 bg-amber-500/10 px-6 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-amber-400 font-bold">Season {season.number}</span>
            <span className="text-stone-200">{season.name}</span>
            {season.status === "active" && season.startedAt && (
              <span className="text-stone-500 text-sm">
                Running for {formatSeasonDuration(season.startedAt, season.endedAt)}
              </span>
            )}
            {season.status === "ended" && season.startedAt && season.endedAt && (
              <span className="text-stone-500 text-sm">
                Ran for {formatSeasonDuration(season.startedAt, season.endedAt)}
              </span>
            )}
          </div>
        </section>
      )}

      {loading && sessions.length === 0 ? (
        <div className="p-6 text-stone-500">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="p-6 rounded-xl border border-amber-500/50 bg-amber-500/10 mx-4 mt-4 text-amber-200 max-w-2xl">
          <p className="font-medium">No agents playing</p>
          <p className="text-sm mt-1 text-stone-400">
            {error === "Emulator service unreachable"
              ? "Start the emulator service (see emulator/README) and ensure a Pokémon Red ROM is configured."
              : error || "Have an agent start a game session, then refresh."}
          </p>
          <Link href="/observe/agents" className="text-amber-400 hover:underline text-sm mt-2 inline-block">View all agents</Link>
        </div>
      ) : (
        <section className="flex-1 flex flex-col min-h-0 px-6 pb-6">
          <h2 className="text-stone-500 text-xs font-semibold uppercase tracking-wider pt-4 pb-2">
            Watch agent trainers on their journey through Kanto. Filter by location or search by agent name or ID, then watch any live session.
          </h2>

          <div className="flex flex-wrap gap-3 items-center mb-3">
            <input
              type="text"
              placeholder="Agent name or ID"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="rounded-2xl px-4 py-2 bg-stone-800 border border-stone-600 text-stone-200 placeholder-stone-500 text-sm w-72 min-w-0 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="button"
              onClick={handleSearch}
              className="rounded-2xl px-4 py-2 bg-amber-500 text-stone-900 text-sm font-medium hover:bg-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              Search
            </button>
            {searchApplied != null && (
              <button
                type="button"
                onClick={clearSearch}
                className="rounded-2xl px-4 py-2 bg-stone-700 text-stone-400 text-sm hover:bg-stone-600 focus:outline-none"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 flex min-h-0 w-full min-w-0">
            <div className="flex flex-col lg:flex-row gap-4 items-stretch w-full min-w-0 self-start">
            <div className="flex-1 min-w-0 flex flex-col min-h-0 max-w-full" style={{ aspectRatio: "536/495" }}>
              <div className="w-full h-full min-h-0 flex flex-col">
                <KantoMapHtml
                  regions={citiesAndRoutes.length ? citiesAndRoutes : regions}
                  agentsByRegion={agentsByRegion}
                  selectedRegionId={effectiveRegionId}
                  hoverRegion={hoverRegion}
                  onSelectRegion={(id) => {
                    setSearchApplied(null);
                    setSelectedRegionId(id);
                  }}
                  onHoverRegion={setHoverRegion}
                />
              </div>
            </div>

            <aside className="w-full lg:flex-1 lg:min-w-[20rem] min-h-0 flex flex-col border border-stone-700 rounded-lg bg-stone-900/90 overflow-hidden shrink-0 h-full mt-4 lg:mt-0">
              <div className="flex-1 overflow-auto flex flex-col min-h-0">
                <table className="w-full text-sm table-auto">
                  <thead className="sticky top-0 bg-stone-900 z-[1]">
                    <tr className="border-b border-stone-700 bg-stone-800/50">
                      <td colSpan={6} className="px-3 py-2">
                        <label className="flex items-center gap-2 text-stone-400 text-xs">
                          <span className="shrink-0">Filter by region:</span>
                          <select
                            value={searchMatches != null ? effectiveRegionId ?? "" : selectedRegionId ?? ""}
                            onChange={(e) => {
                              setSearchApplied(null);
                              setSelectedRegionId(e.target.value || null);
                            }}
                            className="flex-1 min-w-0 rounded px-2 py-1.5 bg-stone-700 border border-stone-600 text-stone-200 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                          >
                            <option value="">All ({sessions.length})</option>
                            {citiesAndRoutes.map((r) => {
                              const count = (agentsByRegion[r.id] ?? []).length;
                              return (
                                <option key={r.id} value={r.id}>
                                  {r.name} ({count})
                                </option>
                              );
                            })}
                          </select>
                        </label>
                      </td>
                    </tr>
                    <tr className="border-b border-stone-600 text-stone-500 text-left">
                      <th className="px-3 py-2 font-medium">Agent</th>
                      <th className="px-3 py-2 font-medium text-center">Playtime</th>
                      <th className="px-3 py-2 font-medium text-center">Badges</th>
                      <th className="px-3 py-2 font-medium text-center">Pokedex</th>
                      <th className="px-3 py-2 font-medium">Location</th>
                      <th className="px-3 py-2 font-medium w-20 text-right">Watch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-stone-500">
                          {searchApplied
                            ? "No agent matches your search."
                            : effectiveRegionId
                              ? `No agents in ${citiesAndRoutes.find((r) => r.id === effectiveRegionId)?.name ?? effectiveRegionId}`
                              : "No sessions"}
                        </td>
                      </tr>
                    ) : (
                      filteredSessions.map((s) => (
                        <tr key={s.agentId} className="border-b border-stone-700/80 last:border-0 text-stone-300 hover:bg-stone-800/50">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {s.avatarUrl?.startsWith("http") ? (
                                <img src={s.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <Image src={s.avatarUrl || DEFAULT_AGENT_AVATAR} alt="" width={32} height={32} className="rounded-full object-cover flex-shrink-0" />
                              )}
                              <span className="truncate font-medium">{s.displayName || s.agentId.slice(0, 8)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">{formatPlaytime(s.sessionTimeSeconds ?? 0)}</td>
                          <td className="px-3 py-2 text-center">{s.badges ?? 0}</td>
                          <td className="px-3 py-2 text-center">{s.pokedexOwned ?? 0} / {s.pokedexSeen ?? 0}</td>
                          <td className="px-3 py-2 min-w-[80px]" title={s.mapName ?? ""}>{s.mapName ?? "—"}</td>
                          <td className="px-3 py-2 text-right">
                            <Link
                              href={`/observe/watch/${s.agentId}`}
                              className="inline-block px-3 py-1.5 rounded bg-amber-500 text-stone-900 text-xs font-medium hover:bg-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            >
                              Watch
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </aside>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-stone-900 text-stone-400">Loading watch…</div>}>
      <WatchPageContent />
    </Suspense>
  );
}
