"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import type { DraftOptions } from "@/lib/docs-server";

/** 부서를 고르면 그 부서가 쓰는 결재선만 보여 준다 (전결로 끝낼지도 여기서 고름) */
export function LinePicker({
  options,
  departmentId,
  lineId,
}: {
  options: DraftOptions;
  departmentId?: string;
  lineId?: string | null;
}) {
  const [dept, setDept] = useState(departmentId || options.departments[0]?.id || "");
  const lines = options.lines.filter((l) => l.for_department === dept);
  const initial =
    (lineId && lines.find((l) => l.id === lineId)?.id) || lines.find((l) => l.is_default)?.id || lines[0]?.id || "";
  const [line, setLine] = useState(initial);
  const current = lines.some((l) => l.id === line) ? line : lines.find((l) => l.is_default)?.id || lines[0]?.id || "";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {options.departments.length > 1 ? (
        <Field label="부서">
          <select name="department_id" className={inputClass} value={dept} onChange={(e) => setDept(e.target.value)}>
            {options.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="department_id" value={dept} />
      )}
      <Field label="결재선" hint="전결로 끝낼지, 이사장까지 올릴지 여기서 골라요.">
        {lines.length ? (
          <select name="line_id" className={inputClass} value={current} onChange={(e) => setLine(e.target.value)}>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.is_default ? " (기본)" : ""}
              </option>
            ))}
          </select>
        ) : (
          <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">
            이 부서에는 결재선이 없어요. 관리자에게 결재선을 만들어 달라고 해 주세요.
          </p>
        )}
      </Field>
    </div>
  );
}
