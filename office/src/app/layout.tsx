import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  title: "업무 시스템",
  description: "원주협동사회경제네트워크 업무 시스템",
  appleWebApp: { capable: true, title: "업무", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#047857",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-dvh bg-stone-50 text-stone-900 antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
