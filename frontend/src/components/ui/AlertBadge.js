import React from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";

const colors = {
  success: "bg-green-100 text-green-700 ring-green-600/20",
  error: "bg-red-100 text-red-700 ring-red-600/20",
};

export const AlertBadge = ({ variant = "success", children }) => {
  const Icon = variant === "success" ? CheckCircle2 : AlertTriangle;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium ring-1 ${colors[variant]}`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </span>
  );
};
