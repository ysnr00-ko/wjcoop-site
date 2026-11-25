"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { today } from "@/lib/format";

// ------------------------------------------------------------ 공통
function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}
function back(fd: FormData) {
  const b = str(fd, "back");
  return b.startsWith("/admin/") && !b.startsWith("//") ? b : "/admin/settings/org";
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
function ok(fd: FormData, text: string): never {
  go(back(fd), "msg", text);
}
function fail(fd: FormData, text: string): never {
  go(back(fd), "error", text);
}

/** 데이터베이스 오류를 알아듣기 쉬운 말로 */
function explain(error: { message: string; code?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "23505") return "이미 같은 이름(또는 이메일)이 있어요.";
  if (error.code === "23503") return "다른 곳에서 쓰고 있어서 지울 수 없어요.";
  if (/[가-힣]/.test(error.message)) return error.message; // 데이터베이스가 한국어로 알려 준 이유
  return fallback;
}

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

function dayBefore(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// ------------------------------------------------------------ 조직 정보
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function saveOrg(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const name = str(fd, "name");
  if (!name) fail(fd, "단체명을 입력해 주세요.");

  const update: Record<string, unknown> = {
    name,
    is_nonprofit: str(fd, "is_nonprofit") !== "false",
    jeongyeol_violation: str(fd, "jeongyeol_violation") === "block" ? "block" : "warn",
    updated_at: new Date().toISOString(),
  };

  for (const kind of ["logo", "seal"] as const) {
    const file = fd.get(kind);
    if (file instanceof File && file.size > 0) {
      const ext = IMAGE_TYPES[file.type];
      if (!ext) fail(fd, "그림 파일(PNG, JPG, WEBP)만 올릴 수 있어요.");
      if (file.size > 2 * 1024 * 1024) fail(fd, "그림 파일은 2MB 이하로 올려 주세요.");
      const path = `${kind}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("org-assets").upload(path, file, { contentType: file.type });
      if (error) fail(fd, "그림을 올리지 못했어요. 잠시 뒤 다시 해 주세요.");
      update[`${kind}_path`] = path;
    }
  }

  const { error } = await supabase.from("org_settings").update(update).eq("id", 1);
  if (error) fail(fd, explain(error, "저장하지 못했어요."));
  ok(fd, "조직 정보를 저장했어요.");
}

// ------------------------------------------------------------ 부서
export async function addDepartment(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const name = str(fd, "name");
  if (!name) fail(fd, "부서 이름을 입력해 주세요.");
  const { error } = await supabase.from("departments").insert({
    name,
    parent_id: str(fd, "parent_id") || null,
    is_independent: fd.get("is_independent") === "on",
  });
  if (error) fail(fd, explain(error, "부서를 추가하지 못했어요."));
  ok(fd, `'${name}' 부서를 추가했어요.`);
}

export async function updateDepartment(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const name = str(fd, "name");
  if (!name) fail(fd, "부서 이름을 입력해 주세요.");
  const parent = str(fd, "parent_id");
  const patch: Record<string, unknown> = { name, is_independent: fd.get("is_independent") === "on" };
  if (fd.has("parent_id")) patch.parent_id = parent || null;
  const { error } = await supabase.from("departments").update(patch).eq("id", str(fd, "id"));
  if (error) fail(fd, explain(error, "부서를 고치지 못했어요."));
  ok(fd, "부서를 고쳤어요.");
}

export async function setDepartmentAbolished(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const abolish = str(fd, "abolish") === "true";
  const { error } = await supabase
    .from("departments")
    .update({ abolished_at: abolish ? new Date().toISOString() : null })
    .eq("id", str(fd, "id"));
  if (error) fail(fd, explain(error, "처리하지 못했어요."));
  ok(fd, abolish ? "부서를 폐지했어요. 기록은 그대로 남아요." : "부서를 다시 살렸어요.");
}

// ------------------------------------------------------------ 직책
export async function addPosition(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const name = str(fd, "name");
  const rank = Number(str(fd, "rank"));
  if (!name || !Number.isFinite(rank)) fail(fd, "직책 이름과 순위를 입력해 주세요.");
  const { error } = await supabase.from("positions").insert({ name, rank });
  if (error) fail(fd, explain(error, "직책을 추가하지 못했어요."));
  ok(fd, `'${name}' 직책을 추가했어요.`);
}

export async function updatePosition(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const name = str(fd, "name");
  const rank = Number(str(fd, "rank"));
  if (!name || !Number.isFinite(rank)) fail(fd, "직책 이름과 순위를 입력해 주세요.");
  const { error } = await supabase
    .from("positions")
    .update({ name, rank, is_active: fd.get("is_active") === "on" })
    .eq("id", str(fd, "id"));
  if (error) fail(fd, explain(error, "직책을 고치지 못했어요."));
  ok(fd, "직책을 고쳤어요.");
}

export async function deletePosition(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("positions").delete().eq("id", str(fd, "id"));
  if (error)
    fail(fd, error.code === "23503" ? "발령이나 결재선에 쓰인 직책이라 지울 수 없어요. 대신 '사용 안 함'으로 바꿔 주세요." : explain(error, "지우지 못했어요."));
  ok(fd, "직책을 지웠어요.");
}

// ------------------------------------------------------------ 직원 초대 · 발령 · 비활성
// 관리자 열쇠가 없거나 메일 발송이 실패해도 화면이 깨지지 않고 안내 문구가 나오도록 오류를 돌려준다
async function sendInvite(email: string): Promise<{ error: unknown }> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${await siteUrl()}/auth/confirm?next=/set-password`,
    });
    if (error) console.error("초대 메일 실패:", error.message);
    return { error };
  } catch (e) {
    console.error("초대 메일 실패:", e);
    return { error: e };
  }
}

export async function invitePerson(fd: FormData) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const department_id = str(fd, "department_id");
  const position_id = str(fd, "position_id");
  const starts_on = str(fd, "starts_on") || today();
  if (!name || !email) fail(fd, "이름과 이메일을 입력해 주세요.");
  if (!department_id || !position_id) fail(fd, "부서와 직책을 골라 주세요.");
  if (!isDate(starts_on)) fail(fd, "발령일 형식이 맞지 않아요.");

  const { data: person, error } = await supabase
    .from("people")
    .insert({ name, email, phone: str(fd, "phone") || null, is_admin: fd.get("is_admin") === "on" })
    .select("id")
    .single();
  if (error || !person) fail(fd, explain(error, "직원을 추가하지 못했어요."));

  const { error: aErr } = await supabase
    .from("assignments")
    .insert({ person_id: person.id, department_id, position_id, starts_on, note: "최초 발령", created_by: me.id });
  if (aErr) fail(fd, explain(aErr, "직원은 추가했지만 발령을 저장하지 못했어요. 직원 목록에서 발령을 추가해 주세요."));

  const { error: iErr } = await sendInvite(email);
  if (iErr) fail(fd, `${name}님을 추가했지만 초대 메일을 보내지 못했어요. 직원 목록에서 '초대 메일 다시 보내기'를 눌러 주세요.`);
  ok(fd, `${name}님에게 초대 메일을 보냈어요.`);
}

