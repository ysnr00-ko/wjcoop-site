// 표기 규칙: 날짜 2026-11-25, 금액 1,234,000원. 시간은 한국 시간 기준.

const TZ = "Asia/Seoul";

/** 오늘 날짜 (한국 시간) YYYY-MM-DD */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const date = formatDate(d);
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${date} ${time}`;
}

export function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}
