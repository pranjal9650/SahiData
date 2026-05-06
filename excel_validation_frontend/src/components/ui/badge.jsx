import React from "react";
import { cn } from "../../lib/utils";

const Badge = React.forwardRef(({ className, variant = "default", ...props }, ref) => {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-red-500",
        {
          "bg-red-600 text-white": variant === "default",
          "bg-red-100 text-red-800": variant === "secondary",
          "bg-emerald-100 text-emerald-800": variant === "success",
          "bg-red-800 text-white": variant === "destructive",
          "bg-gray-100 text-gray-800": variant === "outline",
          "bg-amber-100 text-amber-800": variant === "warning",
        },
        className
      )}
      {...props}
    />
  );
});

Badge.displayName = "Badge";

export { Badge };
