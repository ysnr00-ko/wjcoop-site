import type { MetadataRoute } from "next";

// 휴대폰 홈 화면에 설치할 때 쓰는 정보
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "원주협동사회경제네트워크 업무 시스템",
    short_name: "업무",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#047857",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
