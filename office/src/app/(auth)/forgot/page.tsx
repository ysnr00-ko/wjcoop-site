import Link from "next/link";
import { Card, Field, Notice, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requestPasswordReset } from "../actions";

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  return (
    <Card className="p-5">
      <h1 className="mb-1 text-lg font-bold">비밀번호 재설정</h1>
      <p className="mb-4 text-sm text-stone-600">이메일을 넣으면 새 비밀번호를 정하는 링크를 보내 드려요.</p>
      <Notice msg={msg} />
      <form action={requestPasswordReset} className="space-y-4">
        <Field label="이메일">
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
        <SubmitButton className="w-full">재설정 메일 받기</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm">
        <Link href="/login" className="text-emerald-800 underline underline-offset-4">
          로그인 화면으로
        </Link>
      </p>
    </Card>
  );
}
