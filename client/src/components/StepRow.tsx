import { useState } from "react";
import type { Step } from "../types.ts";
import { fmtCost, fmtDuration, fmtTokens, typeBadge } from "../lib/format.ts";
import { StepDetail } from "./StepDetail.tsx";

export function StepRow({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);

  const meta: string[] = [];
  if (step.tokens != null) meta.push(fmtTokens(step.tokens));
  if (step.cost != null) meta.push(fmtCost(step.cost));
  meta.push(fmtDuration(step.latency_ms));

  return (
    <div className="relative pl-7 py-1.5 animate-slide-in">
      {/* connector node on the timeline's vertical line */}
      <span
        className={`absolute left-[6px] top-[11px] w-[7px] h-[7px] rounded-full ring-2 ring-bg ${
          step.error ? "bg-err" : "bg-[#3f3f46]"
        }`}
      />
      <div
        className="flex items-baseline gap-3 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-faint w-9 shrink-0 tabular-nums">#{step.seq}</span>
        <span className={`text-[11px] px-1.5 py-px rounded ${typeBadge(step.type)}`}>
          {step.type}
        </span>
        <span className="text-ink truncate">{step.name}</span>
        <span className="ml-auto text-muted text-[12px] whitespace-nowrap tabular-nums">
          {meta.join(" · ")}
          {step.error && <span className="text-err ml-2">ERROR</span>}
        </span>
      </div>
      {open && <StepDetail step={step} />}
    </div>
  );
}
