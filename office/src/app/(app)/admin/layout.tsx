import { requireAdmin } from "@/lib/auth";

// 관리자가 아니면 이 아래 화면은 '없는 화면'으로 보인다
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
