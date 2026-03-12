const STORAGE_KEY = "ev.flowTiming.currentRun";
const UPDATE_EVENT = "ev-flow-timing-update";

function nowIso() {
  return new Date().toISOString();
}

function readRun() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRun(run) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: run }));
  return run;
}

function makeRun(reason = "manual") {
  return {
    id: `flow-${Date.now()}`,
    reason,
    startedAtIso: nowIso(),
    startedAtEpochMs: Date.now(),
    marks: [],
  };
}

export function getCurrentFlowRun() {
  return readRun();
}

export function startFlowRun(reason = "manual") {
  return writeRun(makeRun(reason));
}

export function resetFlowRun() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: null }));
}

export function ensureFlowRun(reason = "auto") {
  return readRun() || startFlowRun(reason);
}

export function markFlowStep(key, data = {}) {
  const run = ensureFlowRun("auto");
  const nextMark = {
    key,
    atIso: nowIso(),
    atEpochMs: Date.now(),
    atPerfMs: typeof performance !== "undefined" ? performance.now() : null,
    route: `${window.location.pathname}${window.location.search || ""}`,
    data,
  };
  const nextRun = {
    ...run,
    marks: [...(run.marks || []), nextMark],
    lastUpdatedAtIso: nextMark.atIso,
  };
  return writeRun(nextRun);
}

export function getFlowRunReport() {
  const run = readRun();
  if (!run) return null;

  const marks = Array.isArray(run.marks) ? run.marks : [];
  const timeline = marks.map((mark, index) => {
    const previous = marks[index - 1];
    return {
      ...mark,
      sinceRunStartMs:
        typeof mark.atPerfMs === "number" && typeof marks[0]?.atPerfMs === "number"
          ? mark.atPerfMs - marks[0].atPerfMs
          : null,
      sincePreviousMs:
        previous && typeof mark.atPerfMs === "number" && typeof previous.atPerfMs === "number"
          ? mark.atPerfMs - previous.atPerfMs
          : null,
    };
  });

  return {
    ...run,
    exportedAtIso: nowIso(),
    markCount: timeline.length,
    timeline,
  };
}

export function exportFlowRunReport() {
  const report = getFlowRunReport();
  if (!report) {
    throw new Error("No timing run available to export.");
  }

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.id}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return report;
}

export function attachFlowTimingDebugApi() {
  window.__evFlowTiming = {
    startFlowRun,
    resetFlowRun,
    getCurrentFlowRun,
    getFlowRunReport,
    exportFlowRunReport,
    markFlowStep,
  };
}

export function getFlowTimingUpdateEventName() {
  return UPDATE_EVENT;
}
