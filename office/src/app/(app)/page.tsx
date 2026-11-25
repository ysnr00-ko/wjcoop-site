import { redirect } from "next/navigation";
import { Card, CardTitle, LinkButton, Notice, PageTitle } from "@/components/ui";
import { InstallGuide } from "@/components/install-guide";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const me = await requireMember();
  const supabase = await createClient();
  const [{ data: org }, { data: pending }] = await Promise.all([
    supabase.from("org_settings").select("name, setup_completed_at").maybeSingle(),
    supabase.from("document_steps").select("document_id").eq("assignee_id", me.id).eq("status", "pending"),
  ]);
  const todo = new Set((pending ?? []).map((p) => p.document_id)).size;

  // 처음 설치했으면 관리자를 초기 설정 마법사로 안내
  if (me.isAdmin && !org?.setup_completed_at) redirect("/admin/setup?step=1");

  return (
    <>
      <PageTitle sub={org?.name}>안녕하세요, {me.name}님</PageTitle>
      <Notice msg={msg} />

      {!org?.setup_completed_at && (
        <Notice error="관리자가 아직 초기 설정을 하고 있어요. 조금만 기다려 주세요." />
      )}

      <div className="space-y-4">
        <Card className={todo ? "border-amber-300" : ""}>
          <CardTitle>내가 결재할 문서</CardTitle>
          <p className="text-sm text-stone-700">
            {todo ? (
              <>
                지금 <b className="text-lg text-amber-800">{todo}건</b>이 내 차례예요.
              </>
            ) : (
              "지금 내 차례인 문서가 없어요."
            )}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <LinkButton href="/docs?tab=todo" variant={todo ? "primary" : "secondary"}>
              문서함 열기
            </LinkButton>
            <LinkButton href="/docs/new">새 문서 쓰기</LinkButton>
          </div>
        </Card>

        <Card>
          <CardTitle>내 부서와 직책</CardTitle>
          {me.roles.length ? (
            <ul className="space-y-1">
              {me.roles.map((r, i) => (
                <li key={i} className="text-stone-800">
                  {r.department} · <b>{r.position}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-600">아직 발령된 직책이 없어요.</p>
          )}
          {me.isAdmin && <p className="mt-2 text-sm text-emerald-800">관리자 권한이 있어요.</p>}
        </Card>

        <InstallGuide />

        <Card>
          <CardTitle>곧 생길 기능</CardTitle>
          <ul className="list-inside list-disc space-y-1 text-sm text-stone-600">
            <li>결의서 PDF · 결재도장 · 프로젝트와 예산 · 결재 알림 (1단계 안에서 차례로)</li>
            <li>회계 · 회원단체 · 출자금 · 회비</li>
            <li>회의 · 할 일</li>
          </ul>
        </Card>

        {me.isAdmin && (
          <div className="grid grid-cols-2 gap-2">
            <LinkButton href="/admin/settings/people">직원 관리</LinkButton>
            <LinkButton href="/admin/settings/lines">결재선</LinkButton>
          </div>
        )}
      </div>
    </>
  );
}
