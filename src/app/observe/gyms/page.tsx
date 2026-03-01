"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Gym = { id: string; name: string; cityName: string; badgeId: string };

export default function GymsListPage() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGyms = async () => {
      try {
        const res = await fetch("/api/observe/gyms");
        if (!res.ok) throw new Error("Failed to load gyms");
        const json = await res.json();
        setGyms(json.gyms ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    };
    fetchGyms();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 p-6">
        <Link href="/" className="text-amber-400 hover:underline">← Home</Link>
        <p className="mt-4 text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-6">
      <header className="flex items-center gap-4 mb-8">
        <Link href="/" className="text-amber-400 hover:underline">← Home</Link>
        <h1 className="text-2xl font-bold">Gyms</h1>
      </header>
      <p className="text-stone-400 mb-6">Select a gym to view live tournament and bracket.</p>
      <ul className="space-y-2">
        {gyms.map((g) => (
          <li key={g.id}>
            <Link
              href={`/observe/gyms/${g.id}`}
              className="block p-4 rounded-lg border border-stone-700 bg-stone-900/50 hover:border-amber-600/50"
            >
              <span className="font-medium">{g.name}</span>
              <span className="text-stone-500 ml-2">{g.cityName}</span>
            </Link>
          </li>
        ))}
        {gyms.length === 0 && <li className="text-stone-500">No gyms seeded. Run db:seed.</li>}
      </ul>
    </div>
  );
}
