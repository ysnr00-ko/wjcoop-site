import "server-only";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/format";

export type Department = {
  id: string;
  parent_id: string | null;
  name: string;
  is_independent: boolean;
  abolished_at: string | null;
  sort_order: number;
};
export type Position = { id: string; name: string; rank: number; is_active: boolean };
export type Person = {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  phone: string | null;
  is_admin: boolean;
  is_active: boolean;
  invited_at: string;
  joined_at: string | null;
  deactivated_at: string | null;
};
export type Assignment = {
  id: string;
  person_id: string;
  department_id: string;
  position_id: string;
  starts_on: string;
  ends_on: string | null;
  note: string | null;
};
export type LineStep = {
  id: string;
  line_id: string;
  seq: number;
  position_id: string;
  step_type: "approve" | "cooperate" | "jeongyeol_mark";
};
export type ApprovalLine = {
  id: string;
  department_id: string;
  doc_type: string;
  name: string;
  is_default: boolean;
  is_jeongyeol: boolean;
  allow_self_approval: boolean;
  is_active: boolean;
  sort_order: number;
  steps: LineStep[];
};
export type OrgSettings = {
  name: string;
  logo_path: string | null;
  seal_path: string | null;
  is_nonprofit: boolean;
  jeongyeol_violation: "warn" | "block";
  setup_completed_at: string | null;
};

export async function loadOrg() {
  const supabase = await createClient();
  const [settings, departments, positions, people, assignments, lines, steps] = await Promise.all([
    supabase.from("org_settings").select("name, logo_path, seal_path, is_nonprofit, jeongyeol_violation, setup_completed_at").maybeSingle(),
    supabase.from("departments").select("*").order("sort_order").order("created_at"),
    supabase.from("positions").select("*").order("rank", { ascending: false }).order("name"),
    supabase.from("people").select("*").order("is_active", { ascending: false }).order("name"),
    supabase.from("assignments").select("*").order("starts_on", { ascending: false }),
    supabase.from("approval_lines").select("*").order("sort_order").order("created_at"),
    supabase.from("approval_line_steps").select("*").order("seq"),
  ]);
  const allSteps = (steps.data ?? []) as LineStep[];
  return {
    settings: (settings.data ?? null) as OrgSettings | null,
    departments: (departments.data ?? []) as Department[],
    positions: (positions.data ?? []) as Position[],
    people: (people.data ?? []) as Person[],
    assignments: (assignments.data ?? []) as Assignment[],
    lines: ((lines.data ?? []) as Omit<ApprovalLine, "steps">[]).map((l) => ({
      ...l,
      steps: allSteps.filter((s) => s.line_id === l.id),
    })),
  };
}
export type OrgData = Awaited<ReturnType<typeof loadOrg>>;

export function isCurrent(a: Assignment, on = today()) {
  return a.starts_on <= on && (a.ends_on === null || a.ends_on >= on);
}

/** 부서를 나무 순서로 펼친다 (depth = 몇 단계 아래인지) */
export function flattenTree(departments: Department[]) {
  const out: (Department & { depth: number; path: string })[] = [];
  const walk = (parent: string | null, depth: number, prefix: string) => {
    departments
      .filter((d) => d.parent_id === parent)
      .forEach((d) => {
        const path = prefix ? `${prefix} › ${d.name}` : d.name;
        out.push({ ...d, depth, path });
        walk(d.id, depth + 1, path);
      });
  };
  walk(null, 0, "");
  return out;
}

export const STEP_LABEL: Record<LineStep["step_type"], string> = {
  approve: "결재",
  cooperate: "협조",
  jeongyeol_mark: "'전결' 표시만",
};
