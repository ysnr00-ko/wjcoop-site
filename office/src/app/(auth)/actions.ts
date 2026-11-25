"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=" + encodeURIComponent("이메일과 비밀번호를 입력해 주세요."));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/login?error=" + encodeURIComponent("이메일 또는 비밀번호가 맞지 않습니다."));
  }
  redirect("/");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteUrl()}/auth/callback` },
  });
  if (error || !data.url) {
    redirect("/login?error=" + encodeURIComponent("구글 로그인을 시작하지 못했습니다. 잠시 뒤 다시 해 주세요."));
  }
  redirect(data.url);
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email) {
    const supabase = await createClient();
    // 등록 여부를 알려주지 않도록 결과와 상관없이 같은 안내를 보여준다
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await siteUrl()}/auth/confirm?next=/set-password`,
    });
  }
  redirect(
    "/forgot?msg=" +
      encodeURIComponent("등록된 이메일이면 비밀번호 재설정 메일을 보냈어요. 메일함을 확인해 주세요."),
  );
}

export async function setPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8)
    redirect("/set-password?error=" + encodeURIComponent("비밀번호는 8자 이상으로 정해 주세요."));
  if (password !== confirm)
    redirect("/set-password?error=" + encodeURIComponent("두 번 입력한 비밀번호가 다릅니다."));

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(
      "/set-password?error=" +
        encodeURIComponent("비밀번호를 저장하지 못했습니다. 링크가 만료됐으면 다시 요청해 주세요."),
    );
  }
  redirect("/?msg=" + encodeURIComponent("비밀번호를 정했어요. 다음부터 이 비밀번호로 로그인하면 됩니다."));
}
