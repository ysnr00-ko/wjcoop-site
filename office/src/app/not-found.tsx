import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-2 text-lg font-bold">없는 화면이에요</h1>
      <p className="mb-6 text-sm text-stone-600">주소가 틀렸거나 볼 수 있는 권한이 없어요.</p>
      <Link href="/" className="rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white">
        첫 화면으로
      </Link>
    </main>
  );
}
