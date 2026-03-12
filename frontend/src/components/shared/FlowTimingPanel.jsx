import React, { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import {
  attachFlowTimingDebugApi,
  exportFlowRunReport,
  getCurrentFlowRun,
  getFlowTimingUpdateEventName,
  resetFlowRun,
  startFlowRun,
} from "../../utils/flowTiming";

function summarizeMarks(marks = []) {
  return marks.slice(-8).reverse();
}

const FlowTimingPanel = () => {
  const [collapsed, setCollapsed] = useState(true);
  const [run, setRun] = useState(() => getCurrentFlowRun());

  useEffect(() => {
    attachFlowTimingDebugApi();
    const eventName = getFlowTimingUpdateEventName();
    const handleUpdate = (event) => {
      setRun(event.detail ?? getCurrentFlowRun());
    };
    window.addEventListener(eventName, handleUpdate);
    return () => window.removeEventListener(eventName, handleUpdate);
  }, []);

  const marks = useMemo(() => summarizeMarks(run?.marks || []), [run]);

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-80 rounded-xl border border-gray-300 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Flow Timing</div>
          <div className="text-[11px] text-gray-500">
            {run ? `${run.id} • ${run.marks?.length || 0} marks` : "No active run"}
          </div>
        </div>
        <button
          className="text-xs text-gray-500 hover:text-gray-700"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => startFlowRun("ui-panel")}>
              Start Run
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportFlowRunReport()} disabled={!run}>
              Export
            </Button>
            <Button size="sm" variant="ghost" onClick={() => resetFlowRun()}>
              Reset
            </Button>
          </div>

          <div className="text-xs text-gray-600">
            Start a run, complete the flow once, then export the JSON report.
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2">
            {marks.length === 0 ? (
              <div className="text-xs text-gray-500">No marks recorded yet.</div>
            ) : (
              marks.map((mark) => (
                <div key={`${mark.key}-${mark.atIso}`} className="rounded border border-gray-200 bg-white p-2">
                  <div className="text-xs font-medium text-gray-800">{mark.key}</div>
                  <div className="text-[11px] text-gray-500">{mark.atIso}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FlowTimingPanel;
