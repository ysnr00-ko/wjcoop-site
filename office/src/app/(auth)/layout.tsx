export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="mx-auto mb-3 h-14 w-14 rounded-2xl" />
        <p className="text-sm text-stone-600">원주협동사회경제네트워크</p>
        <p className="text-lg font-bold">업무 시스템</p>
      </div>
      {children}
    </main>
  );
}
