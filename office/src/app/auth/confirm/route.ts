import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// 초대 메일 · 비밀번호 재설정 메일의 링크가 오는 주소
// (Supabase 메일 양식에서 {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=... 로 연결)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");
  // 다른 사이트로 넘어가지 않도록 우리 사이트 안의 주소만 허용
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/set-password";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }
  return NextResponse.redirect(`${origin}/login?reason=link`);
}
