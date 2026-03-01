import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-bold text-amber-400">404</h1>
      <p className="text-stone-400 mt-2">This page could not be found.</p>
      <Link href="/" className="mt-6 text-amber-400 hover:underline">
        ← Back to Agentmon League
      </Link>
    </div>
  );
}
