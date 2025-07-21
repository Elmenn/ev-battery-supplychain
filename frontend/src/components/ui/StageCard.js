import React from "react";

export const Card = ({ className = "", children, ...props }) => (
  <div
    className={`rounded-xl border border-gray-200 bg-white shadow ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const CardContent = ({ className = "", children, ...props }) => (
  <div className={`p-6 space-y-4 ${className}`} {...props}>
    {children}
  </div>
);

const StageCard = ({ title, children }) => (
  <Card className="w-full">
    <CardContent>
      <h4 className="text-lg font-semibold">{title}</h4>
      {children}
    </CardContent>
  </Card>
);

export default StageCard;