export async function resendInvite(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: p } = await supabase.from("people").select("email, joined_at, is_active").eq("id", str(fd, "id")).single();
  if (!p || !p.is_active) fail(fd, "비활성 직원에게는 보낼 수 없어요.");
  if (p.joined_at) fail(fd, "이미 가입한 직원이에요. 비밀번호를 잊었으면 로그인 화면의 '비밀번호를 잊었어요'를 쓰면 됩니다.");
  const { error } = await sendInvite(p.email);
  if (error) fail(fd, "초대 메일을 보내지 못했어요. 잠시 뒤 다시 해 주세요.");
  ok(fd, "초대 메일을 다시 보냈어요.");
}

export async function updatePerson(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const name = str(fd, "name");
  if (!name) fail(fd, "이름을 입력해 주세요.");
  const { error } = await supabase
    .from("people")
    .update({ name, phone: str(fd, "phone") || null, is_admin: fd.get("is_admin") === "on" })
    .eq("id", str(fd, "id"));
  if (error) fail(fd, explain(error, "고치지 못했어요."));
  ok(fd, "직원 정보를 고쳤어요.");
}

export async function addAssignment(fd: FormData) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const person_id = str(fd, "person_id");
  const department_id = str(fd, "department_id");
  const position_id = str(fd, "position_id");
  const starts_on = str(fd, "starts_on");
  if (!department_id || !position_id || !isDate(starts_on)) fail(fd, "부서, 직책, 발령일을 모두 넣어 주세요.");

  if (fd.get("end_others") === "on") {
    // 기존 직책은 새 발령 전날로 끝낸다 (겸직이면 체크를 끄면 된다)
    const { data: current } = await supabase
      .from("assignments")
      .select("id, starts_on, ends_on")
      .eq("person_id", person_id)
      .or(`ends_on.is.null,ends_on.gte.${starts_on}`);
    for (const a of current ?? []) {
      if (a.starts_on < starts_on) {
        const { error } = await supabase.from("assignments").update({ ends_on: dayBefore(starts_on) }).eq("id", a.id);
        if (error) fail(fd, explain(error, "기존 직책을 끝내지 못했어요."));
      } else if (a.starts_on > today()) {
        await supabase.from("assignments").delete().eq("id", a.id);
      } else {
        fail(fd, "같은 날 시작한 발령이 있어 자동으로 끝낼 수 없어요. 기존 발령의 종료일을 먼저 정해 주세요.");
      }
    }
  }

  const { error } = await supabase
    .from("assignments")
    .insert({ person_id, department_id, position_id, starts_on, note: str(fd, "note") || null, created_by: me.id });
  if (error) fail(fd, explain(error, "발령을 저장하지 못했어요."));
  ok(fd, starts_on > today() ? `발령을 등록했어요. ${starts_on}부터 자동으로 적용돼요.` : "발령을 등록했어요.");
}

