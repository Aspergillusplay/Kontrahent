import Link from 'next/link';
export default function NotFound() {
  return <main className="min-h-screen flex flex-col items-center justify-center gap-5 p-8 text-center bg-slate-950">
    <h1 className="text-2xl font-bold">Page not found / Stránka sa nenašla</h1>
    <Link href="/search" className="btn-primary">Company search / Vyhľadať firmu</Link>
  </main>;
}
