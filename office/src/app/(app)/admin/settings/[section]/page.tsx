import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageTitle } from "@/components/ui";
import { loadOrg } from "@/lib/org";
import { DepartmentsSection, LinesSection, LogSection, OrgSection, PeopleSection, PositionsSection } from "../../sections";

const TABS = [
  { key: "org", label: "조직" },
  { key: "departments", label: "부서" },
  { key: "positions", label: "직책" },
  { key: "people", label: "직원" },
  { key: "lines", label: "결재선" },
  { key: "log", label: "변경 기록" },
] as const;

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const { section } = await params;
  const sp = await searchParams;
  if (!TABS.some((t) => t.key === section)) notFound();
  const data = await loadOrg();
  const back = `/admin/settings/${section}`;
  const props = { data, back };

  return (
    <>
      <PageTitle sub="관리자만 볼 수 있는 화면이에요.">설정</PageTitle>
      <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/settings/${t.key}`}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
              t.key === section ? "bg-emerald-700 text-white" : "border border-stone-300 bg-white text-stone-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Notice msg={sp.msg} error={sp.error} />
      {section === "org" && <OrgSection {...props} />}
      {section === "departments" && <DepartmentsSection {...props} />}
      {section === "positions" && <PositionsSection {...props} />}
      {section === "people" && <PeopleSection {...props} />}
      {section === "lines" && <LinesSection {...props} />}
      {section === "log" && <LogSection />}
    </>
  );
}
