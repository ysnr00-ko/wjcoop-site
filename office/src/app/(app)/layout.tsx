import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  if (!me.joinedAt) {
    const supabase = await createClient();
    await supabase.rpc("mark_joined");
  }

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" className="h-7 w-7 rounded-lg" />
            업무
          </Link>
          <span className="ml-auto truncate text-sm text-stone-600">{me.name}님</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>

      {/* 휴대폰에서 엄지로 누르기 쉬운 아래쪽 메뉴 */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-2xl grid-cols-4 text-center text-sm">
          <Link href="/" className="py-3 font-medium text-stone-800">
            첫 화면
          </Link>
          <Link href="/docs" className="py-3 font-medium text-stone-800">
            문서함
          </Link>
          {me.isAdmin ? (
            <Link href="/admin/settings/org" className="py-3 font-medium text-stone-800">
              설정
            </Link>
          ) : (
            <span className="py-3 text-stone-300">설정</span>
          )}
          <form action="/auth/signout" method="post">
            <button className="w-full py-3 font-medium text-stone-800">로그아웃</button>
          </form>
        </div>
      </nav>
    </div>
  );
}
