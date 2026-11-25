import Link from "next/link";
import { LinkButton, Notice, PageTitle, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { loadOrg } from "@/lib/org";
import { completeSetup } from "../actions";
import { DepartmentsSection, LinesSection, OrgSection, PeopleSection, PositionsSection } from "../sections";

const STEPS = [
  { title: "조직 정보", sub: "단체명, 로고, 직인, 영리·비영리" },
  { title: "부서", sub: "법인 아래에 부서를 나무 모양으로 달아요" },
  { title: "직책과 결재 순위", sub: "결재선에 쓰일 직책을 정해요" },
  { title: "직원 초대", sub: "이메일로 초대하면 직원이 비밀번호를 정하고 들어와요" },
  { title: "기본 결재선", sub: "부서별로 기안할 때 먼저 채워질 결재선" },
];

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; msg?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const step = Math.min(Math.max(Number(sp.step) || 1, 1), STEPS.length);
  const data = await loadOrg();
  const back = `/admin/setup?step=${step}`;
  const props = { data, back };

  return (
    <>
      <p className="mb-1 text-sm font-medium text-emerald-800">
        초기 설정 {step} / {STEPS.length}
      </p>
      <div className="mb-4 flex gap-1" aria-hidden>
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-emerald-600" : "bg-stone-200"}`} />
        ))}
      </div>
      <PageTitle sub={STEPS[step - 1].sub}>{STEPS[step - 1].title}</PageTitle>
      <Notice msg={sp.msg} error={sp.error} />

      {step === 1 && <OrgSection {...props} />}
      {step === 2 && <DepartmentsSection {...props} />}
      {step === 3 && <PositionsSection {...props} />}
      {step === 4 && <PeopleSection {...props} />}
      {step === 5 && <LinesSection {...props} />}

      <div className="mt-6 grid grid-cols-2 gap-2">
        {step > 1 ? <LinkButton href={`/admin/setup?step=${step - 1}`}>← 이전</LinkButton> : <span />}
        {step < STEPS.length ? (
          <Link href={`/admin/setup?step=${step + 1}`} className={buttonClass.primary}>
            다음 →
          </Link>
        ) : (
          <form action={completeSetup}>
            <input type="hidden" name="back" value={back} />
            <SubmitButton className="w-full">설정 마치기</SubmitButton>
          </form>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-stone-500">
        여기서 정한 내용은 나중에 설정 화면에서 언제든 바꿀 수 있어요. 문서번호·회계·회비 설정은 해당 기능을 만들 때 추가돼요.
      </p>
    </>
  );
}
