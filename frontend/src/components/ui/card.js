import React from "react";

/** Lightweight stand-in for shadcn's <Card> */
export const Card = ({ className = "", children, ...props }) => (
  <div
    className={`rounded-xl border border-gray-200 bg-white shadow ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const CardContent = ({ className = "", children, ...props }) => (
  <div className={`p-6 space-y-6 ${className}`} {...props}>
    {children}
  </div>
);
