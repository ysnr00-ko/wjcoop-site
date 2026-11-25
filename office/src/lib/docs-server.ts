import "server-only";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/format";

export type DraftOptions = {
  departments: { id: string; name: string }[];
  lines: { id: string; name: string; department_id: string; for_department: string; is_default: boolean }[];
};

/** 기안할 때 고를 수 있는 부서(내가 오늘 발령된 부서)와 그 부서가 쓰는 결재선 */
export async function loadDraftOptions(personId: string): Promise<DraftOptions> {
  const supabase = await createClient();
  const d = today();
  const { data: rows } = await supabase
    .from("assignments")
    .select("department_id, departments(name)")
    .eq("person_id", personId)
    .lte("starts_on", d)
    .or(`ends_on.is.null,ends_on.gte.${d}`);
  type Row = { department_id: string; departments: { name: string } | null };
  const seen = new Set<string>();
  const departments = ((rows ?? []) as unknown as Row[])
    .filter((r) => (seen.has(r.department_id) ? false : (seen.add(r.department_id), true)))
    .map((r) => ({ id: r.department_id, name: r.departments?.name ?? "" }));

  const lines: DraftOptions["lines"] = [];
  for (const dep of departments) {
    // 자기 결재선이 없으면 위 부서의 결재선을 쓴다
    const { data: lineDept } = await supabase.rpc("line_department", { p_department: dep.id });
    if (!lineDept) continue;
    const { data: ls } = await supabase
      .from("approval_lines")
      .select("id, name, department_id, is_default, sort_order")
      .eq("department_id", lineDept)
      .eq("is_active", true)
      .order("sort_order");
    for (const l of ls ?? [])
      lines.push({ id: l.id, name: l.name, department_id: l.department_id, for_department: dep.id, is_default: l.is_default });
  }
  return { departments, lines };
}
