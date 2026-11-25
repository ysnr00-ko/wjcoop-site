import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * 관리자 열쇠(service role)로 접근하는 연결. 권한 검사를 건너뛰므로
 * 초대 메일 보내기·로그인 차단처럼 꼭 필요한 일에만, 서버에서만 쓴다.
 * 쓰기 전에 반드시 requireAdmin() 으로 관리자인지 확인한다.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
