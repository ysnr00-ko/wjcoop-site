import { redirect } from "next/navigation";
import { Card, Field, Notice, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { setPassword } from "../actions";

// 초대 메일 또는 비밀번호 재설정 메일의 링크를 누르면 오는 화면
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=link");

  return (
    <Card className="p-5">
      <h1 className="mb-1 text-lg font-bold">비밀번호 정하기</h1>
      <p className="mb-4 text-sm text-stone-600">{user.email} 계정의 비밀번호를 정해 주세요. 8자 이상이면 됩니다.</p>
      <Notice error={error} />
      <form action={setPassword} className="space-y-4">
        <input type="email" name="username" autoComplete="username" defaultValue={user.email} hidden readOnly />
        <Field label="새 비밀번호">
          <input name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
        </Field>
        <Field label="한 번 더 입력">
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
        </Field>
        <SubmitButton className="w-full">저장하고 시작하기</SubmitButton>
      </form>
    </Card>
  );
}