export async function endAssignment(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const ends_on = str(fd, "ends_on");
  if (!isDate(ends_on)) fail(fd, "마지막 근무일을 넣어 주세요.");
  const { error } = await supabase.from("assignments").update({ ends_on }).eq("id", str(fd, "id"));
  if (error) fail(fd, "마지막 근무일은 시작일보다 앞설 수 없어요.");
  ok(fd, "직책 종료일을 저장했어요.");
}

export async function cancelAssignment(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error, count } = await supabase.from("assignments").delete({ count: "exact" }).eq("id", str(fd, "id"));
  if (error || !count) fail(fd, "이미 시작한 발령은 취소할 수 없어요. 대신 종료일을 정해 주세요.");
  ok(fd, "예정된 발령을 취소했어요.");
}

export async function signOutEverywhere(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_sign_out_everywhere", { p_person: str(fd, "id") });
  if (error) fail(fd, "로그아웃시키지 못했어요.");
  ok(fd, "그 사람의 모든 기기에서 로그아웃시켰어요.");
}

export async function setPersonActive(fd: FormData) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const id = str(fd, "id");
  const active = str(fd, "active") === "true";
  if (!active && id === me.id) fail(fd, "자기 자신은 비활성으로 바꿀 수 없어요.");

  const { data: p, error } = await supabase
    .from("people")
    .update({ is_active: active })
    .eq("id", id)
    .select("auth_user_id, name")
    .single();
  if (error || !p) fail(fd, explain(error, "바꾸지 못했어요."));

  if (!active) await supabase.rpc("admin_sign_out_everywhere", { p_person: id });
  if (p.auth_user_id) {
    // 비활성이면 로그인 자체를 막는다 (풀면 다시 로그인 가능)
    let banned = false;
    try {
      const { error: bErr } = await createAdminClient().auth.admin.updateUserById(p.auth_user_id, {
        ban_duration: active ? "none" : "876000h",
      });
      banned = !bErr;
    } catch {
      banned = false;
    }
    // 데이터 접근은 이미 막혔지만(비활성) 로그인 차단 설정은 실패한 경우
    if (!banned)
      fail(fd, active
        ? `${p.name}님을 활성으로 바꿨지만 로그인 허용 설정을 하지 못했어요. 관리자 열쇠 설정을 확인해 주세요.`
        : `${p.name}님을 비활성으로 바꿔 자료는 볼 수 없게 됐지만, 로그인 차단 설정은 하지 못했어요. 관리자 열쇠 설정을 확인해 주세요.`);
  }
  ok(fd, active ? `${p.name}님을 다시 활성으로 바꿨어요.` : `${p.name}님을 비활성으로 바꿨어요. 기록은 그대로 남아요.`);
}

