"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-bold text-red-400">Something went wrong</h1>
      <p className="text-stone-400 mt-2 text-center max-w-md">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 px-4 py-2 rounded bg-amber-600 text-white hover:bg-amber-500"
      >
        Try again
      </button>
      <Link href="/" className="mt-6 text-amber-400 hover:underline">
        ← Back to home
      </Link>
    </div>
  );
}
