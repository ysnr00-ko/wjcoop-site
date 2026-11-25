import { formatDateTime } from "@/lib/format";
import type { DocStep, PreviewStep } from "@/lib/docs";

type Box = {
  key: string;
  position: string;
  name: string | null;
  state: string;
  tone: "done" | "now" | "wait" | "off" | "mark" | "bad";
  when?: string | null;
};

const toneClass: Record<Box["tone"], string> = {
  done: "border-emerald-300 bg-emerald-50",
  now: "border-amber-400 bg-amber-50 ring-2 ring-amber-300",
  wait: "border-stone-200 bg-white",
  off: "border-dashed border-stone-200 bg-stone-50 text-stone-400",
  mark: "border-dashed border-stone-300 bg-white",
  bad: "border-red-300 bg-red-50",
};

function stepBox(s: DocStep | PreviewStep, i: number): Box {
  const base = { key: `${s.seq}-${s.position_name}-${i}`, position: s.position_name, name: s.assignee_name };
  switch (s.status) {
    case "approved":
      return {
        ...base,
        tone: "done",
        state:
          s.step_type === "cooperate"
            ? "disagree" in s && s.disagree ? "이견" : "확인"
            : "skip_reason" in s && s.skip_reason === "본인 결재" ? "본인 결재" : "결재",
        when: "acted_at" in s ? s.acted_at : null,
      };
    case "rejected":
      return { ...base, tone: "bad", state: "반려", when: "acted_at" in s ? s.acted_at : null };
    case "pending":
      return { ...base, tone: "now", state: "차례" };
    case "waiting":
      return { ...base, tone: "wait", state: "대기" };
    case "skipped":
      return { ...base, tone: "off", state: "건너뜀" };
    case "marked":
      return { ...base, name: null, tone: "mark", state: "전결" };
    case "problem":
      return { ...base, tone: "bad", state: "맡은 사람 없음" };
  }
}

function Row({ label, boxes }: { label: string; boxes: Box[] }) {
  if (!boxes.length) return null;
  return (
    <div className="flex items-stretch gap-1.5">
      <div className="flex w-6 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-xs font-medium text-stone-600 [writing-mode:vertical-rl]">
        {label}
      </div>
      <div className="grid flex-1 grid-cols-3 gap-1.5 sm:grid-cols-5">
        {boxes.map((b) => (
          <div key={b.key} className={`rounded-lg border px-1.5 py-2 text-center ${toneClass[b.tone]}`}>
            <p className="text-xs text-stone-500">{b.position}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-stone-900">{b.name ?? " "}</p>
            <p className="mt-0.5 text-xs font-medium">{b.state}</p>
            {b.when && <p className="text-[10px] leading-tight text-stone-500">{formatDateTime(b.when).slice(5)}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 결재란: 기안자 → 결재 단계 (같은 순서는 동시에), 협조는 아랫줄 */
export function ApprovalBox({
  drafter,
  submittedAt,
  steps,
}: {
  drafter: { position: string; name: string };
  submittedAt?: string | null;
  steps: (DocStep | PreviewStep)[];
}) {
  const main: Box[] = [
    { key: "drafter", position: drafter.position || "기안", name: drafter.name, tone: submittedAt ? "done" : "wait", state: "기안", when: submittedAt },
    ...steps.filter((s) => s.step_type !== "cooperate").map(stepBox),
  ];
  const coop = steps.filter((s) => s.step_type === "cooperate").map(stepBox);
  return (
    <div className="space-y-1.5">
      <Row label="결재" boxes={main} />
      <Row label="협조" boxes={coop} />
    </div>
  );
}
