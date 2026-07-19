import type { Step } from "../types.ts";
import { jsonPretty } from "../lib/format.ts";

function Section({ label, value }: { label: string; value: unknown }) {
  const text = jsonPretty(value);
  if (!text) return null;
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-faint uppercase tracking-wide text-[11px] mb-1">{label}</div>
      <pre className="whitespace-pre-wrap break-words text-[12px] text-[#a1a1aa] leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

export function StepDetail({ step }: { step: Step }) {
  const hasState = step.state_before != null || step.state_after != null;
  return (
    <div className="mt-2 ml-9 pr-4 pb-1">
      {step.error && (
        <div className="mt-3 first:mt-0">
          <div className="text-err uppercase tracking-wide text-[11px] mb-1">error</div>
          <pre className="whitespace-pre-wrap break-words text-[12px] text-err leading-relaxed">
            {step.error}
          </pre>
        </div>
      )}
      <Section label="input" value={step.input} />
      <Section label="output" value={step.output} />
      {hasState && (
        <>
          <Section label="state before" value={step.state_before} />
          <Section label="state after" value={step.state_after} />
        </>
      )}
    </div>
  );
}
