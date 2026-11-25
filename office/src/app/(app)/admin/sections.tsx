import { Badge, Card, CardTitle, Field, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, today } from "@/lib/format";
import { STEP_LABEL, flattenTree, isCurrent, type OrgData } from "@/lib/org";
import * as A from "./actions";

type Props = { data: OrgData; back: string };

const Back = ({ back }: { back: string }) => <input type="hidden" name="back" value={back} />;
const selectClass = inputClass;

function ExampleButton({ kind, back, label }: { kind: string; back: string; label: string }) {
  return (
    <form action={A.fillExample}>
      <Back back={back} />
      <input type="hidden" name="kind" value={kind} />
      <SubmitButton variant="secondary" className="w-full">
        {label}
      </SubmitButton>
    </form>
  );
}

// =====================================================================
// 1. 조직 정보
// =====================================================================
export async function OrgSection({ data, back }: Props) {
  const s = data.settings;
  const supabase = await createClient();
  const signed = async (path: string | null | undefined) =>
    path ? (await supabase.storage.from("org-assets").createSignedUrl(path, 600)).data?.signedUrl : undefined;
  const [logoUrl, sealUrl] = await Promise.all([signed(s?.logo_path), signed(s?.seal_path)]);

  return (
    <Card>
      <CardTitle>조직 정보</CardTitle>
      <form action={A.saveOrg} className="space-y-4" encType="multipart/form-data">
        <Back back={back} />
        <Field label="단체명">
          <input name="name" defaultValue={s?.name || "사회적협동조합 원주협동사회경제네트워크"} required className={inputClass} />
        </Field>
        <Field label="법인 구분" hint="비영리를 고르면 회계에서 고유목적사업·수익사업 구분을 씁니다.">
          <select name="is_nonprofit" defaultValue={s?.is_nonprofit === false ? "false" : "true"} className={selectClass}>
            <option value="true">비영리</option>
            <option value="false">영리</option>
          </select>
        </Field>
        <Field label="전결 규정에 어긋난 결재선으로 올릴 때" hint="결재 기능(다음 단계)에서 쓰입니다.">
          <select name="jeongyeol_violation" defaultValue={s?.jeongyeol_violation ?? "warn"} className={selectClass}>
            <option value="warn">경고만 띄우기</option>
            <option value="block">올리지 못하게 막기</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="로고" hint="PNG·JPG, 2MB 이하">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl && <img src={logoUrl} alt="현재 로고" className="mb-2 h-16 w-16 rounded-lg border object-contain" />}
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm" />
          </Field>
          <Field label="직인" hint="관리자만 볼 수 있어요">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {sealUrl && <img src={sealUrl} alt="현재 직인" className="mb-2 h-16 w-16 rounded-lg border object-contain" />}
            <input name="seal" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm" />
          </Field>
        </div>
        <SubmitButton className="w-full">저장</SubmitButton>
      </form>
    </Card>
  );
}

