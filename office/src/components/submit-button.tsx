"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";

/** 누르면 처리하는 동안 '처리 중…'으로 바뀌고 다시 누를 수 없는 버튼 */
export function SubmitButton({
  children,
  variant = "primary",
  confirm,
  className = "",
  formAction,
}: {
  children: React.ReactNode;
  variant?: keyof typeof buttonClass;
  confirm?: string;
  className?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      formAction={formAction}
      className={`${buttonClass[variant]} ${className}`}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "처리 중…" : children}
    </button>
  );
}
