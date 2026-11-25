import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/format";

export type Me = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  joinedAt: string | null;
  roles: { department: string; position: string }[];
};

/** 지금 로그인한 사람. 로그인하지 않았거나 비활성이면 null. */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: person } = await supabase
    .from("people")
    .select("id, name, email, is_admin, is_active, joined_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!person || !person.is_active) return null;

  const d = today();
  const { data: rows } = await supabase
    .from("assignments")
    .select("starts_on, ends_on, departments(name), positions(name, rank)")
    .eq("person_id", person.id)
    .lte("starts_on", d)
    .or(`ends_on.is.null,ends_on.gte.${d}`);

  type Row = {
    departments: { name: string } | null;
    positions: { name: string; rank: number } | null;
  };
  const roles = ((rows ?? []) as unknown as Row[])
    .sort((a, b) => (b.positions?.rank ?? 0) - (a.positions?.rank ?? 0))
    .map((r) => ({ department: r.departments?.name ?? "", position: r.positions?.name ?? "" }));

  return {
    id: person.id,
    name: person.name,
    email: person.email,
    isAdmin: person.is_admin,
    joinedAt: person.joined_at,
    roles,
  };
});

/** 로그인한 활성 직원만. 아니면 로그인 화면으로. */
export async function requireMember(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/auth/signout?reason=inactive");
  return me;
}

/** 관리자만. 아니면 '없는 화면'으로 보인다. */
export async function requireAdmin(): Promise<Me> {
  const me = await requireMember();
  if (!me.isAdmin) notFound();
  return me;
}
