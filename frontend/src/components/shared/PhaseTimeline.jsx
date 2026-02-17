import React from "react";
import { Phase, PHASE_LABELS } from "../../utils/escrowHelpers";

// Standard 6 phases from the contract enum.
// There is NO "Slashed" phase -- slashing is an event within Expired state.
const DEFAULT_PHASES = [
  Phase.Listed,
  Phase.Purchased,
  Phase.OrderConfirmed,
  Phase.Bound,
  Phase.Delivered,
  Phase.Expired,
];

function getStepStyle(stepPhase, currentPhase) {
  if (stepPhase === Phase.Expired && currentPhase === Phase.Expired) {
    return { circle: "bg-red-500 text-white", line: "bg-red-300", label: "text-red-600 font-medium" };
  }
  if (stepPhase < currentPhase) {
    return { circle: "bg-green-500 text-white", line: "bg-green-400", label: "text-green-700" };
  }
  if (stepPhase === currentPhase) {
    return { circle: "bg-blue-500 text-white ring-2 ring-blue-300", line: "bg-gray-300", label: "text-blue-700 font-medium" };
  }
  return { circle: "bg-gray-300 text-gray-500", line: "bg-gray-300", label: "text-gray-400" };
}

/**
 * Adaptive phase timeline component.
 * Desktop: horizontal stepper with circles + connecting lines.
 * Mobile: vertical badge list.
 *
 * @param {{ currentPhase: number, phases?: number[] }} props
 */
export default function PhaseTimeline({ currentPhase, phases = DEFAULT_PHASES }) {
  return (
    <>
      {/* Desktop: horizontal stepper */}
      <div className="hidden md:flex items-center justify-between w-full">
        {phases.map((p, i) => {
          const style = getStepStyle(p, currentPhase);
          const isLast = i === phases.length - 1;
          return (
            <React.Fragment key={p}>
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${style.circle}`}>
                  {p < currentPhase ? "\u2713" : p + 1}
                </div>
                <span className={`mt-1 text-xs ${style.label}`}>{PHASE_LABELS[p]}</span>
              </div>
              {!isLast && (
                <div className={`flex-1 h-0.5 mx-2 ${style.line}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile: vertical badge list */}
      <div className="md:hidden space-y-2">
        {phases.map((p) => {
          const style = getStepStyle(p, currentPhase);
          return (
            <div key={p} className="flex items-center space-x-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${style.circle}`}>
                {p < currentPhase ? "\u2713" : ""}
              </div>
              <span className={`text-sm ${style.label}`}>{PHASE_LABELS[p]}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
