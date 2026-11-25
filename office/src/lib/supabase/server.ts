import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** 로그인한 사람의 권한으로 데이터베이스에 접근한다 (행 수준 보안이 적용됨). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 화면을 그리는 중에는 쿠키를 쓸 수 없다. 미들웨어가 대신 갱신한다.
          }
        },
      },
    },
  );
}
