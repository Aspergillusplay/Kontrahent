'use client';
import Link from 'next/link';
export default function ErrorPage({reset}:{reset:()=>void}) {
  return <main className="min-h-screen flex flex-col items-center justify-center gap-5 p-8 text-center bg-slate-950">
    <h1 className="text-2xl font-bold">Page temporarily unavailable / Stránka je dočasne nedostupná</h1>
    <button onClick={reset} className="btn-primary">Try again / Skúsiť znova</button>
    <Link href="/search" className="btn-ghost">Company search / Vyhľadať firmu</Link>
  </main>;
}
