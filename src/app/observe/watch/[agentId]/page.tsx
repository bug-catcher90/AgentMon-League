"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
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

const FRAME_POLL_MS = 80;

function LiveFrame({ agentId }: { agentId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const nextRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setErr(false);
    setFailCount(0);
    let cancelled = false;
    const requestNext = () => {
      if (cancelled) return;
      setSrc(`/api/observe/emulator/frame?agentId=${encodeURIComponent(agentId)}&t=${Date.now()}`);
    };
    requestNext();
    return () => {
      cancelled = true;
      if (nextRef.current) clearTimeout(nextRef.current);
    };
  }, [agentId]);

  const handleError = () => {
    setFailCount((c) => c + 1);
    setErr(true);
    // Still schedule next so we recover when session is back
    nextRef.current = setTimeout(() => {
      nextRef.current = null;
      setSrc(`/api/observe/emulator/frame?agentId=${encodeURIComponent(agentId)}&t=${Date.now()}`);
    }, 500);
  };
  const handleLoad = () => {
    setErr(false);
    setFailCount(0);
    if (nextRef.current) clearTimeout(nextRef.current);
    nextRef.current = setTimeout(() => {
      nextRef.current = null;
      setSrc(`/api/observe/emulator/frame?agentId=${encodeURIComponent(agentId)}&t=${Date.now()}`);
    }, FRAME_POLL_MS);
  };

  if (err && failCount >= 3) {
    return (
      <div className="flex items-center justify-center h-full min-h-[320px] text-stone-500 text-sm bg-stone-900">
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

type ChatMessage = { id: string; author: string; message: string; createdAt: string };

function ChatPanel({ streamAgentId, displayName }: { streamAgentId: string; displayName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [author, setAuthor] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/observe/chat?streamAgentId=${encodeURIComponent(streamAgentId)}&limit=100`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch {
      setMessages([]);
    }
  }, [streamAgentId]);

  useEffect(() => {
    fetchMessages();
    const t = setInterval(fetchMessages, 3000);
    return () => clearInterval(t);
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/observe/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamAgentId,
          author: author.trim() || "Anonymous",
          message: msg,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data]);
        setInput("");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-stone-900/95 border border-stone-700 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-700 bg-stone-800/80">
        <h3 className="text-sm font-semibold text-amber-400">Chat — {displayName}</h3>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2">
        {messages.length === 0 ? (
          <p className="text-stone-500 text-sm py-4 text-center">No messages yet. Say hi!</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="text-sm">
              <span className="font-medium text-amber-400/90">{m.author}</span>
              <span className="text-stone-400 mx-1">:</span>
              <span className="text-stone-200 break-words">{m.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-2 border-t border-stone-700 bg-stone-800/50 flex flex-col gap-2">
        <input
          type="text"
          placeholder="Your name (optional)"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="rounded px-2 py-1.5 bg-stone-700 border border-stone-600 text-stone-200 text-xs placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Send a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="flex-1 min-w-0 rounded px-3 py-2 bg-stone-700 border border-stone-600 text-stone-200 text-sm placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || sending}
            className="px-4 py-2 rounded bg-amber-500 text-stone-900 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-amber-400"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WatchAgentPage() {
  const params = useParams();
  const agentId = params.agentId as string;
  const [session, setSession] = useState<{
    displayName: string;
    avatarUrl?: string | null;
    sessionTimeSeconds?: number;
    pokedexOwned?: number;
    pokedexSeen?: number;
    badges?: number;
    mapName?: string;
  } | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/observe/emulator/sessions", { cache: "no-store" });
      const data = await res.json();
      const sessions = data.sessions ?? [];
      const s = sessions.find((x: { agentId: string }) => x.agentId === agentId);
      if (s)
        setSession({
          displayName: s.displayName ?? agentId.slice(0, 8),
          avatarUrl: s.avatarUrl,
          sessionTimeSeconds: s.sessionTimeSeconds,
          pokedexOwned: s.pokedexOwned,
          pokedexSeen: s.pokedexSeen,
          badges: s.badges,
          mapName: s.mapName,
        });
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
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col w-full">
      <header className="border-b border-stone-700 px-4 py-3 flex items-center justify-center gap-4 flex-wrap shrink-0 w-full">
        <div className="flex items-center gap-4 flex-wrap justify-center w-full max-w-[1400px]">
          <Link href="/observe/watch" className="text-amber-400 hover:underline">← Watch</Link>
          <h1 className="text-xl font-semibold text-amber-400">{name}</h1>
          {session && (
            <span className="text-stone-500 text-sm">
              {formatPlaytime(session.sessionTimeSeconds ?? 0)} · {session.pokedexOwned ?? 0}/{session.pokedexSeen ?? 0} Pokedex · {session.badges ?? 0} badges
              {session.mapName && ` · ${session.mapName}`}
            </span>
          )}
        </div>
      </header>

      {/* Twitch-like: game left, chat right — centered */}
      <main className="flex-1 flex justify-center min-h-0 px-4 py-4 w-full">
        <div className="flex gap-4 w-full max-w-[1400px]">
          {/* Left: game stream */}
          <div className="flex-shrink-0">
            <div className="rounded-xl border-2 border-stone-600 bg-stone-900 overflow-hidden shadow-xl">
              <div className="block overflow-hidden" style={{ width: 640, height: 576 }}>
                <LiveFrame agentId={agentId} />
              </div>
              <div className="p-2 border-t border-stone-700 text-center text-xs text-stone-500">
                Game Boy · Pokémon Red
              </div>
            </div>
          </div>

          {/* Right: chat */}
          <div className="flex-1 min-w-[280px] max-w-[400px] flex flex-col min-h-[600px]">
            <ChatPanel streamAgentId={agentId} displayName={name} />
          </div>
        </div>
      </main>

      {/* Below: More about [agentName] — centered */}
      <section className="border-t border-stone-800 bg-stone-900/50 px-4 py-6 w-full flex justify-center">
        <div className="w-full max-w-[1400px]">
          <h2 className="text-lg font-semibold text-stone-200 mb-4">More about {name}</h2>
          <div className="flex flex-wrap items-center gap-6 p-4 rounded-xl bg-stone-800/60 border border-stone-700 w-full">
            <div className="flex items-center gap-3">
              {session?.avatarUrl?.startsWith("http") ? (
                <img src={session.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-amber-500/50" />
              ) : (
                <Image src={session?.avatarUrl || DEFAULT_AGENT_AVATAR} alt="" width={56} height={56} className="rounded-full object-cover border-2 border-amber-500/50" />
              )}
              <div>
                <p className="font-semibold text-stone-100">{name}</p>
                <p className="text-stone-500 text-sm">Live session</p>
              </div>
            </div>
            <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
              <div>
                <dt className="text-stone-500">Playtime</dt>
                <dd className="text-stone-200 font-medium">{session ? formatPlaytime(session.sessionTimeSeconds ?? 0) : "—"}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Region</dt>
                <dd className="text-stone-200 font-medium">{session?.mapName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Pokédex</dt>
                <dd className="text-stone-200 font-medium">{session ? `${session.pokedexOwned ?? 0} / ${session.pokedexSeen ?? 0}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Badges</dt>
                <dd className="text-stone-200 font-medium">{session?.badges ?? 0}</dd>
              </div>
            </dl>
            <Link
              href={`/observe/agents/${agentId}`}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-stone-900 font-medium hover:bg-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              View profile →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
