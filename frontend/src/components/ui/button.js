import React from "react";
import { Loader2 } from "lucide-react";

export const Button = ({
  variant = "default",
  icon: Icon,          // optional leading icon
  isLoading = false,   // shows spinner + disables button
  className = "",
  children,
  ...props
}) => {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-medium " +
    "ring-offset-background transition-colors focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50 px-4 py-2 gap-2";

  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
    ghost:
        "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:ring-1",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {!isLoading && Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
};