// ------------------------------------------------------------ 결재선
export async function addLine(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const name = str(fd, "name");
  const department_id = str(fd, "department_id");
  if (!name || !department_id) fail(fd, "부서와 결재선 이름을 넣어 주세요.");
  const is_default = fd.get("is_default") === "on";
  if (is_default) {
    await supabase.from("approval_lines").update({ is_default: false }).eq("department_id", department_id).eq("doc_type", "expense");
  }
  const { error } = await supabase
    .from("approval_lines")
    .insert({ name, department_id, is_default, is_jeongyeol: fd.get("is_jeongyeol") === "on" });
  if (error) fail(fd, explain(error, "결재선을 만들지 못했어요."));
  ok(fd, `'${name}' 결재선을 만들었어요. 이제 단계를 추가해 주세요.`);
}

export async function setDefaultLine(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: line } = await supabase.from("approval_lines").select("department_id, doc_type").eq("id", str(fd, "id")).single();
  if (!line) fail(fd, "결재선을 찾지 못했어요.");
  await supabase.from("approval_lines").update({ is_default: false }).eq("department_id", line.department_id).eq("doc_type", line.doc_type);
  const { error } = await supabase.from("approval_lines").update({ is_default: true }).eq("id", str(fd, "id"));
  if (error) fail(fd, explain(error, "바꾸지 못했어요."));
  ok(fd, "기본 결재선으로 정했어요.");
}

export async function deleteLine(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("approval_lines").delete().eq("id", str(fd, "id"));
  if (error) fail(fd, explain(error, "지우지 못했어요."));
  ok(fd, "결재선을 지웠어요.");
}

export async function addStep(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const seq = Number(str(fd, "seq"));
  const step_type = str(fd, "step_type");
  if (!Number.isInteger(seq) || seq < 1) fail(fd, "순서는 1 이상의 숫자로 넣어 주세요.");
  if (!["approve", "cooperate", "jeongyeol_mark"].includes(step_type)) fail(fd, "단계 종류를 골라 주세요.");
  const { error } = await supabase
    .from("approval_line_steps")
    .insert({ line_id: str(fd, "line_id"), seq, position_id: str(fd, "position_id"), step_type });
  if (error) fail(fd, explain(error, "단계를 추가하지 못했어요."));
  ok(fd, "단계를 추가했어요.");
}

export async function deleteStep(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("approval_line_steps").delete().eq("id", str(fd, "id"));
  if (error) fail(fd, explain(error, "지우지 못했어요."));
  ok(fd, "단계를 지웠어요.");
}