// =====================================================================
// 2. 부서
// =====================================================================
export function DepartmentsSection({ data, back }: Props) {
  const tree = flattenTree(data.departments);
  const active = tree.filter((d) => !d.abolished_at);
  return (
    <div className="space-y-4">
      {tree.length === 0 && (
        <Card>
          <p className="mb-3 text-sm text-stone-600">
            아직 부서가 없어요. 맨 위 부서(법인)부터 만들거나, 계획서의 기본값을 한 번에 넣을 수 있어요.
          </p>
          <ExampleButton kind="departments" back={back} label="예시값 넣기 (법인 → 사무국, 산하센터)" />
        </Card>
      )}

      {tree.length > 0 && (
        <Card>
          <CardTitle>부서 구성</CardTitle>
          <ul className="space-y-2">
            {tree.map((d) => (
              <li key={d.id} style={{ marginLeft: `${d.depth * 1}rem` }}>
                <details className="rounded-xl border border-stone-200 bg-stone-50 open:bg-white">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3">
                    <span className="text-stone-400">{d.depth > 0 ? "└" : "■"}</span>
                    <span className={`font-medium ${d.abolished_at ? "text-stone-400 line-through" : ""}`}>{d.name}</span>
                    {d.is_independent && <Badge tone="emerald">독립 운영</Badge>}
                    {d.abolished_at && <Badge tone="red">폐지</Badge>}
                    <span className="ml-auto text-xs text-stone-500">고치기</span>
                  </summary>
                  <div className="space-y-3 border-t border-stone-200 p-3">
                    <form action={A.updateDepartment} className="space-y-3">
                      <Back back={back} />
                      <input type="hidden" name="id" value={d.id} />
                      <Field label="이름">
                        <input name="name" defaultValue={d.name} required className={inputClass} />
                      </Field>
                      {d.parent_id && (
                        <Field label="상위 부서">
                          <select name="parent_id" defaultValue={d.parent_id} className={selectClass}>
                            {active
                              .filter((x) => x.id !== d.id && !x.path.startsWith(`${d.path} ›`))
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.path}
                                </option>
                              ))}
                          </select>
                        </Field>
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="is_independent" defaultChecked={d.is_independent} className="h-5 w-5" />
                        독립 운영 (자기 결재선·장부·문서번호를 가짐)
                      </label>
                      <SubmitButton variant="secondary" className="w-full">
                        저장
                      </SubmitButton>
                    </form>
                    {d.parent_id && (
                      <form action={A.setDepartmentAbolished}>
                        <Back back={back} />
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="abolish" value={d.abolished_at ? "false" : "true"} />
                        <SubmitButton
                          variant={d.abolished_at ? "secondary" : "danger"}
                          className="w-full"
                          confirm={d.abolished_at ? undefined : `'${d.name}' 부서를 폐지할까요? 기록은 남아요.`}
                        >
                          {d.abolished_at ? "다시 살리기" : "폐지하기"}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>부서 추가</CardTitle>
        <form action={A.addDepartment} className="space-y-3">
          <Back back={back} />
          <Field label="부서 이름">
            <input name="name" required placeholder={tree.length ? "예: 센터 안의 팀" : "예: 법인"} className={inputClass} />
          </Field>
          {tree.length > 0 && (
            <Field label="상위 부서">
              <select name="parent_id" required className={selectClass}>
                {active.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.path}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_independent" className="h-5 w-5" />
            독립 운영
          </label>
          <SubmitButton className="w-full">추가</SubmitButton>
        </form>
      </Card>
    </div>
  );
}

// =====================================================================
// 3. 직책과 결재 순위
// =====================================================================
export function PositionsSection({ data, back }: Props) {
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>직책과 결재 순위</CardTitle>
        <p className="mb-3 text-sm text-stone-600">
          순위 숫자가 클수록 윗 직책이에요. 같은 숫자면 같은 급입니다 (예: 센터장·사무국장).
        </p>
        {data.positions.length === 0 && (
          <div className="mb-3">
            <ExampleButton kind="positions" back={back} label="예시값 넣기 (이사장·센터장·사무국장·부장·팀장·직원)" />
          </div>
        )}
        <ul className="space-y-2">
          {data.positions.map((p) => (
            <li key={p.id}>
              <details className="rounded-xl border border-stone-200 bg-stone-50 open:bg-white">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3">
                  <span className="w-8 text-center text-sm text-stone-500">{p.rank}</span>
                  <span className={`font-medium ${p.is_active ? "" : "text-stone-400 line-through"}`}>{p.name}</span>
                  {!p.is_active && <Badge>사용 안 함</Badge>}
                  <span className="ml-auto text-xs text-stone-500">고치기</span>
                </summary>
                <div className="space-y-3 border-t border-stone-200 p-3">
                  <form action={A.updatePosition} className="space-y-3">
                    <Back back={back} />
                    <input type="hidden" name="id" value={p.id} />
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Field label="이름">
                          <input name="name" defaultValue={p.name} required className={inputClass} />
                        </Field>
                      </div>
                      <Field label="순위">
                        <input name="rank" type="number" defaultValue={p.rank} required className={inputClass} />
                      </Field>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="is_active" defaultChecked={p.is_active} className="h-5 w-5" />
                      사용 중
                    </label>
                    <SubmitButton variant="secondary" className="w-full">
                      저장
                    </SubmitButton>
                  </form>
                  <form action={A.deletePosition}>
                    <Back back={back} />
                    <input type="hidden" name="id" value={p.id} />
                    <SubmitButton variant="danger" className="w-full" confirm={`'${p.name}' 직책을 지울까요?`}>
                      지우기
                    </SubmitButton>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardTitle>직책 추가</CardTitle>
        <form action={A.addPosition} className="grid grid-cols-3 gap-2">
          <Back back={back} />
          <div className="col-span-2">
            <Field label="이름">
              <input name="name" required placeholder="예: 팀장" className={inputClass} />
            </Field>
          </div>
          <Field label="순위">
            <input name="rank" type="number" required placeholder="20" className={inputClass} />
          </Field>
          <SubmitButton className="col-span-3">추가</SubmitButton>
        </form>
      </Card>
    </div>
  );
}

// =====================================================================
// 4. 직원 (초대 · 발령 · 비활성)
// =====================================================================
function DeptPositionFields({ data }: { data: OrgData }) {
  const depts = flattenTree(data.departments).filter((d) => !d.abolished_at);
  const positions = data.positions.filter((p) => p.is_active);
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="부서">
        <select name="department_id" required className={selectClass}>
          {depts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.path}
            </option>
          ))}
        </select>
      </Field>
      <Field label="직책">
        <select name="position_id" required className={selectClass}>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

export function PeopleSection({ data, back }: Props) {
  const deptName = (id: string) => flattenTree(data.departments).find((d) => d.id === id)?.path ?? "";
  const posName = (id: string) => data.positions.find((p) => p.id === id)?.name ?? "";
  const ready = data.departments.length > 0 && data.positions.length > 0;
  const t = today();

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>직원 초대</CardTitle>
        {!ready ? (
          <p className="text-sm text-stone-600">부서와 직책을 먼저 만들어 주세요.</p>
        ) : (
          <form action={A.invitePerson} className="space-y-3">
            <Back back={back} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="이름">
                <input name="name" required className={inputClass} />
              </Field>
              <Field label="휴대폰 (선택)">
                <input name="phone" type="tel" className={inputClass} />
              </Field>
            </div>
            <Field label="이메일" hint="이 주소로 초대 메일이 가요. 구글 로그인도 이 주소로만 됩니다.">
              <input name="email" type="email" required className={inputClass} />
            </Field>
            <DeptPositionFields data={data} />
            <Field label="발령일">
              <input name="starts_on" type="date" defaultValue={t} required className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_admin" className="h-5 w-5" />
              관리자 (설정 화면을 열 수 있음)
            </label>
            <SubmitButton className="w-full">초대 메일 보내기</SubmitButton>
          </form>
        )}
      </Card>

      <Card>
        <CardTitle>직원 목록 ({data.people.filter((p) => p.is_active).length}명)</CardTitle>
        <ul className="space-y-2">
          {data.people.map((p) => {
            const mine = data.assignments.filter((a) => a.person_id === p.id);
            const current = mine.filter((a) => isCurrent(a, t));
            const future = mine.filter((a) => a.starts_on > t);
            return (
              <li key={p.id}>
                <details className="rounded-xl border border-stone-200 bg-stone-50 open:bg-white">
                  <summary className="cursor-pointer list-none px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium ${p.is_active ? "" : "text-stone-400"}`}>{p.name}</span>
                      {p.is_admin && <Badge tone="emerald">관리자</Badge>}
                      {!p.is_active ? <Badge tone="red">비활성</Badge> : !p.joined_at ? <Badge tone="amber">초대함 · 아직 안 들어옴</Badge> : null}
                      <span className="ml-auto text-xs text-stone-500">고치기</span>
                    </div>
                    <p className="mt-1 text-sm text-stone-600">
                      {current.length
                        ? current.map((a) => `${deptName(a.department_id)} ${posName(a.position_id)}`).join(" · ")
                        : "현재 직책 없음"}
                      {future.length > 0 && <span className="text-amber-700"> · 예정 발령 {future.length}건</span>}
                    </p>
                  </summary>

                  <div className="space-y-4 border-t border-stone-200 p-3">
                    <p className="text-sm text-stone-600">{p.email}</p>

                    {p.is_active && (
                      <form action={A.updatePerson} className="space-y-3">
                        <Back back={back} />
                        <input type="hidden" name="id" value={p.id} />
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="이름">
                            <input name="name" defaultValue={p.name} required className={inputClass} />
                          </Field>
                          <Field label="휴대폰">
                            <input name="phone" type="tel" defaultValue={p.phone ?? ""} className={inputClass} />
                          </Field>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="is_admin" defaultChecked={p.is_admin} className="h-5 w-5" />
                          관리자
                        </label>
                        <SubmitButton variant="secondary" className="w-full">
                          저장
                        </SubmitButton>
                      </form>
                    )}

                    <div>
                      <h3 className="mb-2 text-sm font-semibold">발령 이력</h3>
                      <ul className="space-y-2 text-sm">
                        {mine.map((a) => (
                          <li key={a.id} className="rounded-lg bg-stone-100 p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>
                                {deptName(a.department_id)} <b>{posName(a.position_id)}</b>
                              </span>
                              {isCurrent(a, t) && <Badge tone="emerald">현재</Badge>}
                              {a.starts_on > t && <Badge tone="amber">예정</Badge>}
                            </div>
                            <p className="text-stone-600">
                              {a.starts_on} ~ {a.ends_on ?? ""} {a.note && `· ${a.note}`}
                            </p>
                            {p.is_active && a.starts_on > t ? (
                              <form action={A.cancelAssignment} className="mt-2">
                                <Back back={back} />
                                <input type="hidden" name="id" value={a.id} />
                                <SubmitButton variant="small" confirm="예정된 발령을 취소할까요?">
                                  예정 발령 취소
                                </SubmitButton>
                              </form>
                            ) : p.is_active && !a.ends_on ? (
                              <form action={A.endAssignment} className="mt-2 flex items-center gap-2">
                                <Back back={back} />
                                <input type="hidden" name="id" value={a.id} />
                                <input name="ends_on" type="date" required min={a.starts_on} className="rounded-lg border border-stone-300 px-2 py-1.5" />
                                <SubmitButton variant="small">이날까지 근무로 끝내기</SubmitButton>
                              </form>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {p.is_active && (
                      <form action={A.addAssignment} className="space-y-3 rounded-xl border border-dashed border-stone-300 p-3">
                        <Back back={back} />
                        <input type="hidden" name="person_id" value={p.id} />
                        <h3 className="text-sm font-semibold">새 인사발령</h3>
                        <DeptPositionFields data={data} />
                        <Field label="발령일" hint="오늘 이후 날짜면 그날 자동으로 적용돼요.">
                          <input name="starts_on" type="date" defaultValue={t} required className={inputClass} />
                        </Field>
                        <Field label="메모 (선택)">
                          <input name="note" placeholder="예: 정기 인사" className={inputClass} />
                        </Field>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="end_others" defaultChecked className="h-5 w-5" />
                          기존 직책은 발령 전날로 끝내기 (겸직이면 체크 해제)
                        </label>
                        <SubmitButton variant="secondary" className="w-full">
                          발령 등록
                        </SubmitButton>
                      </form>
                    )}

                    <div className="grid gap-2">
                      {p.is_active && !p.joined_at && (
                        <form action={A.resendInvite}>
                          <Back back={back} />
                          <input type="hidden" name="id" value={p.id} />
                          <SubmitButton variant="secondary" className="w-full">
                            초대 메일 다시 보내기
                          </SubmitButton>
                        </form>
                      )}
                      {p.is_active && p.joined_at && (
                        <form action={A.signOutEverywhere}>
                          <Back back={back} />
                          <input type="hidden" name="id" value={p.id} />
                          <SubmitButton
                            variant="secondary"
                            className="w-full"
                            confirm={`${p.name}님의 모든 기기에서 로그아웃시킬까요? (휴대폰을 잃어버렸을 때)`}
                          >
                            모든 기기에서 로그아웃
                          </SubmitButton>
                        </form>
                      )}
                      <form action={A.setPersonActive}>
                        <Back back={back} />
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="active" value={p.is_active ? "false" : "true"} />
                        <SubmitButton
                          variant={p.is_active ? "danger" : "secondary"}
                          className="w-full"
                          confirm={
                            p.is_active
                              ? `${p.name}님을 비활성으로 바꿀까요? 로그인할 수 없게 되지만 기안·결재 기록은 남아요.`
                              : undefined
                          }
                        >
                          {p.is_active ? "비활성으로 바꾸기 (퇴사 등)" : "다시 활성으로 바꾸기"}
                        </SubmitButton>
                      </form>
                      {p.deactivated_at && <p className="text-xs text-stone-500">비활성: {formatDateTime(p.deactivated_at)}</p>}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

// =====================================================================
// 5. 기본 결재선
// =====================================================================
export function LinesSection({ data, back }: Props) {
  const depts = flattenTree(data.departments).filter((d) => !d.abolished_at);
  const posName = (id: string) => data.positions.find((p) => p.id === id)?.name ?? "";
  const positions = data.positions.filter((p) => p.is_active);

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-stone-600">
          결재선은 사람이 아니라 <b>직책</b>으로 정해요. 인사발령이 나면 다음 문서부터 새 담당자에게 자동으로 갑니다. 기안자는
          항상 첫 칸이라 따로 넣지 않아요. <b>순서 숫자가 같은 단계는 동시에</b> 진행돼요 (예: 센터장 결재와 사무국장 협조).
        </p>
        {data.lines.length === 0 && (
          <div className="mt-3">
            <ExampleButton kind="lines" back={back} label="계획서의 결재선 3가지 넣기" />
          </div>
        )}
      </Card>

      {depts.map((d) => {
        const lines = data.lines.filter((l) => l.department_id === d.id);
        if (!lines.length) return null;
        return (
          <Card key={d.id}>
            <CardTitle>{d.path}</CardTitle>
            <ul className="space-y-3">
              {lines.map((l) => {
                const seqs = [...new Set(l.steps.map((s) => s.seq))].sort((a, b) => a - b);
                const next = (seqs.at(-1) ?? 0) + 1;
                return (
                  <li key={l.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-medium">{l.name}</span>
                      {l.is_default && <Badge tone="emerald">기본</Badge>}
                      {l.is_jeongyeol && <Badge tone="amber">전결</Badge>}
                    </div>
                    {/* 결재 흐름 */}
                    <ol className="flex flex-wrap items-center gap-1 text-sm">
                      <li className="rounded-lg bg-stone-100 px-2 py-1">기안자</li>
                      {seqs.map((seq) => (
                        <li key={seq} className="flex items-center gap-1">
                          <span className="text-stone-400">→</span>
                          <span className="flex flex-col gap-1">
                            {l.steps
                              .filter((s) => s.seq === seq)
                              .map((s) => (
                                <span
                                  key={s.id}
                                  className={`rounded-lg px-2 py-1 ${
                                    s.step_type === "approve"
                                      ? "bg-emerald-50 text-emerald-900"
                                      : s.step_type === "cooperate"
                                        ? "bg-sky-50 text-sky-900"
                                        : "border border-dashed border-stone-300 text-stone-500"
                                  }`}
                                >
                                  {posName(s.position_id)}
                                  {s.step_type !== "approve" && ` (${STEP_LABEL[s.step_type]})`}
                                </span>
                              ))}
                          </span>
                        </li>
                      ))}
                    </ol>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-emerald-800">단계 고치기</summary>
                      <div className="mt-3 space-y-3">
                        <ul className="space-y-1 text-sm">
                          {l.steps.map((s) => (
                            <li key={s.id} className="flex items-center gap-2">
                              <span className="w-6 text-center text-stone-500">{s.seq}</span>
                              <span className="flex-1">
                                {posName(s.position_id)} · {STEP_LABEL[s.step_type]}
                              </span>
                              <form action={A.deleteStep}>
                                <Back back={back} />
                                <input type="hidden" name="id" value={s.id} />
                                <SubmitButton variant="small">빼기</SubmitButton>
                              </form>
                            </li>
                          ))}
                        </ul>
                        <form action={A.addStep} className="grid grid-cols-6 gap-2">
                          <Back back={back} />
                          <input type="hidden" name="line_id" value={l.id} />
                          <div className="col-span-1">
                            <Field label="순서">
                              <input name="seq" type="number" min={1} defaultValue={next} required className={inputClass} />
                            </Field>
                          </div>
                          <div className="col-span-3">
                            <Field label="직책">
                              <select name="position_id" required className={selectClass}>
                                {positions.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          </div>
                          <div className="col-span-2">
                            <Field label="종류">
                              <select name="step_type" className={selectClass}>
                                <option value="approve">결재</option>
                                <option value="cooperate">협조</option>
                                <option value="jeongyeol_mark">전결 표시</option>
                              </select>
                            </Field>
                          </div>
                          <SubmitButton variant="secondary" className="col-span-6">
                            단계 추가
                          </SubmitButton>
                        </form>
                        <div className="grid grid-cols-2 gap-2">
                          {!l.is_default && (
                            <form action={A.setDefaultLine}>
                              <Back back={back} />
                              <input type="hidden" name="id" value={l.id} />
                              <SubmitButton variant="secondary" className="w-full">
                                기본으로
                              </SubmitButton>
                            </form>
                          )}
                          <form action={A.deleteLine} className={l.is_default ? "col-span-2" : ""}>
                            <Back back={back} />
                            <input type="hidden" name="id" value={l.id} />
                            <SubmitButton variant="danger" className="w-full" confirm={`'${l.name}' 결재선을 지울까요?`}>
                              결재선 지우기
                            </SubmitButton>
                          </form>
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      <Card>
        <CardTitle>결재선 추가</CardTitle>
        {depts.length === 0 ? (
          <p className="text-sm text-stone-600">부서를 먼저 만들어 주세요.</p>
        ) : (
          <form action={A.addLine} className="space-y-3">
            <Back back={back} />
            <Field label="부서">
              <select name="department_id" required className={selectClass}>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.path}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="결재선 이름">
              <input name="name" required placeholder="예: 센터 · 전결" className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_jeongyeol" className="h-5 w-5" />
              전결 결재선
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_default" className="h-5 w-5" />이 부서의 기본 결재선으로
            </label>
            <SubmitButton className="w-full">만들기</SubmitButton>
          </form>
        )}
      </Card>
    </div>
  );
}

// =====================================================================
// 변경 기록
// =====================================================================
const TABLE_LABEL: Record<string, string> = {
  org_settings: "조직 정보",
  departments: "부서",
  positions: "직책",
  people: "직원",
  assignments: "인사발령",
  approval_lines: "결재선",
  approval_line_steps: "결재 단계",
};
const ACTION_LABEL: Record<string, string> = { INSERT: "추가", UPDATE: "변경", DELETE: "삭제" };
const IGNORE = new Set(["updated_at", "created_at"]);

export async function LogSection() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("id, at, actor_name, table_name, action, old_data, new_data")
    .order("at", { ascending: false })
    .limit(100);

  return (
    <Card>
      <CardTitle>최근 변경 기록 (100건)</CardTitle>
      <ul className="divide-y divide-stone-100 text-sm">
        {(data ?? []).map((r) => {
          const n = (r.new_data ?? {}) as Record<string, unknown>;
          const o = (r.old_data ?? {}) as Record<string, unknown>;
          const changed =
            r.action === "UPDATE"
              ? Object.keys(n).filter((k) => !IGNORE.has(k) && JSON.stringify(n[k]) !== JSON.stringify(o[k]))
              : [];
          const label = (n.name ?? o.name ?? "") as string;
          return (
            <li key={r.id} className="py-2">
              <p>
                <b>{r.actor_name ?? "시스템"}</b> · {TABLE_LABEL[r.table_name] ?? r.table_name} {ACTION_LABEL[r.action]}
                {label && ` · ${label}`}
              </p>
              {changed.length > 0 && <p className="text-stone-600">바뀐 항목: {changed.join(", ")}</p>}
              <p className="text-xs text-stone-500">{formatDateTime(r.at)}</p>
            </li>
          );
        })}
      </ul>
      {!data?.length && <p className="text-sm text-stone-500">아직 기록이 없어요.</p>}
      <p className="mt-3 text-xs text-stone-500">기록은 지우거나 고칠 수 없어요. 기준일 {formatDate(new Date())}</p>
    </Card>
  );
}

