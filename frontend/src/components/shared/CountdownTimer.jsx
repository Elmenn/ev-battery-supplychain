import React, { useState, useEffect } from "react";

function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function getColorClass(percentage) {
  if (percentage <= 10) return "text-red-600";
  if (percentage <= 25) return "text-yellow-600";
  return "text-green-600";
}

/**
 * Live countdown timer with color thresholds.
 * Green > 25%, yellow at <= 25%, red at <= 10%.
 *
 * @param {{ deadline: number, windowSeconds: number, label: string }} props
 *   deadline - Unix timestamp in seconds
 *   windowSeconds - Total window duration in seconds (for percentage calculation)
 *   label - Display label
 */
export default function CountdownTimer({ deadline, windowSeconds, label }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, deadline - Math.floor(Date.now() / 1000))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const r = Math.max(0, deadline - Math.floor(Date.now() / 1000));
      setRemaining(r);
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const percentage = windowSeconds > 0 ? (remaining / windowSeconds) * 100 : 0;
  const deadlineDate = new Date(deadline * 1000).toLocaleString();

  if (remaining <= 0) {
    return (
      <div className="font-mono">
        <span className="text-red-600 font-medium">{label}: Expired</span>
        <div className="text-xs text-gray-500">Deadline was {deadlineDate}</div>
      </div>
    );
  }

  return (
    <div className="font-mono">
      <span className={getColorClass(percentage)}>
        {label}: {formatTime(remaining)}
      </span>
      <div className="text-xs text-gray-500">Deadline: {deadlineDate}</div>
    </div>
  );
}
