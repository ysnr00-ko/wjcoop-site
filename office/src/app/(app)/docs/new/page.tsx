import Link from "next/link";
import { Card, Notice, PageTitle } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { DOC_TYPES, type DocType } from "@/lib/docs";
import { loadDraftOptions } from "@/lib/docs-server";
import { DocForm } from "../doc-form";

export default async function NewDocPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const me = await requireMember();
  const type = DOC_TYPES.find((t) => t.key === sp.type)?.key as DocType | undefined;

  if (!type) {
    return (
      <>
        <PageTitle sub="어떤 문서를 올릴까요?">새 문서</PageTitle>
        <Notice error={sp.error} />
        <div className="space-y-3">
          {DOC_TYPES.map((t) => (
            <Link key={t.key} href={`/docs/new?type=${t.key}`} className="block">
              <Card className="hover:border-emerald-600">
                <p className="text-base font-semibold text-stone-900">{t.label}</p>
                <p className="mt-1 text-sm text-stone-600">{t.sub}</p>
              </Card>
            </Link>
          ))}
        </div>
      </>
    );
  }

  const options = await loadDraftOptions(me.id);
  const label = DOC_TYPES.find((t) => t.key === type)!.label;
  return (
    <>
      <PageTitle sub="새 문서">{label}</PageTitle>
      <Notice error={sp.error} />
      {options.departments.length ? (
        <DocForm type={type} options={options} back={`/docs/new?type=${type}`} />
      ) : (
        <Notice error="아직 발령된 부서가 없어서 기안할 수 없어요. 관리자에게 인사발령을 요청해 주세요." />
      )}
    </>
  );
}
