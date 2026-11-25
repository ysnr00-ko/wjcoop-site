// 홈 화면 설치용 서비스 워커.
// 업무 자료는 언제나 최신이어야 하므로 화면을 저장해 두지 않는다(오프라인 캐시 없음).
// 인터넷이 끊겼을 때만 안내 문구를 보여준다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<body style="font-family:sans-serif;padding:2rem;text-align:center">' +
            "<h1>인터넷 연결이 끊겼어요</h1><p>연결된 뒤 다시 열어 주세요.</p></body>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        ),
    ),
  );
});