// ------------------------------------------------------------ 예시값 채우기 (원주 네트워크 기본값)
export async function fillExample(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const kind = str(fd, "kind");

  if (kind === "departments") {
    const { data: existing } = await supabase.from("departments").select("id").limit(1);
    if (existing?.length) fail(fd, "이미 부서가 있어서 예시값을 넣지 않았어요.");
    const { data: root, error } = await supabase.from("departments").insert({ name: "법인", sort_order: 0 }).select("id").single();
    if (error || !root) fail(fd, explain(error, "넣지 못했어요."));
    // 여러 줄을 한 번에 넣을 때는 모든 줄에 같은 항목을 적어야 한다 (빠진 항목은 기본값이 아니라 빈 값이 됨)
    const { error: cErr } = await supabase.from("departments").insert([
      { name: "사무국", parent_id: root.id, is_independent: false, sort_order: 1 },
      { name: "산하센터", parent_id: root.id, is_independent: true, sort_order: 2 },
    ]);
    if (cErr) fail(fd, explain(cErr, "법인은 넣었지만 아래 부서를 넣지 못했어요."));
    ok(fd, "법인 → 사무국, 법인 → 산하센터(독립 운영)를 넣었어요. 이름은 바꿀 수 있어요.");
  }

  if (kind === "positions") {
    const defaults = [
      { name: "이사장", rank: 50 },
      { name: "센터장", rank: 40 },
      { name: "사무국장", rank: 40 },
      { name: "부장", rank: 30 },
      { name: "팀장", rank: 20 },
      { name: "직원", rank: 10 },
    ];
    const { data: existing } = await supabase.from("positions").select("name");
    const have = new Set((existing ?? []).map((p) => p.name));
    const toAdd = defaults.filter((d) => !have.has(d.name));
    if (toAdd.length) {
      const { error } = await supabase.from("positions").insert(toAdd);
      if (error) fail(fd, explain(error, "직책을 넣지 못했어요."));
    }
    ok(fd, "직책 예시값을 넣었어요 (이사장·센터장·사무국장·부장·팀장·직원).");
  }

  if (kind === "lines") {
    const [{ data: depts }, { data: pos }] = await Promise.all([
      supabase.from("departments").select("id, name"),
      supabase.from("positions").select("id, name"),
    ]);
    const d = (n: string) => depts?.find((x) => x.name === n)?.id;
    const p = (n: string) => pos?.find((x) => x.name === n)?.id;
    const need = [d("사무국"), d("산하센터"), p("이사장"), p("센터장"), p("사무국장"), p("부장"), p("팀장")];
    if (need.some((x) => !x))
      fail(fd, "예시 결재선을 넣으려면 부서(사무국, 산하센터)와 직책(이사장, 센터장, 사무국장, 부장, 팀장)이 먼저 있어야 해요.");

    const make = async (
      department: string,
      name: string,
      flags: { is_default: boolean; is_jeongyeol: boolean },
      steps: [number, string, LineStepType][],
      sort: number,
    ) => {
      const { data: line, error } = await supabase
        .from("approval_lines")
        .insert({ department_id: d(department), name, sort_order: sort, ...flags })
        .select("id")
        .single();
      if (error || !line) fail(fd, explain(error, "결재선을 넣지 못했어요. 이미 기본 결재선이 있으면 먼저 지워 주세요."));
      const { error: sErr } = await supabase
        .from("approval_line_steps")
        .insert(steps.map(([seq, position, step_type]) => ({ line_id: line.id, seq, position_id: p(position), step_type })));
      if (sErr) fail(fd, explain(sErr, `'${name}' 결재선의 단계를 넣지 못했어요.`));
    };
    await make("산하센터", "센터 · 전결", { is_default: true, is_jeongyeol: true }, [
      [1, "팀장", "approve"],
      [2, "부장", "approve"],
      [3, "센터장", "approve"],
      [3, "사무국장", "cooperate"],
      [4, "이사장", "jeongyeol_mark"],
    ], 1);
    await make("산하센터", "센터 · 전체", { is_default: false, is_jeongyeol: false }, [
      [1, "팀장", "approve"],
      [2, "부장", "approve"],
      [3, "센터장", "approve"],
      [3, "사무국장", "cooperate"],
      [4, "이사장", "approve"],
    ], 2);
    await make("사무국", "사무국", { is_default: true, is_jeongyeol: false }, [
      [1, "사무국장", "approve"],
      [2, "이사장", "approve"],
    ], 3);
    ok(fd, "계획서의 결재선 세 가지를 넣었어요.");
  }
  fail(fd, "알 수 없는 요청이에요.");
}
type LineStepType = "approve" | "cooperate" | "jeongyeol_mark";

// ------------------------------------------------------------ 초기 설정 마치기
export async function completeSetup(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: s }, { count: d }, { count: p }, { count: l }] = await Promise.all([
    supabase.from("org_settings").select("name").single(),
    supabase.from("departments").select("id", { count: "exact", head: true }),
    supabase.from("positions").select("id", { count: "exact", head: true }),
    supabase.from("approval_lines").select("id", { count: "exact", head: true }),
  ]);
  const missing = [
    !s?.name && "단체명",
    !d && "부서",
    !p && "직책",
    !l && "결재선",
  ].filter(Boolean);
  if (missing.length) fail(fd, `아직 비어 있는 항목이 있어요: ${missing.join(", ")}`);
  await supabase.from("org_settings").update({ setup_completed_at: new Date().toISOString() }).eq("id", 1);
  revalidatePath("/", "layout");
  redirect("/?msg=" + encodeURIComponent("초기 설정을 마쳤어요. 설정은 언제든 '설정' 메뉴에서 바꿀 수 있어요."));
}
