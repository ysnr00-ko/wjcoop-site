"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LEAVE_KINDS, type DocType } from "@/lib/docs";

// ------------------------------------------------------------ 공통
function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}
function go(path: string, kind: "msg" | "error", text: string): never {
  const [p, q] = path.split("?");
  const params = new URLSearchParams(q);
  params.delete("msg");
  params.delete("error");
  params.set(kind, text);
  revalidatePath("/", "layout");
  redirect(`${p}?${params.toString()}`);
}
function back(fd: FormData) {
  const b = str(fd, "back");
  return b.startsWith("/docs") && !b.startsWith("//") ? b : "/docs";
}
/** 데이터베이스 오류를 알아듣기 쉬운 말로 */
function explain(error: { message: string; code?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "42501") return "이 문서를 고칠 권한이 없어요. 이미 올린 문서이거나 내 부서가 아니에요.";
  if (/[가-힣]/.test(error.message)) return error.message.replace(/^.*?ERROR:\s*/, "");
  return fallback;
}
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/** 양식 칸을 문서 값으로 (빈 칸은 비워 둠 — 꼭 필요한 칸은 올릴 때 데이터베이스가 확인) */
function fields(fd: FormData, type: DocType) {
  const amountText = str(fd, "amount").replace(/[^\d]/g, "");
  const date = (k: string) => (isDate(str(fd, k)) ? str(fd, k) : null);
  const kind = str(fd, "leave_kind");
  return {
    title: str(fd, "title"),
    department_id: str(fd, "department_id"),
    line_id: isUuid(str(fd, "line_id")) ? str(fd, "line_id") : null,
    body: str(fd, "body"),
    amount: type === "expense" && amountText ? Math.min(Number(amountText), 999_999_999_999) : null,
    payee: type === "expense" ? str(fd, "payee") || null : null,
    pay_date: type === "expense" ? date("pay_date") : null,
    leave_kind: type === "leave" && (LEAVE_KINDS as readonly string[]).includes(kind) ? kind : null,
    period_start: type === "leave" ? date("period_start") : null,
    period_end: type === "leave" ? date("period_end") : null,
    place: type === "leave" ? str(fd, "place") || null : null,
  };
}

// ------------------------------------------------------------ 임시저장 (새로 만들기 · 고치기)
export async function saveDraft(fd: FormData) {
  await requireMember();
  const supabase = await createClient();
  const id = str(fd, "id");
  const type = str(fd, "doc_type") as DocType;
  if (!["expense", "proposal", "leave"].includes(type)) go("/docs/new", "error", "문서 종류를 골라 주세요.");
  const values = fields(fd, type);
  if (!values.title) go(back(fd), "error", "제목을 적어 주세요.");

  if (id) {
    const { data, error } = await supabase.from("documents").update(values).eq("id", id).select("id");
    if (error || !data?.length) go(back(fd), "error", explain(error, "저장하지 못했어요. 이미 올린 문서는 고칠 수 없어요."));
    go(`/docs/${id}`, "msg", "저장했어요. 결재선을 확인하고 올려 주세요.");
  }
  const { data, error } = await supabase
    .from("documents")
    .insert({ doc_type: type, ...values })
    .select("id")
    .single();
  if (error || !data) go(back(fd), "error", explain(error, "저장하지 못했어요."));
  go(`/docs/${data.id}`, "msg", "저장했어요. 결재선을 확인하고 올려 주세요.");
}

// ------------------------------------------------------------ 상신 · 결재 · 회수 · 재기안 · 지우기
async function rpc(fd: FormData, fn: string, args: Record<string, unknown>, okText: string, failText: string) {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) go(back(fd), "error", explain(error, failText));
  go(back(fd), "msg", okText);
}

export async function submitDoc(fd: FormData) {
  await rpc(fd, "submit_document", { p_doc: str(fd, "id") }, "결재를 올렸어요. 첫 결재자에게 차례가 갔어요.", "올리지 못했어요.");
}

export async function approveDoc(fd: FormData) {
  await rpc(fd, "act_on_document",
    { p_doc: str(fd, "id"), p_action: "approve", p_opinion: str(fd, "opinion") || null },
    "결재했어요.", "결재하지 못했어요.");
}

export async function rejectDoc(fd: FormData) {
  if (!str(fd, "opinion")) go(back(fd), "error", "반려 사유를 적어 주세요.");
  await rpc(fd, "act_on_document",
    { p_doc: str(fd, "id"), p_action: "reject", p_opinion: str(fd, "opinion") },
    "반려했어요. 기안자에게 돌아갔어요.", "반려하지 못했어요.");
}

export async function cooperateDoc(fd: FormData) {
  const disagree = str(fd, "disagree") === "yes";
  if (disagree && !str(fd, "opinion")) go(back(fd), "error", "이견이 있으면 의견을 적어 주세요.");
  await rpc(fd, "act_on_document",
    { p_doc: str(fd, "id"), p_action: "confirm", p_opinion: str(fd, "opinion") || null, p_disagree: disagree },
    disagree ? "이견을 남겼어요. 결재는 계속 진행돼요." : "협조를 확인했어요.", "확인하지 못했어요.");
}

export async function withdrawDoc(fd: FormData) {
  await rpc(fd, "withdraw_document", { p_doc: str(fd, "id") },
    "회수했어요. 고쳐서 다시 올릴 수 있어요.", "회수하지 못했어요.");
}

export async function redraftDoc(fd: FormData) {
  await requireMember();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redraft_document", { p_doc: str(fd, "id") });
  if (error || !data) go(back(fd), "error", explain(error, "다시 올릴 문서를 만들지 못했어요."));
  go(`/docs/${data}?edit=1`, "msg", "반려된 내용을 복사했어요. 고친 뒤 저장하고 올려 주세요.");
}

export async function deleteDraft(fd: FormData) {
  await requireMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").delete().eq("id", str(fd, "id")).select("id");
  if (error || !data?.length) go(back(fd), "error", "지우지 못했어요. 한 번이라도 올린 문서는 지울 수 없어요.");
  go("/docs?tab=mine", "msg", "임시저장 문서를 지웠어요.");
}
