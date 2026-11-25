// 전자결재 문서: 종류 · 상태 이름, 금액 한글 표기

export type DocType = "expense" | "proposal" | "leave";
export type DocStatus = "draft" | "in_progress" | "approved" | "rejected";
export type StepStatus = "waiting" | "pending" | "approved" | "rejected" | "skipped" | "marked";

export type Doc = {
  id: string;
  doc_no: string | null;
  doc_type: DocType;
  status: DocStatus;
  title: string;
  department_id: string;
  drafter_id: string;
  line_id: string | null;
  body: string;
  amount: number | null;
  payee: string | null;
  pay_date: string | null;
  leave_kind: string | null;
  period_start: string | null;
  period_end: string | null;
  place: string | null;
  drafter_name: string | null;
  drafter_position: string | null;
  department_name: string | null;
  line_name: string | null;
  is_jeongyeol: boolean;
  self_approved: boolean;
  redraft_of: string | null;
  created_at: string;
  submitted_at: string | null;
  completed_at: string | null;
};

export type DocStep = {
  id: string;
  document_id: string;
  seq: number;
  step_type: "approve" | "cooperate" | "jeongyeol_mark";
  position_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  status: StepStatus;
  skip_reason: string | null;
  opinion: string | null;
  disagree: boolean;
  seen_at: string | null;
  acted_at: string | null;
};

export type PreviewStep = {
  seq: number;
  step_type: DocStep["step_type"];
  position_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  status: "waiting" | "skipped" | "marked" | "problem";
  note: string | null;
};

export const DOC_TYPES: { key: DocType; label: string; sub: string }[] = [
  { key: "expense", label: "지출결의서", sub: "돈을 쓰기 전에 결재를 받아요" },
  { key: "proposal", label: "품의서 · 기안문", sub: "돈과 상관없는 일반 결재" },
  { key: "leave", label: "출장 · 휴가 신청", sub: "기간과 사유를 적어요" },
];
export const DOC_TYPE_LABEL: Record<DocType, string> = {
  expense: "지출결의서",
  proposal: "품의서",
  leave: "출장·휴가",
};

export const DOC_STATUS: Record<DocStatus, { label: string; tone: "stone" | "emerald" | "amber" | "red" }> = {
  draft: { label: "임시저장", tone: "stone" },
  in_progress: { label: "결재 중", tone: "amber" },
  approved: { label: "결재 완료", tone: "emerald" },
  rejected: { label: "반려", tone: "red" },
};

export const LEAVE_KINDS = ["출장", "연차", "반차", "병가", "경조사", "기타"] as const;

const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL = ["", "십", "백", "천"];
const BIG = ["", "만", "억", "조"];

/** 1234000 → "일백이십삼만사천" (결의서에 쓰는 한글 금액) */
export function amountToHangul(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "영";
  let out = "";
  let group = 0;
  let rest = Math.floor(n);
  while (rest > 0 && group < BIG.length) {
    const chunk = rest % 10000;
    if (chunk > 0) {
      let part = "";
      const ds = String(chunk).padStart(4, "0").split("").map(Number);
      ds.forEach((d, i) => {
        if (d > 0) part += DIGITS[d] + SMALL[3 - i];
      });
      out = part + BIG[group] + out;
    }
    rest = Math.floor(rest / 10000);
    group++;
  }
  return out;
}
