import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 로그아웃 (이 기기만). 비활성 계정도 여기로 보내 로그인을 끊는다.
async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const reason = request.nextUrl.searchParams.get("reason") === "inactive" ? "inactive" : "signedout";
  return NextResponse.redirect(`${request.nextUrl.origin}/login?reason=${reason}`, { status: 303 });
}

export const GET = signOut;
export const POST = signOut;
