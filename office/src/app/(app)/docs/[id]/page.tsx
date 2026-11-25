import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardTitle, Field, Notice, PageTitle, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatWon } from "@/lib/format";
import { DOC_STATUS, DOC_TYPE_LABEL, amountToHangul, type Doc, type DocStep, type PreviewStep } from "@/lib/docs";
import { loadDraftOptions } from "@/lib/docs-server";
import { ApprovalBox } from "../approval-box";
import { DocForm } from "../doc-form";
import * as A from "../actions";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 py-2">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="text-sm whitespace-pre-wrap text-stone-900">{children}</dd>
    </div>
  );
}

export default async function DocPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; error?: string; edit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const { data: docRow } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (!docRow) notFound(); // 없거나 볼 권한이 없음
  const doc = docRow as Doc;
  const back = `/docs/${id}`;
  const mine = doc.drafter_id === me.id;

  // 차례인 결재자가 처음 열면 기록 (이후 기안자는 회수할 수 없음)
  if (doc.status === "in_progress") await supabase.rpc("mark_document_seen", { p_doc: id });

  const [{ data: stepRows }, { data: later }] = await Promise.all([
    supabase.from("document_steps").select("*").eq("document_id", id).order("seq"),
    supabase.from("documents").select("id, doc_no, status").eq("redraft_of", id),
  ]);
  const steps = (stepRows ?? []) as DocStep[];
  const myStep = steps.find((s) => s.assignee_id === me.id && s.status === "pending");

  // ------------------------------------------------------------ 임시저장: 고치기 / 결재선 미리보기
  if (doc.status === "draft") {
    if (!mine) notFound();
    const options = await loadDraftOptions(me.id);
    if (sp.edit) {
      return (
        <>
          <PageTitle sub={doc.doc_no ? `문서번호 ${doc.doc_no} · 고치는 중` : "임시저장 · 고치는 중"}>
            {DOC_TYPE_LABEL[doc.doc_type]}
          </PageTitle>
          <Notice msg={sp.msg} error={sp.error} />
          <DocForm type={doc.doc_type} doc={doc} options={options} back={`${back}?edit=1`} />
        </>
      );
    }
    let preview: PreviewStep[] = [];
    let previewError = "";
    if (doc.line_id) {
      const { data, error } = await supabase.rpc("preview_my_line", { p_line: doc.line_id, p_department: doc.department_id });
      preview = (data ?? []) as PreviewStep[];
      if (error) previewError = /[가-힣]/.test(error.message) ? error.message : "결재선을 확인하지 못했어요.";
    }
    const lineName = options.lines.find((l) => l.id === doc.line_id)?.name;
    const hasProblem = !!previewError || !doc.line_id || preview.some((p) => p.status === "problem");
    const noApprover = !hasProblem && !preview.some((p) => p.status === "waiting" && p.step_type === "approve");
    const { data: lineRow } = doc.line_id
      ? await supabase.from("approval_lines").select("allow_self_approval").eq("id", doc.line_id).maybeSingle()
      : { data: null };
    const holdsStep = preview.some((p) => p.step_type === "approve" && p.assignee_id === me.id && p.note === "기안자 본인");
    const selfApproval = noApprover && (holdsStep || !!lineRow?.allow_self_approval);
    const selfBlocked = noApprover && !selfApproval;
    const hasCoop = preview.some((p) => p.status === "waiting" && p.step_type === "cooperate");

    return (
      <>
        <PageTitle sub={doc.doc_no ? `문서번호 ${doc.doc_no} · 회수한 문서` : "임시저장 · 아직 올리지 않았어요"}>
          {doc.title || "(제목 없음)"}
        </PageTitle>
        <Notice msg={sp.msg} error={sp.error} />
        <div className="space-y-4">
          <DocBody doc={doc} />
          <Card>
            <CardTitle>결재선 미리보기{lineName ? ` · ${lineName}` : ""}</CardTitle>
            {previewError && <Notice error={previewError} />}
            {!doc.line_id && <Notice error="결재선을 골라 주세요. [고치기]를 눌러 고를 수 있어요." />}
            {!!preview.length && (
              <ApprovalBox drafter={{ position: "기안", name: me.name }} steps={preview} />
            )}
            {preview.some((p) => p.status === "skipped") && (
              <ul className="mt-3 space-y-0.5 text-xs text-stone-500">
                {preview
                  .filter((p) => p.status === "skipped")
                  .map((p, i) => (
                    <li key={i}>
                      {p.position_name} 건너뜀: {p.note}
                    </li>
                  ))}
              </ul>
            )}
            {selfApproval && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                이 결재선에는 나 말고 결재할 사람이 없어서 <b>본인 결재</b>로 끝나요
                {hasCoop ? " (협조는 거친 뒤에 끝나요)" : " (올리는 즉시 결재 완료)"}. 문서에 “본인 결재” 표시가 남아요.
              </p>
            )}
            {selfBlocked && (
              <p className="mt-3 text-sm text-red-700">
                이 결재선에는 나 말고 결재할 사람이 없어요. 관리자에게 결재선을 확인해 달라고 해 주세요.
              </p>
            )}
            {preview.some((p) => p.status === "problem") && (
              <p className="mt-3 text-sm text-red-700">
                맡은 사람이 없는 직책이 있어요. 관리자에게 인사발령을 요청하거나 다른 결재선을 골라 주세요.
              </p>
            )}
          </Card>

          <form action={A.submitDoc}>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="id" value={id} />
            <SubmitButton className="w-full" confirm="이 결재선으로 결재를 올릴까요?">
              결재 올리기
            </SubmitButton>
            {(hasProblem || selfBlocked) && <p className="mt-1 text-center text-xs text-red-700">위 문제를 먼저 해결해야 올라가요.</p>}
          </form>
          <div className="grid grid-cols-2 gap-2">
            <Link href={`${back}?edit=1`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 font-medium text-stone-800">
              고치기
            </Link>
            {!doc.doc_no ? (
              <form action={A.deleteDraft}>
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="id" value={id} />
                <SubmitButton variant="danger" className="w-full" confirm="이 임시저장 문서를 지울까요?">
                  지우기
                </SubmitButton>
              </form>
            ) : (
              <span />
            )}
          </div>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------ 올린 문서
  const st = DOC_STATUS[doc.status];
  const opinions = steps.filter((s) => s.opinion);
  const withdrawable = mine && doc.status === "in_progress" && !steps.some((s) => s.status === "pending" && s.seen_at);

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <Badge tone={st.tone}>{st.label}</Badge>
        <Badge>{DOC_TYPE_LABEL[doc.doc_type]}</Badge>
        {doc.is_jeongyeol && <Badge tone="amber">전결</Badge>}
        {doc.self_approved && <Badge tone="amber">본인 결재</Badge>}
      </div>
      <PageTitle sub={`문서번호 ${doc.doc_no}`}>{doc.title}</PageTitle>
      <Notice msg={sp.msg} error={sp.error} />

      <div className="space-y-4">
        <Card>
          <CardTitle>결재란{doc.line_name ? ` · ${doc.line_name}` : ""}</CardTitle>
          <ApprovalBox
            drafter={{ position: doc.drafter_position ?? "기안", name: doc.drafter_name ?? "" }}
            submittedAt={doc.submitted_at}
            steps={steps}
          />
        </Card>

        {myStep && <ActCard id={id} back={back} step={myStep} />}

        <DocBody doc={doc} />

        {!!opinions.length && (
          <Card>
            <CardTitle>의견</CardTitle>
            <ul className="space-y-3">
              {opinions.map((s) => (
                <li key={s.id} className="text-sm">
                  <p className="font-medium text-stone-900">
                    {s.assignee_name} <span className="text-stone-500">({s.position_name})</span>{" "}
                    {s.status === "rejected" && <Badge tone="red">반려 사유</Badge>}
                    {s.disagree && <Badge tone="amber">협조 이견</Badge>}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-stone-800">{s.opinion}</p>
                  <p className="text-xs text-stone-500">{formatDateTime(s.acted_at)}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {doc.redraft_of && (
          <p className="text-sm text-stone-600">
            반려된 문서를 다시 올린 문서예요.{" "}
            <Link prefetch={false} href={`/docs/${doc.redraft_of}`} className="text-emerald-800 underline">
              원래 문서 보기
            </Link>
          </p>
        )}
        {!!later?.length && (
          <p className="text-sm text-stone-600">
            이 문서를 다시 올렸어요:{" "}
            {later.map((l) => (
              <Link key={l.id} prefetch={false} href={`/docs/${l.id}`} className="text-emerald-800 underline">
                {l.doc_no ?? "임시저장"}
              </Link>
            ))}
          </p>
        )}

        {withdrawable && (
          <form action={A.withdrawDoc}>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="secondary" className="w-full" confirm="회수하면 결재가 처음부터 다시 시작돼요. 회수할까요?">
              회수하기
            </SubmitButton>
            <p className="mt-1 text-center text-xs text-stone-500">지금 차례인 결재자가 열어 보기 전까지만 회수할 수 있어요.</p>
          </form>
        )}
        {mine && doc.status === "rejected" && !later?.length && (
          <form action={A.redraftDoc}>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="id" value={id} />
            <SubmitButton className="w-full">고쳐서 다시 올리기</SubmitButton>
          </form>
        )}
      </div>
    </>
  );
}

function DocBody({ doc }: { doc: Doc }) {
  return (
    <Card>
      <dl className="divide-y divide-stone-100">
        {doc.submitted_at && (
          <Info label="기안">
            {doc.drafter_name} · {doc.department_name} · {formatDate(doc.submitted_at)}
          </Info>
        )}
        {doc.doc_type === "expense" && (
          <>
            <Info label="금액">
              {doc.amount ? (
                <>
                  <b>{formatWon(doc.amount)}</b>
                  <span className="block text-xs text-stone-500">금 {amountToHangul(doc.amount)}원정</span>
                </>
              ) : (
                <span className="text-stone-400">아직 안 적음</span>
              )}
            </Info>
            <Info label="사용처">{doc.payee || <span className="text-stone-400">아직 안 적음</span>}</Info>
            <Info label="지출 예정일">{doc.pay_date || "-"}</Info>
            <Info label="사용 내역">{doc.body || <span className="text-stone-400">아직 안 적음</span>}</Info>
          </>
        )}
        {doc.doc_type === "proposal" && <Info label="내용">{doc.body || <span className="text-stone-400">아직 안 적음</span>}</Info>}
        {doc.doc_type === "leave" && (
          <>
            <Info label="종류">{doc.leave_kind || "-"}</Info>
            <Info label="기간">
              {doc.period_start || "?"} ~ {doc.period_end || "?"}
            </Info>
            {doc.place && <Info label="출장지">{doc.place}</Info>}
            <Info label="사유">{doc.body || "-"}</Info>
          </>
        )}
      </dl>
    </Card>
  );
}

function ActCard({ id, back, step }: { id: string; back: string; step: DocStep }) {
  if (step.step_type === "cooperate") {
    return (
      <Card className="border-amber-300">
        <CardTitle>협조 차례예요</CardTitle>
        <form action={A.cooperateDoc} className="space-y-3">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="id" value={id} />
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="disagree" value="no" defaultChecked className="h-5 w-5" /> 동의
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="disagree" value="yes" className="h-5 w-5" /> 이견 있음
            </label>
          </div>
          <Field label="의견" hint="이견이 있으면 꼭 적어 주세요. 이견이 있어도 결재는 계속 진행돼요.">
            <textarea name="opinion" rows={2} className={inputClass} />
          </Field>
          <SubmitButton className="w-full">확인</SubmitButton>
        </form>
      </Card>
    );
  }
  return (
    <Card className="border-amber-300">
      <CardTitle>내 결재 차례예요</CardTitle>
      <form className="space-y-3">
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="id" value={id} />
        <Field label="의견" hint="반려할 때는 사유를 꼭 적어 주세요.">
          <textarea name="opinion" rows={2} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <SubmitButton variant="danger" formAction={A.rejectDoc} confirm="반려할까요? 기안자에게 돌아가요.">
            반려
          </SubmitButton>
          <SubmitButton formAction={A.approveDoc}>결재</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
