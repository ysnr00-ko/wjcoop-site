import Link from "next/link";
import type { ReactNode } from "react";

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-bold text-stone-900">{children}</h1>
      {sub && <p className="mt-1 text-sm text-stone-600">{sub}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-base font-semibold text-stone-900">{children}</h2>;
}

/** 성공·오류 안내 (주소의 ?msg= / ?error= 를 보여줌) */
export function Notice({ msg, error }: { msg?: string; error?: string }) {
  if (error)
    return (
      <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </p>
    );
  if (msg)
    return (
      <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {msg}
      </p>
    );
  return null;
}

export const inputClass =
  "block w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export const buttonClass = {
  primary:
    "inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50",
  secondary:
    "inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50",
  danger:
    "inline-flex min-h-11 items-center justify-center rounded-xl border border-red-300 bg-white px-4 py-2.5 text-base font-medium text-red-700 hover:bg-red-50 disabled:opacity-50",
  small:
    "inline-flex min-h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-50",
};

export function LinkButton({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof buttonClass;
}) {
  return (
    <Link href={href} className={buttonClass[variant]}>
      {children}
    </Link>
  );
}

export function Badge({ children, tone = "stone" }: { children: ReactNode; tone?: "stone" | "emerald" | "amber" | "red" }) {
  const tones = {
    stone: "bg-stone-100 text-stone-700",
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
