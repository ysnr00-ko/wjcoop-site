import Link from "next/link";
import { Card, Field, Notice, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { signInWithGoogle, signInWithPassword } from "../actions";

const REASONS: Record<string, string> = {
  inactive: "사용할 수 없는 계정입니다. 관리자에게 문의해 주세요.",
  not_invited: "초대받은 이메일로만 들어올 수 있어요. 관리자에게 초대를 요청해 주세요.",
  link: "링크가 만료됐거나 이미 사용됐어요. 다시 요청해 주세요.",
  signedout: "로그아웃했어요.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const { error, reason } = await searchParams;
  const reasonText = reason ? REASONS[reason] : undefined;
  return (
    <Card className="p-5">
      <Notice error={error ?? (reason !== "signedout" ? reasonText : undefined)} msg={reason === "signedout" ? reasonText : undefined} />
      <form action={signInWithPassword} className="space-y-4">
        <Field label="이메일">
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
        <Field label="비밀번호">
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
        <SubmitButton className="w-full">로그인</SubmitButton>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-stone-500">
        <span className="h-px flex-1 bg-stone-200" />
        또는
        <span className="h-px flex-1 bg-stone-200" />
      </div>

      <form action={signInWithGoogle}>
        <SubmitButton variant="secondary" className="w-full gap-2">
          <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          구글 계정으로 로그인
        </SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm">
        <Link href="/forgot" className="text-emerald-800 underline underline-offset-4">
          비밀번호를 잊었어요
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-stone-500">계정은 관리자가 초대한 직원만 쓸 수 있어요.</p>
    </Card>
  );
}
