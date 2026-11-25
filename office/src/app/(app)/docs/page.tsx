import Link from "next/link";
import { Badge, Card, LinkButton, Notice, PageTitle } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatWon } from "@/lib/format";
import { DOC_STATUS, DOC_TYPE_LABEL, type Doc } from "@/lib/docs";

const TABS = [
  { key: "todo", label: "결재할 문서" },
  { key: "mine", label: "내가 올린 문서" },
  { key: "all", label: "부서 문서" },
] as const;

type Row = Pick<
  Doc,
  "id" | "doc_no" | "doc_type" | "status" | "title" | "amount" | "drafter_name" | "created_at" | "submitted_at" | "is_jeongyeol"
>;
const COLS = "id, doc_no, doc_type, status, title, amount, drafter_name, created_at, submitted_at, is_jeongyeol";

export default async function DocsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; msg?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "todo";
  const me = await requireMember();
  const supabase = await createClient();

  // 내 차례인 문서 수 (탭에 숫자로 표시)
  const { data: pendingSteps } = await supabase
    .from("document_steps")
    .select("document_id, step_type")
    .eq("assignee_id", me.id)
    .eq("status", "pending");
  const todoIds = [...new Set((pendingSteps ?? []).map((s) => s.document_id))];

  let rows: Row[] = [];
  if (tab === "todo") {
    if (todoIds.length) {
      const { data } = await supabase.from("documents").select(COLS).in("id", todoIds).order("submitted_at");
      rows = (data ?? []) as Row[];
    }
  } else if (tab === "mine") {
    const { data } = await supabase.from("documents").select(COLS).eq("drafter_id", me.id).order("created_at", { ascending: false }).limit(100);
    rows = (data ?? []) as Row[];
  } else {
    const { data } = await supabase
      .from("documents")
      .select(COLS)
      .neq("status", "draft")
      .order("submitted_at", { ascending: false })
      .limit(100);
    rows = (data ?? []) as Row[];
  }
  const coopIds = new Set((pendingSteps ?? []).filter((s) => s.step_type === "cooperate").map((s) => s.document_id));

  return (
    <>
      <PageTitle sub="전자결재">문서함</PageTitle>
      <Notice msg={sp.msg} error={sp.error} />
      <LinkButton href="/docs/new" variant="primary">
        + 새 문서 쓰기
      </LinkButton>

      <nav className="my-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/docs?tab=${t.key}`}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              t.key === tab ? "bg-emerald-700 text-white" : "border border-stone-300 bg-white text-stone-700"
            }`}
          >
            {t.label}
            {t.key === "todo" && todoIds.length > 0 && ` ${todoIds.length}`}
          </Link>
        ))}
      </nav>

      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r) => {
            const st = DOC_STATUS[r.status];
            return (
              <li key={r.id}>
                {/* 미리 불러오면 '열어 봄'으로 기록될 수 있어 끈다 */}
                <Link prefetch={false} href={`/docs/${r.id}`} className="block">
                  <Card className="hover:border-emerald-600">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <Badge>{DOC_TYPE_LABEL[r.doc_type]}</Badge>
                      {r.is_jeongyeol && r.status !== "draft" && <Badge tone="amber">전결</Badge>}
                      {coopIds.has(r.id) && <Badge tone="amber">협조</Badge>}
                      <span className="ml-auto text-xs text-stone-500">{r.doc_no ?? "번호 없음"}</span>
                    </div>
                    <p className="mt-2 font-semibold text-stone-900">{r.title || "(제목 없음)"}</p>
                    <p className="mt-0.5 text-sm text-stone-600">
                      {r.drafter_name ?? me.name} · {formatDate(r.submitted_at ?? r.created_at)}
                      {r.amount ? ` · ${formatWon(r.amount)}` : ""}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-stone-500">
          {tab === "todo" ? "지금 결재할 문서가 없어요." : "문서가 없어요."}
        </p>
      )}
    </>
  );
}
