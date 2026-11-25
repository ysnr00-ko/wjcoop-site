import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 구글 로그인을 마치고 돌아오는 주소
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const err = searchParams.get("error_description") ?? searchParams.get("error");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }
  // 초대받지 않은 이메일이면 데이터베이스가 계정 만들기를 거부한다
  const reason = err && /database|saving new user|초대/i.test(err) ? "not_invited" : "link";
  return NextResponse.redirect(`${origin}/login?reason=${reason}`);
}
