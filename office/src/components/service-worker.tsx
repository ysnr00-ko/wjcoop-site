"use client";

import { useEffect } from "react";

/** 휴대폰 홈 화면 설치를 위해 서비스 워커를 등록한다 */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
