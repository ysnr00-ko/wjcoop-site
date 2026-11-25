"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle, buttonClass } from "@/components/ui";

type InstallEvent = Event & { prompt: () => Promise<void> };

/** 휴대폰 홈 화면에 설치하는 방법 안내 (이미 설치해서 앱으로 열었으면 숨김) */
export function InstallGuide() {
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);

  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || "standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) return null;
  return (
    <Card>
      <CardTitle>휴대폰 홈 화면에 설치하기</CardTitle>
      {prompt ? (
        <button className={`${buttonClass.primary} w-full`} onClick={() => prompt.prompt()}>
          홈 화면에 설치
        </button>
      ) : isIos ? (
        <ol className="list-inside list-decimal space-y-1 text-sm text-stone-700">
          <li>사파리(Safari)로 이 화면을 열어요.</li>
          <li>아래쪽 가운데 <b>공유 버튼</b>(네모에 위쪽 화살표)을 눌러요.</li>
          <li><b>홈 화면에 추가</b>를 누르고, 오른쪽 위 <b>추가</b>를 눌러요.</li>
        </ol>
      ) : (
        <ol className="list-inside list-decimal space-y-1 text-sm text-stone-700">
          <li>크롬(Chrome)으로 이 화면을 열어요.</li>
          <li>오른쪽 위 <b>점 세 개</b> 메뉴를 눌러요.</li>
          <li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 눌러요.</li>
        </ol>
      )}
      <p className="mt-2 text-xs text-stone-500">설치하면 앱처럼 열리고, 로그인도 계속 유지돼요.</p>
    </Card>
  );
}
