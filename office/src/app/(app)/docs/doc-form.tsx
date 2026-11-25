import { Card, Field, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LEAVE_KINDS, type Doc, type DocType } from "@/lib/docs";
import type { DraftOptions } from "@/lib/docs-server";
import { saveDraft } from "./actions";
import { LinePicker } from "./line-picker";

/** 새 문서 · 임시저장 문서 고치기 양식 */
export function DocForm({
  type,
  doc,
  options,
  back,
}: {
  type: DocType;
  doc?: Doc;
  options: DraftOptions;
  back: string;
}) {
  return (
    <Card>
      <form action={saveDraft} className="space-y-4">
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="doc_type" value={type} />
        {doc && <input type="hidden" name="id" value={doc.id} />}

        <Field label="제목">
          <input
            name="title"
            required
            defaultValue={doc?.title}
            className={inputClass}
            placeholder={type === "expense" ? "예: 12월 사무용품 구입" : type === "leave" ? "예: 12월 연차 신청" : "예: 홍보물 제작 품의"}
          />
        </Field>

        <LinePicker options={options} departmentId={doc?.department_id} lineId={doc?.line_id} />

        {type === "expense" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="금액 (원)">
                <input
                  name="amount"
                  inputMode="numeric"
                  defaultValue={doc?.amount ?? ""}
                  className={inputClass}
                  placeholder="250000"
                />
              </Field>
              <Field label="지출 예정일">
                <input type="date" name="pay_date" defaultValue={doc?.pay_date ?? ""} className={inputClass} />
              </Field>
            </div>
            <Field label="사용처">
              <input name="payee" defaultValue={doc?.payee ?? ""} className={inputClass} placeholder="예: ○○문구" />
            </Field>
            <Field label="사용 내역">
              <textarea name="body" rows={4} defaultValue={doc?.body} className={inputClass} placeholder="무엇을, 왜, 얼마나" />
            </Field>
          </>
        )}

        {type === "proposal" && (
          <Field label="내용">
            <textarea name="body" rows={8} defaultValue={doc?.body} className={inputClass} />
          </Field>
        )}

        {type === "leave" && (
          <>
            <Field label="종류">
              <select name="leave_kind" defaultValue={doc?.leave_kind ?? "연차"} className={inputClass}>
                {LEAVE_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작일">
                <input type="date" name="period_start" defaultValue={doc?.period_start ?? ""} className={inputClass} />
              </Field>
              <Field label="종료일">
                <input type="date" name="period_end" defaultValue={doc?.period_end ?? ""} className={inputClass} />
              </Field>
            </div>
            <Field label="출장지 (출장일 때)">
              <input name="place" defaultValue={doc?.place ?? ""} className={inputClass} />
            </Field>
            <Field label="사유">
              <textarea name="body" rows={3} defaultValue={doc?.body} className={inputClass} />
            </Field>
          </>
        )}

        <SubmitButton className="w-full">저장하고 결재선 확인</SubmitButton>
        <p className="text-center text-xs text-stone-500">저장만 해요. 다음 화면에서 결재선을 보고 [결재 올리기]를 눌러야 올라가요.</p>
      </form>
    </Card>
  );
}
